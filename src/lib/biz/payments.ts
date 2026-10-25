import "server-only";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { customers, db, orders, payments, subscriptions, type DB } from "@/db";
import { audit, SYSTEM, type Actor } from "./audit";
import { code, nextNumber } from "./counters";
import { ledgerTotals, paymentStatus } from "./core";
import { BizError } from "./customers";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;
export type Payment = typeof payments.$inferSelect;

export const METHODS = ["UPI", "CASH", "BANK", "RAZORPAY", "OTHER"] as const;
export const METHOD_LABELS: Record<string, string> = { UPI: "UPI / Google Pay", CASH: "Cash", BANK: "Bank transfer", RAZORPAY: "Razorpay", OTHER: "Other" };

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505");

const cleanRef = (r?: string | null) => {
  const v = (r ?? "").trim().replace(/^UPI\s+/i, "").replace(/\s+/g, "");
  return v ? v.toUpperCase() : null;
};

export const paymentInput = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  subscriptionId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  amount: z.number().int().positive("Enter the amount received"),
  method: z.enum(METHODS),
  reference: z.string().trim().max(60).optional().nullable(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  /** RECEIVED = money is in your account; PENDING_VERIFICATION = check it later. */
  status: z.enum(["RECEIVED", "PENDING_VERIFICATION"]).default("RECEIVED"),
  note: z.string().trim().max(300).default(""),
});
export type PaymentInput = z.input<typeof paymentInput>;

async function insertPayment(tx: Tx, values: Omit<typeof payments.$inferInsert, "receiptNo">) {
  const n = await nextNumber(tx, "receipt");
  const [p] = await tx.insert(payments).values({ ...values, receiptNo: code("RCPT", n) }).returning();
  return p;
}

/** Admin: record money received (cash, UPI, bank…). Duplicate references are refused. */
export async function recordPayment(input: PaymentInput, actor: Actor) {
  const d = paymentInput.parse(input);
  const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, d.customerId));
  if (!cust) throw new BizError("Customer not found.");
  let orderId = d.orderId ?? null;
  if (d.subscriptionId) {
    const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, d.subscriptionId));
    if (!s || s.customerId !== d.customerId) throw new BizError("That plan doesn't belong to this customer.");
    if (s.status === "CANCELLED") throw new BizError("That plan is cancelled. Record the payment against a new plan instead.");
    orderId = orderId ?? s.paymentOrderId;
  }
  const reference = cleanRef(d.reference);
  if (d.method === "UPI" && reference && !/^\d{12}$/.test(reference)) throw new BizError("A UPI transaction ID (UTR) has 12 digits.");
  let p: Payment;
  try {
    p = await db.transaction(async (tx) => {
      const row = await insertPayment(tx, {
        customerId: d.customerId,
        subscriptionId: d.subscriptionId ?? null,
        orderId,
        type: "PAYMENT",
        amount: d.amount,
        method: d.method,
        reference,
        status: d.status,
        paidAt: d.paidAt ? new Date(`${d.paidAt}T12:00:00+05:30`) : new Date(),
        recordedBy: actor.name,
        verifiedBy: d.status === "RECEIVED" ? actor.name : null,
        verifiedAt: d.status === "RECEIVED" ? new Date() : null,
        note: d.note,
      });
      await audit(tx, "payment", row.id, d.status === "RECEIVED" ? "recorded as received" : "recorded, to verify", { after: row, actor });
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const [dup] = await db.select({ receiptNo: payments.receiptNo }).from(payments).where(and(eq(payments.method, d.method), eq(payments.reference, reference!)));
      throw new BizError(`This ${d.method === "UPI" ? "UPI transaction ID" : "reference"} is already recorded${dup ? ` (${dup.receiptNo})` : ""}.`);
    }
    throw e;
  }
  await afterPaymentChange(p, actor);
  await billingAfter(p, actor);
  return p;
}

async function changeStatus(id: string, from: string[], to: string, action: string, actor: Actor, reason = "") {
  const p = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(payments).where(eq(payments.id, id));
    if (!before) throw new BizError("Payment not found.");
    if (!from.includes(before.status)) throw new BizError(`This payment is ${before.status.toLowerCase().replace(/_/g, " ")}.`);
    const [after] = await tx
      .update(payments)
      .set({ status: to, ...(to === "RECEIVED" ? { verifiedBy: actor.name, verifiedAt: new Date() } : {}) })
      .where(eq(payments.id, id))
      .returning();
    await audit(tx, "payment", id, action, { before: { status: before.status }, after: { status: to }, reason, actor });
    return after;
  });
  await afterPaymentChange(p, actor);
  await billingAfter(p, actor);
  return p;
}

