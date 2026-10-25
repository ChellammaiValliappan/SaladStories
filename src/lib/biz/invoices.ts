import "server-only";
import crypto from "crypto";
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { customers, db, invoices, orders, payments, storeSettings, subscriptions, type InvoiceLine, type PartySnapshot } from "@/db";
import { addressLine } from "../notify";
import { formatDateLong, istParts } from "../time";
import { audit, SYSTEM, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { BizError } from "./customers";

export type Invoice = typeof invoices.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const INVOICE_STATUS_LABELS: Record<string, string> = { ISSUED: "Not paid", PARTIALLY_PAID: "Part paid", PAID: "Paid", VOID: "Void" };

/** Indian financial year label for a date: 2026-10-25 → "26-27", 2027-02-01 → "26-27". */
export function financialYear(date: string) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Where tax goes: CGST+SGST inside the business's state, IGST outside it. */
export function taxSplit(inv: { tax: number; taxPercent: number; gstInvoice: boolean; business: PartySnapshot; customer: PartySnapshot }) {
  if (!inv.gstInvoice || !inv.tax) return [];
  const same = (inv.customer.state || inv.business.state || "").toLowerCase() === (inv.business.state || "").toLowerCase();
  if (!same) return [{ label: `IGST ${inv.taxPercent}%`, amount: inv.tax }];
  const half = Math.round(inv.tax / 2);
  return [
    { label: `CGST ${inv.taxPercent / 2}%`, amount: half },
    { label: `SGST ${inv.taxPercent / 2}%`, amount: inv.tax - half },
  ];
}

async function settingsRow() {
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return s;
}

function businessSnapshot(s: Awaited<ReturnType<typeof settingsRow>>): PartySnapshot {
  return {
    name: s.legalName || s.businessName,
    address: s.address,
    phone: s.phone,
    email: s.email,
    gstin: s.gstRegistered ? s.gstin : "",
    state: s.businessState,
  };
}

type Addr = { house?: string; building?: string; street?: string; area?: string; city?: string; state?: string; pincode?: string; landmark?: string } | null | undefined;
const customerSnapshot = (c: { name: string; phone: string; email: string; address: Addr }): PartySnapshot => ({
  name: c.name,
  phone: c.phone,
  email: c.email.endsWith("@no-email.saladstories") ? "" : c.email,
  address: c.address?.house ? addressLine(c.address as never) : "",
  state: c.address?.state || "Tamil Nadu",
});

type SettingsRow = Awaited<ReturnType<typeof settingsRow>>;
/** Settings are read before the transaction (a second connection inside it can deadlock). */
async function insertInvoice(tx: Tx, s: SettingsRow, kind: "INVOICE" | "CREDIT_NOTE", values: Omit<typeof invoices.$inferInsert, "number" | "kind" | "publicToken" | "business" | "gstInvoice" | "issueDate"> & { issueDate?: string }) {
  const issueDate = values.issueDate ?? istParts().dateStr;
  const fy = financialYear(issueDate);
  const prefix = kind === "CREDIT_NOTE" ? "CN" : (s.invoicePrefix || "SS").replace(/[^A-Za-z0-9-]/g, "").slice(0, 8) || "SS";
  const n = await nextNumber(tx, `${kind === "CREDIT_NOTE" ? "cn" : `inv:${prefix}`}:${fy}`);
  const [row] = await tx
    .insert(invoices)
    .values({
      ...values,
      kind,
      issueDate,
      number: `${prefix}/${fy}/${String(n).padStart(4, "0")}`,
      business: businessSnapshot(s),
      gstInvoice: s.gstRegistered && !!s.gstin,
      publicToken: crypto.randomBytes(18).toString("base64url"),
    })
    .returning();
  return row;
}

/** Money against an invoice: payments, refunds, credit notes → what's still due. */
export async function invoiceMoney(inv: Invoice) {
  const pays = await db.select().from(payments).where(eq(payments.invoiceId, inv.id)).orderBy(desc(payments.paidAt));
  const received = pays.filter((p) => p.status === "RECEIVED");
  const paid = received.filter((p) => p.type === "PAYMENT").reduce((t, p) => t + p.amount, 0);
  const refunded = received.filter((p) => p.type === "REFUND").reduce((t, p) => t + p.amount, 0);
  const notes = inv.kind === "INVOICE" ? await db.select().from(invoices).where(and(eq(invoices.relatedInvoiceId, inv.id), eq(invoices.kind, "CREDIT_NOTE"))) : [];
  const credited = notes.reduce((t, n) => t + n.total, 0);
  const due = Math.max(0, inv.total - credited - (paid - refunded));
  return { payments: pays, paid, refunded, credited, creditNotes: notes, due };
}

function statusFor(inv: Invoice, m: { paid: number; refunded: number; credited: number; due: number }) {
  if (inv.status === "VOID") return "VOID";
  if (inv.kind === "CREDIT_NOTE") return "ISSUED";
  if (m.due <= 0) return "PAID";
  return m.paid - m.refunded > 0 ? "PARTIALLY_PAID" : "ISSUED";
}

async function refreshStatus(inv: Invoice) {
  const m = await invoiceMoney(inv);
  const status = statusFor(inv, m);
  if (status !== inv.status) await db.update(invoices).set({ status }).where(eq(invoices.id, inv.id));
  return { ...inv, status };
}

/** The live invoice for a plan or order, if there is one. */
export async function liveInvoice(by: { subscriptionId?: string | null; orderId?: string | null }) {
  const where = by.subscriptionId
    ? eq(invoices.subscriptionId, by.subscriptionId)
    : and(eq(invoices.orderId, by.orderId!), isNull(invoices.subscriptionId));
  const [inv] = await db.select().from(invoices).where(and(where, eq(invoices.kind, "INVOICE"), ne(invoices.status, "VOID")));
  return inv ?? null;
}

/** Issue the plan's invoice (once). */
async function issueForSubscription(subId: string, actor: Actor) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subId));
  if (!sub) return null;
  const [c] = sub.customerId ? await db.select().from(customers).where(eq(customers.id, sub.customerId)) : [];
  const s = await settingsRow();
  const days = `${sub.daysTotal} delivery day${sub.daysTotal === 1 ? "" : "s"}`;
  const lines: InvoiceLine[] = [
    {
      description: `${sub.planName} meal plan (${sub.number}) · ${days}, ${formatDateLong(sub.startDate)} – ${formatDateLong(sub.endDate)} · ${sub.quantity} bowl${sub.quantity === 1 ? "" : "s"} a day${sub.large ? ", large" : ""}`,
      qty: 1,
      rate: sub.subtotal,
      amount: sub.subtotal,
    },
  ];
  try {
    return await db.transaction(async (tx) => {
      const inv = await insertInvoice(tx, s, "INVOICE", {
        customerId: sub.customerId,
        subscriptionId: sub.id,
        orderId: sub.paymentOrderId,
        issueDate: istParts().dateStr,
        dueDate: sub.startDate,
        lines,
        subtotal: sub.subtotal,
        discount: sub.discount,
        deliveryFee: sub.deliveryFee,
        tax: sub.tax,
        taxLabel: s.taxLabel,
        taxPercent: sub.tax ? s.taxPercent : 0,
        total: sub.total,
        customer: customerSnapshot(c ?? { name: sub.customerName, phone: sub.phone, email: sub.email, address: sub.address as Addr }),
        notes: s.invoiceTerms,
        createdBy: actor.name,
      });
      await audit(tx, "invoice", inv.id, "issued", { after: { number: inv.number, total: inv.total, subscription: sub.number }, actor });
      return inv;
    });
  } catch (e) {
    if (String((e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505") return liveInvoice({ subscriptionId: subId });
    throw e;
  }
}

/** Issue a one-off order's invoice (once). */
async function issueForOrder(orderId: string, actor: Actor) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });
  if (!o || o.total <= 0) return null;
  const [c] = o.customerId ? await db.select().from(customers).where(eq(customers.id, o.customerId)) : [];
  const s = await settingsRow();
  const lines: InvoiceLine[] = o.items.map((i) => ({ description: `${i.name}${i.summary ? ` (${i.summary})` : ""}`, qty: i.quantity, rate: i.unitPrice, amount: i.lineTotal }));
  try {
    return await db.transaction(async (tx) => {
      const inv = await insertInvoice(tx, s, "INVOICE", {
        customerId: o.customerId,
        orderId: o.id,
        issueDate: istParts(o.createdAt).dateStr,
        dueDate: o.deliveryDate,
        lines,
        subtotal: o.subtotal,
        discount: o.discount,
        deliveryFee: o.deliveryFee,
        tax: o.tax,
        taxLabel: s.taxLabel,
        taxPercent: o.tax ? s.taxPercent : 0,
        total: o.total,
        notes: [`Order ${o.orderNumber}${o.couponCode ? ` · coupon ${o.couponCode}` : ""}`, s.invoiceTerms].filter(Boolean).join("\n"),
        customer: customerSnapshot(c ?? { name: o.customerName, phone: o.phone, email: o.email, address: o.address as Addr }),
        createdBy: actor.name,
      });
      await audit(tx, "invoice", inv.id, "issued", { after: { number: inv.number, total: inv.total, order: o.orderNumber }, actor });
      return inv;
    });
  } catch (e) {
    if (String((e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505") return liveInvoice({ orderId });
    throw e;
  }
}

/**
 * Keep billing in step with the ledger: issue the invoice when it's due, link
 * payments to it, and update its paid status. Safe to call any number of times.
 * Plans made in the admin get their invoice straight away (so it can be sent to
 * ask for payment); website plans and orders get theirs once money is confirmed
 * as received (a customer's unchecked UPI claim doesn't issue one).
 */
export async function syncBilling(by: { subscriptionId?: string | null; orderId?: string | null }, actor: Actor = SYSTEM) {
  let inv: Invoice | null = null;
  if (by.subscriptionId) {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, by.subscriptionId));
    if (!sub) return null;
    inv = await liveInvoice({ subscriptionId: sub.id });
    if (!inv) {
      const [anyPay] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.subscriptionId, sub.id), eq(payments.status, "RECEIVED"))).limit(1);
      if (sub.source === "ADMIN" || anyPay || sub.status !== "PENDING_PAYMENT") inv = await issueForSubscription(sub.id, actor);
    }
    if (inv) await db.update(payments).set({ invoiceId: inv.id }).where(and(eq(payments.subscriptionId, sub.id), isNull(payments.invoiceId)));
  } else if (by.orderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, by.orderId));
    if (!o || o.kind === "PLAN_DAY") return null;
    if (o.kind === "PLAN" && o.subscriptionId) return syncBilling({ subscriptionId: o.subscriptionId }, actor);
    inv = await liveInvoice({ orderId: o.id });
    if (!inv) {
      const [anyPay] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "RECEIVED"))).limit(1);
      if (o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED" || anyPay) inv = await issueForOrder(o.id, actor);
    }
    if (inv) await db.update(payments).set({ invoiceId: inv.id }).where(and(eq(payments.orderId, o.id), isNull(payments.invoiceId)));
  }
  return inv ? refreshStatus(inv) : null;
}

