import "server-only";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { customers, db, subscriptionDays, subscriptions } from "@/db";
import { activateSubscription, createPlanRecords, quotePlan } from "../plans";
import { formatDateLong } from "../time";
import { CheckoutError } from "../orders";
import { audit, type Actor } from "./audit";
import { BizError } from "./customers";
import { paymentInput, recordPayment } from "./payments";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const adminSubscriptionInput = z.object({
  idempotencyKey: z.string().min(8).max(80),
  customerId: z.string().min(1),
  planCode: z.string().min(2),
  slotId: z.string().min(1, "Choose a delivery time"),
  startDate: z.string().regex(dateRe).optional().nullable(),
  dates: z.array(z.string().regex(dateRe)).max(60).optional().nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one delivery day"),
  sequence: z.array(z.string()).max(60).default([]),
  quantity: z.number().int().min(1).max(5).default(1),
  large: z.boolean().default(false),
  notes: z.string().trim().max(300).default(""),
  /** Record money now (optional). */
  payment: paymentInput.pick({ amount: true, method: true, reference: true, paidAt: true, status: true, note: true }).optional().nullable(),
  /** Start before full payment — only with a reason (logged). */
  startEarlyReason: z.string().trim().max(200).optional().nullable(),
  /** Renewal of this earlier plan (marks it renewed). */
  renewedFromId: z.string().optional().nullable(),
  /** The owner confirmed two plan deliveries on the same day are intended. */
  allowOverlap: z.boolean().default(false),
});
export type AdminSubscriptionInput = z.input<typeof adminSubscriptionInput>;