/** "I've checked my bank/Google Pay — the money is there." */
export const verifyPayment = (id: string, actor: Actor) => changeStatus(id, ["PENDING_VERIFICATION"], "RECEIVED", "verified as received", actor);
export const failPayment = (id: string, reason: string, actor: Actor) => changeStatus(id, ["PENDING_VERIFICATION"], "FAILED", "marked not received", actor, reason);
/** A payment recorded by mistake. The row stays, marked reversed, with the reason. */
export function reversePayment(id: string, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new BizError("Say why this payment is being reversed.");
  return changeStatus(id, ["RECEIVED", "PENDING_VERIFICATION"], "REVERSED", "reversed", actor, reason);
}

/** Money paid back to the customer. Recorded as its own ledger row. */
export async function recordRefund(
  d: { customerId: string; subscriptionId?: string | null; orderId?: string | null; amount: number; method: string; reference?: string | null; reason: string },
  actor: Actor,
) {
  if (d.amount <= 0) throw new BizError("Enter the refund amount.");
  if (d.reason.trim().length < 3) throw new BizError("Say why the money is being refunded.");
  const ledger = await ledgerFor({ subscriptionId: d.subscriptionId, orderId: d.subscriptionId ? null : d.orderId });
  if (d.amount > ledger.net) throw new BizError(`You can refund up to ₹${(ledger.net / 100).toFixed(2)} (what was received).`);
  try {
    const refund = await db.transaction(async (tx) => {
      const row = await insertPayment(tx, {
        customerId: d.customerId,
        subscriptionId: d.subscriptionId ?? null,
        orderId: d.orderId ?? null,
        type: "REFUND",
        amount: d.amount,
        method: d.method,
        reference: cleanRef(d.reference),
        status: "RECEIVED",
        recordedBy: actor.name,
        verifiedBy: actor.name,
        verifiedAt: new Date(),
        note: d.reason,
      });
      await audit(tx, "payment", row.id, "refund recorded", { after: row, reason: d.reason, actor });
      return row;
    });
    const { creditNoteForRefund } = await import("./invoices");
    await creditNoteForRefund(refund.id, actor).catch((e) => console.error("[credit note failed]", e));
    return refund;
  } catch (e) {
    if (isUniqueViolation(e)) throw new BizError("This refund reference is already recorded.");
    throw e;
  }
}

export async function ledgerFor(by: { subscriptionId?: string | null; orderId?: string | null; customerId?: string | null }) {
  const where = by.subscriptionId
    ? eq(payments.subscriptionId, by.subscriptionId)
    : by.orderId
      ? eq(payments.orderId, by.orderId)
      : eq(payments.customerId, by.customerId!);
  const rows = await db.select().from(payments).where(where).orderBy(desc(payments.paidAt));
  return { rows, ...ledgerTotals(rows) };
}

export async function subscriptionMoney(sub: { id: string; total: number }) {
  const l = await ledgerFor({ subscriptionId: sub.id });
  return { ...l, status: paymentStatus(sub.total, l.rows), due: Math.max(0, sub.total - l.net) };
}

/**
 * After the ledger changes: a fully paid plan or order is marked paid
 * (which activates a plan and sends the usual notifications).
 */
async function afterPaymentChange(p: Payment, actor: Actor) {
  if (p.type !== "PAYMENT" || p.status !== "RECEIVED") return;
  const { markOrderPaid } = await import("../orders");
  if (p.subscriptionId) {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, p.subscriptionId));
    if (!sub) return;
    const l = await ledgerFor({ subscriptionId: sub.id });
    if (l.net < sub.total) return;
    if (sub.paymentOrderId) {
      await markOrderPaid(sub.paymentOrderId, { paymentId: null, method: p.method === "UPI" ? "UPI (Google Pay)" : p.method, fromLedger: true, actor });
    } else if (sub.status === "PENDING_PAYMENT") {
      const { activateSubscription } = await import("../plans");
      await activateSubscription(sub.id, actor, "Paid in full");
    }
    return;
  }
  if (p.orderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, p.orderId));
    if (!o || o.paymentStatus === "PAID") return;
    const l = await ledgerFor({ orderId: o.id });
    if (l.net >= o.total) await markOrderPaid(o.id, { paymentId: null, method: p.method, fromLedger: true, actor });
  }
}

