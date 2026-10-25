import "server-only";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, deliverySlots, orders, payments, scheduleRequests, subscriptionDays, subscriptionPlans, subscriptions } from "@/db";
import { formatINR } from "../money";
import { addressLine } from "../notify";
import { addDays, formatDateLong, istParts } from "../time";
import { dayNumber, paymentStatus, PAYMENT_STATUS_LABELS, scheduleStats, type PaymentStatus } from "./core";

const KITCHEN = ["PAID", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"];

export type ListEntry = {
  orderId: string;
  orderNumber: string;
  slotId: string | null;
  slotName: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  address: string;
  note: string;
  items: string;
  bowls: { name: string; qty: number }[];
  plan: null | {
    subscriptionId: string;
    number: string;
    name: string;
    entitled: number;
    dayNo: number;
    remainingAfter: number;
    payment: PaymentStatus;
    due: number;
    isLast: boolean;
    status: string;
  };
};

/** Everything to deliver on a date, with plan progress and payment status. */
export async function deliveryList(date: string): Promise<ListEntry[]> {
  const today = istParts().dateStr;
  const rows = await db.query.orders.findMany({
    where: and(eq(orders.deliveryDate, date), inArray(orders.status, KITCHEN), inArray(orders.kind, ["ORDER", "PLAN_DAY"])),
    with: { items: true },
    orderBy: asc(orders.createdAt),
  });
  const slots = new Map((await db.select().from(deliverySlots)).map((s) => [s.id, s]));
  const subIds = [...new Set(rows.map((r) => r.subscriptionId).filter(Boolean) as string[])];
  const subs = subIds.length ? await db.select().from(subscriptions).where(inArray(subscriptions.id, subIds)) : [];
  const days = subIds.length ? await db.query.subscriptionDays.findMany({ where: inArray(subscriptionDays.subscriptionId, subIds), with: { order: true } }) : [];
  const pays = subIds.length ? await db.select().from(payments).where(inArray(payments.subscriptionId, subIds)) : [];

  return rows
    .map((o) => {
      const slot = o.slotId ? slots.get(o.slotId) : undefined;
      let plan: ListEntry["plan"] = null;
      if (o.kind === "PLAN_DAY" && o.subscriptionId) {
        const sub = subs.find((s) => s.id === o.subscriptionId);
        if (sub) {
          const mine = days.filter((d) => d.subscriptionId === sub.id);
          const lite = mine.map((d) => ({ date: d.date, status: d.status, orderStatus: d.order?.status ?? null }));
          const stats = scheduleStats(lite, sub.daysTotal, sub.extraAuthorized, today);
          const no = dayNumber(lite, date);
          const status = paymentStatus(sub.total, pays.filter((p) => p.subscriptionId === sub.id));
          const net = pays.filter((p) => p.subscriptionId === sub.id && p.status === "RECEIVED").reduce((t, p) => t + (p.type === "REFUND" ? -p.amount : p.amount), 0);
          plan = {
            subscriptionId: sub.id,
            number: sub.number,
            name: sub.planName,
            entitled: stats.entitled,
            dayNo: no,
            remainingAfter: Math.max(0, stats.entitled - no),
            payment: status,
            due: Math.max(0, sub.total - net),
            isLast: no >= stats.entitled,
            status: sub.status,
          };
        }
      }
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        slotId: o.slotId,
        slotName: slot ? slot.name : o.slotLabel,
        customerId: o.customerId,
        customerName: o.customerName,
        phone: o.phone,
        address: addressLine(o.address),
        note: o.address.instructions ?? "",
        items: o.items.map((i) => `${i.quantity} × ${i.name}${i.summary ? ` (${i.summary})` : ""}`).join("; "),
        bowls: o.items.map((i) => ({ name: i.name, qty: i.quantity })),
        plan,
      };
    })
    .sort((a, b) => (slots.get(a.slotId ?? "")?.sortOrder ?? 9) - (slots.get(b.slotId ?? "")?.sortOrder ?? 9) || a.customerName.localeCompare(b.customerName));
}

