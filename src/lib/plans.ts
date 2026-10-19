import "server-only";
import crypto from "crypto";
import { z } from "zod";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
  addresses,
  blackoutDates,
  db,
  deliverySlots,
  orderEvents,
  orderItems,
  orders,
  subscriptionDays,
  subscriptionPlans,
  subscriptions,
} from "@/db";
import { selectionSummary, unitPrice, type GroupDef, type Selections } from "./customization";
import { computeTotals } from "./pricing-core";
import { findAreaByPincode, slotUsage } from "./delivery";
import { getProductsByIds } from "./menu";
import { getSettings } from "./settings";
import { checkoutSchema, CheckoutError, newOrderNumber, paymentMode, startPayment, type PaymentPayload } from "./orders";
import { addDays, dayOfWeek, formatDateLabel, formatDateLong, formatTime, istParts } from "./time";
import { formatINR } from "./money";

import { canChangeDay, earliestStart, planSelections, planSubtotal } from "./plans-core";
export { canChangeDay, earliestStart, planSelections };
/** How far ahead plan days can be booked. */
export const PLAN_HORIZON_DAYS = 120;
/** Latest start date offered for a plan. */
export const PLAN_START_WITHIN_DAYS = 30;

export type Plan = typeof subscriptionPlans.$inferSelect;
type Slot = typeof deliverySlots.$inferSelect;
type SubRow = typeof subscriptions.$inferSelect;
type DayRow = typeof subscriptionDays.$inferSelect;

export async function getPlans(activeOnly = true) {
  return db
    .select()
    .from(subscriptionPlans)
    .where(activeOnly ? eq(subscriptionPlans.isActive, true) : undefined)
    .orderBy(asc(subscriptionPlans.sortOrder));
}

export async function getPlanByCode(code: string) {
  const [p] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, code.toUpperCase()));
  return p ?? null;
}

export const slotLabelOf = (s: Slot) => `${s.name} (${formatTime(s.startTime)} – ${formatTime(s.endTime)})`;

async function deliveryContext(slotId: string) {
  const [[slot], blackouts] = await Promise.all([
    db.select().from(deliverySlots).where(and(eq(deliverySlots.id, slotId), eq(deliverySlots.isActive, true))),
    db.select({ date: blackoutDates.date }).from(blackoutDates).where(gte(blackoutDates.date, istParts().dateStr)),
  ]);
  return { slot: slot ?? null, blackout: new Set(blackouts.map((b) => b.date)) };
}

/** Is this date deliverable for the slot (runs that weekday, not a holiday, not full)? */
async function dateStatus(date: string, slot: Slot, blackout: Set<string>, checkCapacity = true) {
  const days = slot.daysOfWeek.split(",").map((d) => Number(d.trim()));
  if (!days.includes(dayOfWeek(date))) return "closed" as const;
  if (blackout.has(date)) return "holiday" as const;
  if (checkCapacity && (await slotUsage(date, slot.id)) >= slot.maxOrders) return "full" as const;
  return "open" as const;
}

/** The next `count` deliverable dates from `start` (skipping closed days, holidays and full slots). */
export async function nextDeliveryDates(slot: Slot, blackout: Set<string>, start: string, count: number, after = false) {
  const out: string[] = [];
  const limit = addDays(istParts().dateStr, PLAN_HORIZON_DAYS);
  for (let d = after ? addDays(start, 1) : start; out.length < count && d <= limit; d = addDays(d, 1)) {
    if ((await dateStatus(d, slot, blackout)) === "open") out.push(d);
  }
  return out;
}

/** Calendar for "Pick your days": every date in the next 60 days and whether it can be picked. */
export async function pickableDates(slotId: string, days = 60) {
  const { slot, blackout } = await deliveryContext(slotId);
  if (!slot) return [];
  const first = earliestStart();
  const out: { date: string; label: string; status: "open" | "closed" | "holiday" | "full" }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(first, i);
    out.push({ date, label: formatDateLabel(date), status: await dateStatus(date, slot, blackout) });
  }
  return out;
}