/** Billing must never block a payment: log and carry on (the daily job catches up). */
export async function syncBillingSafe(by: { subscriptionId?: string | null; orderId?: string | null }, actor: Actor = SYSTEM) {
  try {
    return await syncBilling(by, actor);
  } catch (e) {
    console.error("[billing sync failed]", by, e);
    return null;
  }
}

/** A refund was recorded → credit note against the invoice. */
export async function creditNoteForRefund(refundId: string, actor: Actor) {
  const [r] = await db.select().from(payments).where(eq(payments.id, refundId));
  if (!r || r.type !== "REFUND") return null;
  const [existing] = await db.select().from(invoices).where(eq(invoices.paymentId, r.id));
  if (existing) return existing;
  const inv = (await syncBilling({ subscriptionId: r.subscriptionId, orderId: r.subscriptionId ? null : r.orderId }, actor)) ?? null;
  if (!inv) return null;
  const tax = inv.total ? Math.round((r.amount * inv.tax) / inv.total) : 0;
  const s = await settingsRow();
  const note = await db.transaction(async (tx) => {
    const cn = await insertInvoice(tx, s, "CREDIT_NOTE", {
      relatedInvoiceId: inv.id,
      paymentId: r.id,
      customerId: inv.customerId,
      subscriptionId: inv.subscriptionId,
      orderId: inv.orderId,
      lines: [{ description: `Refund against ${inv.number}${r.note ? ` — ${r.note}` : ""}`, qty: 1, rate: r.amount - tax, amount: r.amount - tax }],
      subtotal: r.amount - tax,
      tax,
      taxLabel: inv.taxLabel,
      taxPercent: inv.taxPercent,
      total: r.amount,
      customer: inv.customer,
      notes: `Refunded by ${r.method}${r.reference ? ` (${r.reference})` : ""}`,
      createdBy: actor.name,
    });
    await audit(tx, "invoice", cn.id, "credit note issued", { after: { number: cn.number, total: cn.total, against: inv.number }, reason: r.note, actor });
    return cn;
  });
  await refreshStatus(inv);
  return note;
}