/** "Salad Stories – Tomorrow's Orders | 23 October 2026" in the owner's format. */
export function formatDeliveryList(date: string, list: ListEntry[]) {
  const head = `Salad Stories – Orders for ${formatDateLong(date)}`;
  if (!list.length) return `${head}\n\nNo deliveries.`;
  const lines: string[] = [head, ""];
  let n = 0;
  let lastSlot = "";
  for (const e of list) {
    if (e.slotName !== lastSlot) {
      lastSlot = e.slotName;
      lines.push(`— ${e.slotName} (${list.filter((x) => x.slotName === e.slotName).length}) —`);
    }
    n++;
    lines.push(`${n}. ${e.customerName} · ${e.phone}`);
    if (e.plan) {
      lines.push(`   • Plan: ${e.plan.name} – ${e.plan.entitled} delivery days`);
      lines.push(`   • Payment: ${PAYMENT_STATUS_LABELS[e.plan.payment]}${e.plan.due ? ` (₹${(e.plan.due / 100).toFixed(2)} due)` : ""}`);
      lines.push(`   • Delivery: Day ${e.plan.dayNo} of ${e.plan.entitled}${e.plan.isLast ? " (last)" : ` · Remaining after: ${e.plan.remainingAfter}`}`);
      lines.push(`   • Status: ${e.plan.isLast ? "Renewal required before the next delivery" : e.plan.status === "ACTIVE" ? "Active" : e.plan.status}`);
    } else {
      lines.push(`   • One-off order ${e.orderNumber} · Paid`);
    }
    lines.push(`   • Bowl: ${e.items}`);
    lines.push(`   • Address: ${e.address}`);
    if (e.note) lines.push(`   • Note: ${e.note}`);
  }
  const totals = new Map<string, number>();
  for (const e of list) for (const b of e.bowls) totals.set(b.name, (totals.get(b.name) ?? 0) + b.qty);
  lines.push("", `To prepare: ${[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} × ${k}`).join(", ")}`);
  return lines.join("\n");
}

export type AttentionItem = { kind: string; text: string; link: string; subscriptionId?: string };

/** What needs the owner's attention before tomorrow's deliveries. */
export async function attentionItems(date: string, list: ListEntry[]): Promise<AttentionItem[]> {
  const out: AttentionItem[] = [];
  for (const e of list) {
    if (!e.plan) continue;
    if (e.plan.payment !== "PAID") out.push({ kind: "PAYMENT_DUE", text: `${e.customerName}: ${e.plan.name} plan ${PAYMENT_STATUS_LABELS[e.plan.payment].toLowerCase()} — ${formatINR(e.plan.due)} due`, link: `/admin/plans/${e.plan.subscriptionId}`, subscriptionId: e.plan.subscriptionId });
    if (e.plan.isLast) out.push({ kind: "RENEWAL", text: `${e.customerName}: last delivery of the ${e.plan.name} plan — renewal needed`, link: `/admin/plans/${e.plan.subscriptionId}`, subscriptionId: e.plan.subscriptionId });
  }
  const pending = await db
    .select({ id: scheduleRequests.id, type: scheduleRequests.type, originalDate: scheduleRequests.originalDate, name: subscriptions.customerName })
    .from(scheduleRequests)
    .innerJoin(subscriptions, eq(subscriptions.id, scheduleRequests.subscriptionId))
    .where(eq(scheduleRequests.status, "PENDING"));
  for (const r of pending)
    out.push({ kind: "REQUEST", text: `${r.name}: ${r.type === "PAUSE" ? "pause" : "skip"} request${r.originalDate ? ` for ${formatDateLong(r.originalDate)}` : ""} waiting for your decision`, link: "/admin/requests" });
  const verify = await db.select({ id: payments.id, amount: payments.amount }).from(payments).where(eq(payments.status, "PENDING_VERIFICATION"));
  if (verify.length) out.push({ kind: "VERIFY", text: `${verify.length} payment${verify.length === 1 ? "" : "s"} to check (${formatINR(verify.reduce((t, p) => t + p.amount, 0))})`, link: "/admin/payments?f=verify" });
  // Plans that finished recently without a renewal.
  const ended = await db
    .select({ id: subscriptions.id, name: subscriptions.customerName, plan: subscriptions.planName })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "COMPLETED"), eq(subscriptions.renewalStatus, "DUE"), lte(subscriptions.actualEndDate, date)));
  for (const s of ended) out.push({ kind: "RENEW", text: `${s.name}: ${s.plan} plan finished — payment for the next plan needed`, link: `/admin/plans/${s.id}` });
  return out;
}

/** Plans whose final delivery is on `date`. */
export async function plansEndingOn(date: string) {
  const subs = await db
    .select({ sub: subscriptions, isTrial: subscriptionPlans.isTrial })
    .from(subscriptions)
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.status, "ACTIVE"), eq(subscriptions.endDate, date)));
  return subs.map((s) => ({ ...s.sub, isTrial: !!s.isTrial }));
}

export const tomorrowOf = (d = istParts().dateStr) => addDays(d, 1);