// ---------------- Pricing ----------------

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const planQuoteSchema = z.object({
  planCode: z.string().trim().min(2).max(20),
  slotId: z.string().min(1, "Choose a delivery time"),
  startDate: z.string().regex(dateRe).optional().nullable(),
  dates: z.array(z.string().regex(dateRe)).max(60).optional().nullable(),
  /** Bowl per date (Pick-your-days plans)… */
  bowls: z.record(z.string().regex(dateRe), z.string().min(1)).default({}),
  /** …or bowl per position (day 1, day 2…) for fixed-length plans. */
  sequence: z.array(z.string().max(60)).max(60).optional().nullable(),
  quantity: z.number().int().min(1).max(5).default(1),
  large: z.boolean().default(false),
  pincode: z.string().trim().max(10).optional().nullable(),
});
export type PlanQuoteInput = z.infer<typeof planQuoteSchema>;

export async function quotePlan(input: PlanQuoteInput) {
  const settings = await getSettings();
  const blockers: string[] = [];
  const plan = await getPlanByCode(input.planCode);
  if (!plan || !plan.isActive) throw new CheckoutError("This plan isn't available any more.");
  const { slot, blackout } = await deliveryContext(input.slotId);
  if (!slot) throw new CheckoutError("That delivery time isn't available. Please pick another.");

  // Work out the delivery dates on the server.
  let dates: string[] = [];
  const first = earliestStart();
  if (plan.days) {
    const start = input.startDate && input.startDate >= first ? input.startDate : first;
    if (start > addDays(first, PLAN_START_WITHIN_DAYS)) blockers.push(`Plans can start up to ${PLAN_START_WITHIN_DAYS} days ahead.`);
    dates = await nextDeliveryDates(slot, blackout, start, plan.days);
    if (dates.length < plan.days) blockers.push("We don't have enough open delivery days for this plan right now. Try another time slot or start date.");
  } else {
    const picked = [...new Set(input.dates ?? [])].sort();
    const last = addDays(first, 59);
    for (const d of picked) {
      if (d < first || d > last) continue;
      if ((await dateStatus(d, slot, blackout)) === "open") dates.push(d);
    }
    if (dates.length !== picked.length) blockers.push("Some dates you picked can't be delivered any more. Please check the calendar.");
    if (dates.length < plan.minDays) blockers.push(`Pick at least ${plan.minDays} days.`);
    if (dates.length > plan.maxDays) blockers.push(`You can pick up to ${plan.maxDays} days.`);
  }

  // Price each day's bowl from the database.
  const pickFor = (date: string, i: number) => input.bowls[date] || input.sequence?.[i] || "";
  const productIds = [...new Set(dates.map(pickFor).filter(Boolean))];
  const products = await getProductsByIds(productIds);
  const byId = new Map(products.map((p) => [p.id, p]));
  const days = dates.map((date, i) => {
    const pid = pickFor(date, i);
    const p = pid ? byId.get(pid) : undefined;
    if (!p) return { date, label: formatDateLong(date), productId: null, productName: "", unitPrice: 0, selections: {} as Selections, summary: "", issue: "Pick a bowl" };
    const groups = p.optionGroups as GroupDef[];
    const selections = planSelections(groups, input.large);
    const price = unitPrice(p.discountPrice ?? p.basePrice, groups, selections);
    const issue = p.status !== "PUBLISHED" ? "No longer on the menu" : p.stockStatus === "SOLD_OUT" ? "Sold out for now — pick another" : null;
    return { date, label: formatDateLong(date), productId: p.id, productName: p.name, unitPrice: price, selections, summary: selectionSummary(groups, selections), issue };
  });
  if (days.some((d) => !d.productId)) blockers.push("Pick a bowl for every day.");
  else if (days.some((d) => d.issue)) blockers.push("Some bowls need changing.");

  const { subtotal, discount: planDiscount } = planSubtotal(days.map((d) => d.unitPrice), input.quantity, plan.discountPercent);
  const deliveryFee = plan.deliveryFeePerDay * dates.length;
  const totals = computeTotals({
    subtotal,
    itemDiscount: planDiscount,
    deliveryFee,
    deliveryDiscount: 0,
    taxPercent: settings.taxPercent,
    taxInclusive: settings.taxInclusive,
  });

  let areaError: string | null = null;
  let area: Awaited<ReturnType<typeof findAreaByPincode>> = null;
  if (input.pincode) {
    area = await findAreaByPincode(input.pincode);
    if (!area) areaError = "Sorry, Salad Stories is not delivering to this location yet.";
  }
  if (areaError) blockers.push(areaError);
  if (settings.deliveryPaused) blockers.push(settings.pausedMessage);

  return {
    plan: { code: plan.code, name: plan.name, days: plan.days, minDays: plan.minDays, maxDays: plan.maxDays, discountPercent: plan.discountPercent },
    slot: { id: slot.id, label: slotLabelOf(slot) },
    days,
    quantity: input.quantity,
    large: input.large,
    totals,
    savings: planDiscount,
    areaId: area?.id ?? null,
    areaError,
    blockers,
    taxLabel: settings.taxLabel,
    taxInclusive: settings.taxInclusive,
  };
}
export type PlanQuote = Awaited<ReturnType<typeof quotePlan>>;