/** Cancel an invoice issued by mistake (only while nothing has been paid against it). */
export async function voidInvoice(id: string, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new BizError("Say why this invoice is being cancelled.");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) throw new BizError("Invoice not found.");
  if (inv.status === "VOID") throw new BizError("Already cancelled.");
  const m = await invoiceMoney(inv);
  if (m.paid - m.refunded > 0 || m.payments.some((p) => p.status === "PENDING_VERIFICATION")) throw new BizError("Money has been received against this invoice. Record a refund instead — that issues a credit note.");
  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ status: "VOID", voidReason: reason }).where(eq(invoices.id, id));
    await tx.update(payments).set({ invoiceId: null }).where(eq(payments.invoiceId, id));
    await audit(tx, "invoice", id, "cancelled", { before: { status: inv.status }, after: { status: "VOID" }, reason, actor });
  });
}

/** Re-issue after a void (e.g. the plan was corrected). */
export async function reissue(by: { subscriptionId?: string | null; orderId?: string | null }, actor: Actor) {
  const inv = await syncBilling(by, actor);
  if (!inv) throw new BizError("Nothing to invoice yet — record a payment first.");
  return inv;
}

export async function getInvoice(id: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return null;
  return { inv, money: await invoiceMoney(inv), related: inv.relatedInvoiceId ? (await db.select().from(invoices).where(eq(invoices.id, inv.relatedInvoiceId)))[0] ?? null : null };
}