/** Owner creates a plan for a WhatsApp / phone / cash customer. */
export async function createAdminSubscription(input: AdminSubscriptionInput, actor: Actor) {
  const d = adminSubscriptionInput.parse(input);
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.idempotencyKey, d.idempotencyKey));
  if (existing) return existing; // double-tapped Save
  const [c] = await db.select().from(customers).where(eq(customers.id, d.customerId));
  if (!c) throw new BizError("Customer not found.");
  if (!c.address?.house || !c.address?.pincode) throw new BizError("Add the customer's delivery address (house and PIN code) first.");
  if (c.manualStatus === "CANCELLED") throw new BizError("This customer is marked cancelled. Remove that first if they're back.");

  // Days without a chosen bowl get a rotation of standard bowls.
  const { getMenu } = await import("../menu");
  const pool = (await getMenu()).items.filter((p) => p.status === "PUBLISHED" && p.stockStatus === "IN_STOCK");
  const std = pool.filter((p) => p.planTier === "STANDARD");
  const rot = std.length ? std : pool;
  const sequence = Array.from({ length: 60 }, (_, i) => d.sequence[i] || rot[i % Math.max(1, rot.length)]?.id || "");

  const planInput = {
        idempotencyKey: d.idempotencyKey,
        planCode: d.planCode,
        slotId: d.slotId,
        startDate: d.startDate,
        dates: d.dates,
        bowls: {},
        sequence,
        quantity: d.quantity,
        large: d.large,
        pincode: c.address.pincode,
        pincode2: null,
        addressByWeekday: {},
        weekdays: d.weekdays,
        contact: { name: c.name, phone: c.phone, email: c.email || `${c.phone}@no-email.saladstories` },
        address: {
          house: c.address.house,
          building: c.address.building ?? "",
          street: c.address.street ?? "",
          area: c.address.area || "-",
          city: c.address.city || "Chennai",
          state: c.address.state || "Tamil Nadu",
          pincode: c.address.pincode,
          landmark: c.address.landmark ?? "",
          instructions: [c.address.instructions, c.instructions, c.foodPreferences].filter(Boolean).join(" · "),
        },
        addressLabel: "",
        address2: null,
        address2Label: "",
        notes: d.notes,
      };

  let created;
  try {
    // Same customer, same day, two plans? Usually a mistake — ask first.
    if (!d.allowOverlap) {
      const q = await quotePlan({ ...planInput, pincode: c.address.pincode, pincode2: null }, { team: true });
      const dates = q.days.map((x) => x.date);
      if (dates.length) {
        const clash = await db
          .select({ date: subscriptionDays.date, number: subscriptions.number })
          .from(subscriptionDays)
          .innerJoin(subscriptions, eq(subscriptions.id, subscriptionDays.subscriptionId))
          .where(and(eq(subscriptions.customerId, c.id), inArray(subscriptions.status, ["ACTIVE", "PENDING_PAYMENT", "PAUSED"]), inArray(subscriptionDays.status, ["SCHEDULED", "HELD"]), inArray(subscriptionDays.date, dates)));
        if (clash.length) {
          const list = [...new Set(clash.map((x) => x.date))].sort();
          throw new BizError(
            `OVERLAP: ${c.name} already has plan deliveries (${clash[0].number}) on ${list.slice(0, 3).map(formatDateLong).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more days` : ""}. Start the new plan after ${formatDateLong(list[list.length - 1])}, or tick “Two deliveries on the same day is fine”.`,
          );
        }
      }
    }
    created = await createPlanRecords(planInput, { userId: c.userId, customerId: c.id, source: "ADMIN", actor, team: true });
  } catch (e) {
    if (e instanceof CheckoutError) throw new BizError(e.message);
    throw e;
  }
  const { sub } = created;

  if (d.renewedFromId) {
    const [old] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, d.renewedFromId), eq(subscriptions.customerId, c.id)));
    if (old) {
      await db.update(subscriptions).set({ renewedFromId: old.id }).where(eq(subscriptions.id, sub.id));
      await db.update(subscriptions).set({ renewalStatus: "RENEWED", updatedAt: new Date() }).where(eq(subscriptions.id, old.id));
      await audit(db, "subscription", old.id, "renewed", { before: { renewalStatus: old.renewalStatus }, after: { renewalStatus: "RENEWED", next: sub.number }, actor });
    }
  }

  if (d.payment && d.payment.amount > 0) {
    await recordPayment({ ...d.payment, customerId: c.id, subscriptionId: sub.id }, actor);
  } else if (d.startEarlyReason && d.startEarlyReason.length >= 3) {
    await startBeforePayment(sub.id, d.startEarlyReason, actor);
  }
  const [fresh] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
  return fresh;
}

/** Authorised exception: deliveries start before the plan is fully paid. Logged with the reason. */
export async function startBeforePayment(subscriptionId: string, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new BizError("Say why this plan starts before it's paid.");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!sub) throw new BizError("Plan not found.");
  if (sub.status !== "PENDING_PAYMENT") throw new BizError("This plan has already started.");
  await activateSubscription(sub.id, actor, `Started before full payment: ${reason}`);
  await audit(db, "subscription", sub.id, "started before full payment", { reason, actor });
}

/** Counts and money for one plan: "Day 8 of 22", remaining, paid, due. */
export async function subscriptionSummary(subscriptionId: string) {
  const { getSubscription } = await import("../plans");
  const { scheduleStats, dayNumber } = await import("./core");
  const { subscriptionMoney } = await import("./payments");
  const { istParts } = await import("../time");
  const sub = await getSubscription(subscriptionId);
  if (!sub) return null;
  const today = istParts().dateStr;
  const lite = sub.days.map((d) => ({ date: d.date, status: d.status, orderStatus: d.order?.status ?? null }));
  const stats = scheduleStats(lite, sub.daysTotal, sub.extraAuthorized, today);
  const next = sub.days.find((d) => d.status === "SCHEDULED" && d.date >= today && d.order?.status !== "CANCELLED" && d.order?.status !== "DELIVERED");
  const money = await subscriptionMoney(sub);
  return { sub, stats, next: next ? { ...next, number: dayNumber(lite, next.date) } : null, money, dayNumberOf: (date: string) => dayNumber(lite, date) };
}
export type SubscriptionSummary = NonNullable<Awaited<ReturnType<typeof subscriptionSummary>>>;