// ---------------- Website payment hooks ----------------

/** Customer typed their UTR on the order page → a ledger row waiting for the owner to check. */
export async function recordUpiClaim(tx: Tx, o: typeof orders.$inferSelect, utr: string) {
  const reference = cleanRef(utr)!;
  const [existing] = await tx.select().from(payments).where(and(eq(payments.type, "PAYMENT"), eq(payments.method, "UPI"), eq(payments.reference, reference)));
  if (existing) {
    if (existing.orderId !== o.id) throw new BizError("That transaction ID is already linked to another order. Please check it and try again.");
    if (existing.status === "FAILED") await tx.update(payments).set({ status: "PENDING_VERIFICATION" }).where(eq(payments.id, existing.id));
    return;
  }
  const row = await insertPayment(tx, {
    customerId: o.customerId,
    subscriptionId: o.kind === "PLAN" ? o.subscriptionId : null,
    orderId: o.id,
    type: "PAYMENT",
    amount: o.total,
    method: "UPI",
    reference,
    status: "PENDING_VERIFICATION",
    recordedBy: "Customer (website)",
    note: `Reported on order ${o.orderNumber}`,
  });
  await audit(tx, "payment", row.id, "reported by customer", { after: row, actor: { id: o.userId, name: `${o.customerName} (customer)` } });
}

/** Owner rejected a UPI payment the customer reported. */
export async function failUpiClaims(orderId: string, reason: string, actor: Actor) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, "PENDING_VERIFICATION")));
    if (!rows.length) return;
    await tx.update(payments).set({ status: "FAILED" }).where(inArray(payments.id, rows.map((r) => r.id)));
    for (const r of rows) await audit(tx, "payment", r.id, "marked not received", { before: { status: r.status }, after: { status: "FAILED" }, reason, actor });
  });
}

/** An order was paid (owner confirmed UPI, or Razorpay verified it): make sure the ledger shows the money. */
export async function ledgerForPaidOrder(o: typeof orders.$inferSelect, info: { paymentId: string | null; method?: string | null }, actor: Actor = SYSTEM) {
  if (o.total <= 0) return;
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(eq(payments.orderId, o.id));
    const pending = rows.filter((r) => r.status === "PENDING_VERIFICATION" && r.type === "PAYMENT");
    for (const r of pending) {
      await tx.update(payments).set({ status: "RECEIVED", verifiedBy: actor.name, verifiedAt: new Date() }).where(eq(payments.id, r.id));
      await audit(tx, "payment", r.id, "verified as received", { before: { status: r.status }, after: { status: "RECEIVED" }, actor });
    }
    const t = ledgerTotals(rows.map((r) => (pending.includes(r) ? { ...r, status: "RECEIVED" } : r)));
    if (t.net >= o.total) return;
    const isUpi = /upi/i.test(info.method ?? "") || /^UPI\s/i.test(info.paymentId ?? "");
    const row = await insertPayment(tx, {
      customerId: o.customerId,
      subscriptionId: o.kind === "PLAN" ? o.subscriptionId : null,
      orderId: o.id,
      type: "PAYMENT",
      amount: o.total - t.net,
      method: isUpi ? "UPI" : info.paymentId ? "RAZORPAY" : "OTHER",
      reference: cleanRef(info.paymentId),
      status: "RECEIVED",
      recordedBy: isUpi ? actor.name : "Razorpay (verified)",
      verifiedBy: actor.name,
      verifiedAt: new Date(),
      note: `Order ${o.orderNumber}`,
    });
    await audit(tx, "payment", row.id, "received", { after: row, actor });
  }).catch((e) => {
    // The same gateway payment arriving twice (callback + webhook) is fine.
    if (!isUniqueViolation(e)) throw e;
  });
  const { syncBillingSafe } = await import("./invoices");
  await syncBillingSafe(o.kind === "PLAN" && o.subscriptionId ? { subscriptionId: o.subscriptionId } : { orderId: o.id }, actor);
}

/** Invoice issue / payment link / paid status — never blocks the payment itself. */
async function billingAfter(p: Payment, actor: Actor) {
  const { syncBillingSafe } = await import("./invoices");
  await syncBillingSafe(p.subscriptionId ? { subscriptionId: p.subscriptionId } : { orderId: p.orderId }, actor);
}