export async function getInvoiceByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [inv] = await db.select().from(invoices).where(eq(invoices.publicToken, token));
  return inv ? getInvoice(inv.id) : null;
}

export async function listInvoices(f: { q?: string; status?: string; kind?: string; customerId?: string; limit?: number } = {}) {
  const conds = [];
  if (f.kind === "CREDIT_NOTE" || f.kind === "INVOICE") conds.push(eq(invoices.kind, f.kind));
  if (f.status === "unpaid") conds.push(inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID"]));
  else if (f.status) conds.push(eq(invoices.status, f.status));
  if (f.customerId) conds.push(eq(invoices.customerId, f.customerId));
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(invoices.number, q), sql`${invoices.customer}->>'name' ilike ${q}`, sql`${invoices.customer}->>'phone' ilike ${q}`));
  }
  return db.select().from(invoices).where(conds.length ? and(...conds) : undefined).orderBy(desc(invoices.createdAt)).limit(f.limit ?? 200);
}

/**
 * Catch-up job: invoices for paid orders and plans that don't have one yet
 * (e.g. orders from before billing existed, or a sync that failed).
 */
export async function issueMissingInvoices(actor: Actor = SYSTEM) {
  const subs = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(sql`(${subscriptions.source} = 'ADMIN' or ${subscriptions.status} <> 'PENDING_PAYMENT' or exists (select 1 from payments p where p.subscription_id = ${subscriptions.id} and p.status = 'RECEIVED'))
      and not exists (select 1 from invoices i where i.subscription_id = ${subscriptions.id} and i.kind = 'INVOICE' and i.status <> 'VOID')`);
  const ords = await db
    .select({ id: orders.id })
    .from(orders)
    .where(sql`${orders.kind} = 'ORDER' and ${orders.total} > 0 and (${orders.paymentStatus} in ('PAID','REFUNDED') or exists (select 1 from payments p where p.order_id = ${orders.id} and p.status = 'RECEIVED'))
      and not exists (select 1 from invoices i where i.order_id = ${orders.id} and i.subscription_id is null and i.kind = 'INVOICE' and i.status <> 'VOID')`);
  for (const s of subs) await syncBillingSafe({ subscriptionId: s.id }, actor);
  for (const o of ords) await syncBillingSafe({ orderId: o.id }, actor);
  // Refunds without a credit note.
  const refunds = await db
    .select({ id: payments.id })
    .from(payments)
    .where(sql`${payments.type} = 'REFUND' and ${payments.status} = 'RECEIVED' and not exists (select 1 from invoices i where i.payment_id = ${payments.id})`);
  for (const r of refunds) {
    try {
      await creditNoteForRefund(r.id, actor);
    } catch (e) {
      console.error("[credit note catch-up]", e);
    }
  }
  return { plans: subs.length, orders: ords.length, creditNotes: refunds.length };
}

/** Link for the customer, on whichever site this is running (live or test). */
export async function invoiceUrl(token: string) {
  let base = (process.env.NEXT_PUBLIC_SITE_URL || "https://saladstories.netlify.app").replace(/\/$/, "");
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) base = `${h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    /* outside a request (jobs, tests) */
  }
  return `${base}/invoice/${token}`;
}