// ---------------- Buying a plan ----------------

export const planBuySchema = planQuoteSchema.extend({
  idempotencyKey: z.string().min(8).max(80),
  contact: checkoutSchema.shape.contact,
  address: checkoutSchema.shape.address,
  notes: z.string().trim().max(300).default(""),
  saveAddress: z.boolean().optional(),
  acceptedPolicy: z.literal(true, { message: "Please confirm you've read the cancellation and refund policy" }),
});
export type PlanBuyInput = z.infer<typeof planBuySchema>;

function newPlanNumber() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `PLN-${Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("")}`;
}

/** Short "6 × Fruits Bowl, 2 × Paneer Bowl" summary. */
function bowlMix(days: { productName: string }[]) {
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d.productName, (counts.get(d.productName) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${c} × ${n}`).join(", ");
}

/** Creates the plan (pending) plus one payment order that goes through the normal Google Pay / Razorpay flow. */
export async function buyPlan(input: PlanBuyInput, userId: string): Promise<PaymentPayload & { planNumber: string }> {
  const { useUpi, pay } = await paymentMode();

  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.idempotencyKey, input.idempotencyKey));
  if (existing?.paymentOrderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, existing.paymentOrderId));
    if (o) return { ...(await startPaymentAgain(o, pay)), planNumber: existing.number };
  }

  const quote = await quotePlan({ ...input, pincode: input.address.pincode });
  if (quote.blockers.length) throw new CheckoutError(quote.blockers[0]);
  const days = quote.days;
  const plan = (await getPlanByCode(input.planCode))!;
  const start = days[0].date;
  const end = days[days.length - 1].date;
  const label = `${plan.name} plan · ${days.length} day${days.length === 1 ? "" : "s"}`;
  const instructions = [input.address.instructions, input.notes].filter(Boolean).join(" · ");

  const { sub, order } = await db.transaction(async (tx) => {
    const [sub] = await tx
      .insert(subscriptions)
      .values({
        number: newPlanNumber(),
        userId,
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        customerName: input.contact.name,
        phone: input.contact.phone,
        email: input.contact.email,
        address: { ...input.address, instructions },
        pincode: input.address.pincode,
        areaId: quote.areaId,
        slotId: quote.slot.id,
        slotName: quote.slot.label,
        quantity: input.quantity,
        large: input.large,
        notes: input.notes,
        discountPercent: plan.discountPercent,
        subtotal: quote.totals.subtotal,
        discount: quote.totals.discount,
        deliveryFee: quote.totals.deliveryFee,
        tax: quote.totals.tax,
        total: quote.totals.total,
        daysTotal: days.length,
        startDate: start,
        endDate: end,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    await tx.insert(subscriptionDays).values(
      days.map((d) => ({
        subscriptionId: sub.id,
        date: d.date,
        productId: d.productId!,
        productName: d.productName,
        selections: d.selections,
        unitPrice: d.unitPrice,
      })),
    );
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: newOrderNumber(),
        trackingToken: crypto.randomBytes(16).toString("hex"),
        idempotencyKey: `plan:${input.idempotencyKey}`,
        userId,
        kind: "PLAN",
        subscriptionId: sub.id,
        customerName: input.contact.name,
        phone: input.contact.phone,
        email: input.contact.email,
        address: { ...input.address, instructions },
        pincode: input.address.pincode,
        areaId: quote.areaId,
        slotId: null,
        deliveryDate: start,
        slotLabel: `${label} · ${formatDateLong(start)} – ${formatDateLong(end)} · ${quote.slot.label}`,
        subtotal: quote.totals.subtotal,
        discount: quote.totals.discount,
        deliveryFee: quote.totals.deliveryFee,
        tax: quote.totals.tax,
        total: quote.totals.total,
        couponCode: plan.discountPercent ? `${plan.code} ${plan.discountPercent}% OFF` : null,
      })
      .returning();
    await tx.insert(orderItems).values({
      orderId: order.id,
      productId: null,
      name: label,
      image: null,
      unitPrice: quote.totals.subtotal,
      quantity: 1,
      lineTotal: quote.totals.subtotal,
      selections: {},
      summary: `${bowlMix(days)}${input.quantity > 1 ? ` · ${input.quantity} bowls a day` : ""}${input.large ? " · Large" : ""}`,
    });
    await tx.insert(orderEvents).values({ orderId: order.id, status: "PENDING_PAYMENT", note: `Plan ${sub.number} created, waiting for payment` });
    await tx.update(subscriptions).set({ paymentOrderId: order.id }).where(eq(subscriptions.id, sub.id));
    return { sub, order };
  });

  if (input.saveAddress) {
    const saved = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId)).limit(1);
    if (!saved.length)
      await db.insert(addresses).values({ userId, fullName: input.contact.name, phone: input.contact.phone, ...input.address, isDefault: true });
  }

  return { ...(await startPayment(order, pay, useUpi)), planNumber: sub.number };
}

async function startPaymentAgain(order: typeof orders.$inferSelect, pay: Awaited<ReturnType<typeof paymentMode>>["pay"]) {
  const { paymentPayload } = await import("./orders");
  return paymentPayload(order, pay);
}

// ---------------- After payment ----------------

function dayOrderValues(sub: SubRow, day: DayRow) {
  return {
    orderNumber: newOrderNumber(),
    trackingToken: crypto.randomBytes(16).toString("hex"),
    idempotencyKey: `planday:${day.id}`,
    userId: sub.userId,
    kind: "PLAN_DAY",
    subscriptionId: sub.id,
    customerName: sub.customerName,
    phone: sub.phone,
    email: sub.email,
    address: sub.address,
    pincode: sub.pincode,
    areaId: sub.areaId,
    slotId: sub.slotId,
    deliveryDate: day.date,
    slotLabel: `${formatDateLong(day.date)}, ${sub.slotName}`,
    subtotal: 0,
    discount: 0,
    deliveryFee: 0,
    tax: 0,
    total: 0,
    status: "PAID",
    paymentStatus: "PLAN",
    paymentMethod: `${sub.planName} plan ${sub.number}`,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Kitchen-ticket text for each day's bowl (looked up before a transaction starts). */
async function summariesFor(days: { productId: string | null; selections: Selections }[]) {
  const ids = [...new Set(days.map((d) => d.productId).filter(Boolean) as string[])];
  const products = new Map((await getProductsByIds(ids)).map((p) => [p.id, p]));
  return days.map((d) => {
    const p = d.productId ? products.get(d.productId) : undefined;
    return p ? selectionSummary(p.optionGroups as GroupDef[], d.selections) : "";
  });
}

async function createDayOrder(tx: Tx, sub: SubRow, day: DayRow, note: string, summary: string) {
  const [o] = await tx.insert(orders).values(dayOrderValues(sub, day)).returning();
  await tx.insert(orderItems).values({
    orderId: o.id,
    productId: day.productId,
    name: day.productName,
    image: null,
    unitPrice: day.unitPrice,
    quantity: sub.quantity,
    lineTotal: day.unitPrice * sub.quantity,
    selections: day.selections,
    summary,
  });
  await tx.insert(orderEvents).values({ orderId: o.id, status: "PAID", note });
  await tx.update(subscriptionDays).set({ orderId: o.id }).where(eq(subscriptionDays.id, day.id));
  return o;
}

/** Called once the plan's payment is confirmed: every day becomes a kitchen order. Safe to call twice. */
export async function activateSubscription(subscriptionId: string) {
  const pending = await db.select().from(subscriptionDays).where(eq(subscriptionDays.subscriptionId, subscriptionId));
  const texts = new Map((await summariesFor(pending)).map((t, i) => [pending[i].id, t]));
  await db.transaction(async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
    if (!sub || sub.status === "CANCELLED") return;
    const days = await tx
      .select()
      .from(subscriptionDays)
      .where(and(eq(subscriptionDays.subscriptionId, sub.id), eq(subscriptionDays.status, "SCHEDULED")))
      .orderBy(asc(subscriptionDays.date));
    let i = 0;
    for (const day of days) {
      i++;
      if (!day.orderId) await createDayOrder(tx, sub, day, `Plan ${sub.number} · day ${i} of ${days.length}`, texts.get(day.id) ?? "");
    }
    await tx.update(subscriptions).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
  });
}

// ---------------- Managing a plan ----------------

const loadSubscription = (id: string) =>
  db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
    with: { days: { orderBy: asc(subscriptionDays.date), with: { order: true } } },
  });

/** Loads a plan. If its payment went through but activation didn't finish, finishes it now. */
export async function getSubscription(id: string) {
  let sub = await loadSubscription(id);
  if (sub?.status === "PENDING_PAYMENT" && sub.paymentOrderId) {
    const [o] = await db.select({ paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, sub.paymentOrderId));
    if (o?.paymentStatus === "PAID") {
      await activateSubscription(sub.id);
      sub = await loadSubscription(id);
    }
  }
  return sub ?? null;
}

/** Safety net for the nightly job: activate any paid plan that isn't active yet. */
export async function activatePaidPlans() {
  const stuck = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(orders, eq(orders.id, subscriptions.paymentOrderId))
    .where(and(eq(subscriptions.status, "PENDING_PAYMENT"), eq(orders.paymentStatus, "PAID")));
  for (const s of stuck) await activateSubscription(s.id);
  return stuck.length;
}
export type SubscriptionFull = NonNullable<Awaited<ReturnType<typeof getSubscription>>>;

/** "Active", "Waiting for payment", "Completed"… as the customer sees it. */
export function subscriptionState(sub: Pick<SubRow, "status" | "endDate">, today = istParts().dateStr) {
  if (sub.status === "ACTIVE" && sub.endDate < today) return { key: "COMPLETED", label: "Completed" };
  const labels: Record<string, string> = { PENDING_PAYMENT: "Waiting for payment", ACTIVE: "Active", COMPLETED: "Completed", CANCELLED: "Cancelled" };
  return { key: sub.status, label: labels[sub.status] ?? sub.status };
}

type Actor = { userId: string; isTeam: boolean };

async function loadForChange(subscriptionId: string, dayId: string, actor: Actor) {
  const sub = await getSubscription(subscriptionId);
  if (!sub || (!actor.isTeam && sub.userId !== actor.userId)) throw new CheckoutError("Plan not found.");
  if (sub.status !== "ACTIVE") throw new CheckoutError(sub.status === "PENDING_PAYMENT" ? "You can change days once the plan is paid." : "This plan isn't active.");
  const day = sub.days.find((d) => d.id === dayId);
  if (!day || day.status !== "SCHEDULED") throw new CheckoutError("That day can't be changed.");
  if (!actor.isTeam && !canChangeDay(day.date)) throw new CheckoutError(`Changes for ${formatDateLong(day.date)} closed at 9 pm the evening before.`);
  if (day.order && day.order.status !== "PAID") throw new CheckoutError("The kitchen has already started this day.");
  return { sub, day };
}

/** Bowls a day can be swapped to: any bowl that costs the same or less than what was paid for that day. */
export async function swapOptions(sub: Pick<SubRow, "large">, unitPriceCap: number) {
  const { getMenu } = await import("./menu");
  const { items } = await getMenu();
  return items
    .filter((p) => p.status === "PUBLISHED")
    .map((p) => {
      const groups = p.optionGroups as GroupDef[];
      const price = unitPrice(p.discountPrice ?? p.basePrice, groups, planSelections(groups, sub.large));
      return { id: p.id, name: p.name, price, ok: p.stockStatus !== "SOLD_OUT" && price <= unitPriceCap, soldOut: p.stockStatus === "SOLD_OUT" };
    });
}

export async function changePlanDay(subscriptionId: string, dayId: string, productId: string, actor: Actor) {
  const { sub, day } = await loadForChange(subscriptionId, dayId, actor);
  const [p] = await getProductsByIds([productId]);
  if (!p || p.status !== "PUBLISHED" || p.stockStatus === "SOLD_OUT") throw new CheckoutError("That bowl isn't available right now.");
  const groups = p.optionGroups as GroupDef[];
  const selections = planSelections(groups, sub.large);
  const price = unitPrice(p.discountPrice ?? p.basePrice, groups, selections);
  if (price > day.unitPrice)
    throw new CheckoutError(`${p.name} costs ${formatINR(price - day.unitPrice)} more than this day's bowl, so it can't be swapped in. Pick one up to ${formatINR(day.unitPrice)}.`);
  await db.transaction(async (tx) => {
    // Keep the paid value as the day's swap limit.
    await tx.update(subscriptionDays).set({ productId: p.id, productName: p.name, selections }).where(eq(subscriptionDays.id, day.id));
    if (day.orderId) {
      await tx.delete(orderItems).where(eq(orderItems.orderId, day.orderId));
      await tx.insert(orderItems).values({
        orderId: day.orderId,
        productId: p.id,
        name: p.name,
        image: p.image,
        unitPrice: day.unitPrice,
        quantity: sub.quantity,
        lineTotal: day.unitPrice * sub.quantity,
        selections,
        summary: selectionSummary(groups, selections),
      });
      await tx.insert(orderEvents).values({ orderId: day.orderId, status: "PAID", note: `Bowl changed from ${day.productName} to ${p.name}${actor.isTeam ? " by the team" : " by the customer"}` });
    }
  });
}

/** Skip a day: it moves to the next open delivery day after the plan's last day. */
export async function skipPlanDay(subscriptionId: string, dayId: string, actor: Actor) {
  const { sub, day } = await loadForChange(subscriptionId, dayId, actor);
  const { slot, blackout } = sub.slotId ? await deliveryContext(sub.slotId) : { slot: null, blackout: new Set<string>() };
  if (!slot) throw new CheckoutError("This plan's delivery time is no longer offered. Please contact us.");
  const lastDate = sub.days.reduce((m, d) => (d.date > m ? d.date : m), sub.endDate);
  const [newDate] = await nextDeliveryDates(slot, blackout, lastDate, 1, true);
  if (!newDate) throw new CheckoutError("We couldn't find an open day to move this to. Please contact us.");
  const [summary] = await summariesFor([day]);

  await db.transaction(async (tx) => {
    await tx.update(subscriptionDays).set({ status: "SKIPPED" }).where(eq(subscriptionDays.id, day.id));
    if (day.orderId) {
      await tx.update(orders).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(orders.id, day.orderId));
      await tx.insert(orderEvents).values({ orderId: day.orderId, status: "CANCELLED", note: `Skipped — moved to ${formatDateLong(newDate)}` });
    }
    const [added] = await tx
      .insert(subscriptionDays)
      .values({ subscriptionId: sub.id, date: newDate, productId: day.productId, productName: day.productName, selections: day.selections, unitPrice: day.unitPrice })
      .returning();
    await createDayOrder(tx, sub, added, `Plan ${sub.number} · moved from ${formatDateLong(day.date)}`, summary);
    await tx.update(subscriptions).set({ endDate: newDate, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
  });
  return newDate;
}

/** Team only: stop a plan. Future days are cancelled; any refund is done by hand. */
export async function cancelSubscription(subscriptionId: string, reason: string) {
  const sub = await getSubscription(subscriptionId);
  if (!sub) throw new CheckoutError("Plan not found.");
  const today = istParts().dateStr;
  const future = sub.days.filter((d) => d.status === "SCHEDULED" && d.date > today && d.order && d.order.status === "PAID");
  await db.transaction(async (tx) => {
    for (const d of future) {
      await tx.update(orders).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(orders.id, d.orderId!));
      await tx.insert(orderEvents).values({ orderId: d.orderId!, status: "CANCELLED", note: `Plan cancelled${reason ? `: ${reason}` : ""}` });
    }
    if (future.length) await tx.update(subscriptionDays).set({ status: "SKIPPED" }).where(inArray(subscriptionDays.id, future.map((d) => d.id)));
    await tx.update(subscriptions).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
  });
  return { cancelledDays: future.length, value: future.reduce((s, d) => s + d.unitPrice * sub.quantity, 0) };
}
