import "server-only";
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { blackoutDates, db, deliverySlots, orderEvents, orders, scheduleRequests, subscriptionDays, subscriptions, type DB } from "@/db";
import { addDays, dayOfWeek, formatDateLong, formatTime, istParts } from "../time";
import { canChangeDay, parseWeekdays } from "../plans-core";
import { audit, type Actor } from "./audit";
import { BizError } from "./customers";
import { enqueue, toOwner } from "./outbox";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Outcome = "RESCHEDULED" | "CARRIED_FORWARD" | "FORFEITED" | "RESTORED";
export const OUTCOME_LABELS: Record<string, string> = {
  RESCHEDULED: "Moved to a new date",
  CARRIED_FORWARD: "Added to the end of the plan",
  FORFEITED: "Forfeited (not delivered)",
  RESTORED: "Request declined — delivery kept",
  PAUSED: "Plan paused",
  RESUMED: "Plan resumed",
};

async function loadSub(id: string) {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
    with: { days: { orderBy: asc(subscriptionDays.date), with: { order: true } } },
  });
  if (!sub) throw new BizError("Plan not found.");
  return sub;
}

async function slotOf(slotId: string | null) {
  if (!slotId) return null;
  const [s] = await db.select().from(deliverySlots).where(eq(deliverySlots.id, slotId));
  return s ?? null;
}

/** Can this customer get a delivery on `date` in their slot (runs that day, not a holiday, no other plan delivery)? */
async function checkDate(sub: { id: string; customerId: string | null; slotId: string | null; weekdays: string }, date: string, opts: { allowDuplicate?: boolean; ignoreDayId?: string } = {}) {
  const today = istParts().dateStr;
  if (date <= today) throw new BizError("Pick a date from tomorrow onwards.");
  const slot = await slotOf(sub.slotId);
  if (!slot) throw new BizError("This plan's delivery time is no longer offered — change it first.");
  if (!slot.daysOfWeek.split(",").map(Number).includes(dayOfWeek(date))) throw new BizError(`We don't deliver ${slot.name} on ${formatDateLong(date)}.`);
  const [holiday] = await db.select().from(blackoutDates).where(eq(blackoutDates.date, date));
  if (holiday) throw new BizError(`${formatDateLong(date)} is marked closed${holiday.reason ? ` (${holiday.reason})` : ""}.`);
  // The same plan can never deliver twice on one day.
  const [own] = await db
    .select({ id: subscriptionDays.id })
    .from(subscriptionDays)
    .where(and(eq(subscriptionDays.subscriptionId, sub.id), eq(subscriptionDays.date, date), eq(subscriptionDays.status, "SCHEDULED"), opts.ignoreDayId ? ne(subscriptionDays.id, opts.ignoreDayId) : undefined));
  if (own) throw new BizError(`This plan already has a delivery on ${formatDateLong(date)}. Pick another date.`);
  if (!opts.allowDuplicate && sub.customerId) {
    const [clash] = await db
      .select({ n: subscriptions.number })
      .from(subscriptionDays)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionDays.subscriptionId))
      .where(and(eq(subscriptions.customerId, sub.customerId), eq(subscriptionDays.date, date), eq(subscriptionDays.status, "SCHEDULED"), inArray(subscriptions.status, ["ACTIVE", "PENDING_PAYMENT", "PAUSED"])));
    if (clash) throw new BizError(`This customer already has a plan delivery on ${formatDateLong(date)} (${clash.n}). Tick "allow two deliveries" if that's intended.`);
  }
  return slot;
}

/** Next delivery day after the plan's last scheduled day, on the customer's weekdays. */
async function nextDayAfterEnd(sub: { id: string; customerId: string | null; slotId: string | null; weekdays: string; days: { date: string; status: string }[] }) {
  const last = sub.days.filter((d) => d.status === "SCHEDULED").map((d) => d.date).sort().pop() ?? istParts().dateStr;
  const wd = parseWeekdays(sub.weekdays);
  for (let d = addDays(last > istParts().dateStr ? last : istParts().dateStr, 1), i = 0; i < 120; d = addDays(d, 1), i++) {
    if (!wd.includes(dayOfWeek(d))) continue;
    try {
      await checkDate(sub, d);
      return d;
    } catch {
      /* closed, holiday or clash — try the next day */
    }
  }
  throw new BizError("No open delivery day found in the next 4 months.");
}

const endOf = (days: { date: string; status: string }[], fallback: string) => days.filter((d) => d.status === "SCHEDULED").map((d) => d.date).sort().pop() ?? fallback;

/** Customer (24 h before) or team asks to skip a day, optionally suggesting a new date. The day is held off the kitchen sheet until decided. */
export async function requestSkip(
  d: { subscriptionId: string; dayId: string; reason: string; requestedDate?: string | null },
  by: { actor: Actor; customer: boolean; userId?: string | null },
) {
  const sub = await loadSub(d.subscriptionId);
  if (by.customer && sub.userId !== by.userId) throw new BizError("Plan not found.");
  if (sub.status !== "ACTIVE") throw new BizError("Only active plans can skip days.");
  const day = sub.days.find((x) => x.id === d.dayId);
  if (!day || day.status !== "SCHEDULED") throw new BizError("That day can't be skipped.");
  if (day.order && day.order.status !== "PAID") throw new BizError("The kitchen has already started this day.");
  const slot = await slotOf(sub.slotId);
  if (by.customer && !canChangeDay(day.date, slot?.startTime ?? "00:00"))
    throw new BizError(`Skips for ${formatDateLong(day.date)} closed 24 hours before delivery. Please message us.`);
  const [open] = await db.select().from(scheduleRequests).where(and(eq(scheduleRequests.dayId, day.id), eq(scheduleRequests.status, "PENDING")));
  if (open) throw new BizError("There's already a request for this day.");

  const req = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(scheduleRequests)
      .values({
        subscriptionId: sub.id,
        dayId: day.id,
        type: d.requestedDate ? "RESCHEDULE" : "SKIP",
        originalDate: day.date,
        requestedDate: d.requestedDate || null,
        reason: d.reason.slice(0, 300),
        requestedBy: by.actor.name,
        requestedByCustomer: by.customer,
        endDateBefore: sub.endDate,
      })
      .returning();
    await tx.update(subscriptionDays).set({ status: "HELD" }).where(eq(subscriptionDays.id, day.id));
    if (day.orderId) {
      await tx.update(orders).set({ status: "HELD", updatedAt: new Date() }).where(eq(orders.id, day.orderId));
      await tx.insert(orderEvents).values({ orderId: day.orderId, status: "HELD", note: `Skip requested by ${by.actor.name}${d.reason ? `: ${d.reason}` : ""}` });
    }
    await audit(tx, "day", day.id, "skip requested", { before: { status: "SCHEDULED", date: day.date }, after: { status: "HELD", requestedDate: d.requestedDate ?? null }, reason: d.reason, actor: by.actor });
    return r;
  });
  await enqueue(
    "SKIP_REQUEST",
    `request:${req.id}`,
    toOwner(
      `Skip request · ${sub.customerName}`,
      `${sub.customerName} asked to skip ${formatDateLong(day.date)} (${sub.planName} plan ${sub.number}).${d.requestedDate ? `\nWould like it on ${formatDateLong(d.requestedDate)} instead.` : ""}${d.reason ? `\nReason: ${d.reason}` : ""}\nThe delivery is held off the kitchen sheet until you decide: reschedule, add to the end, or forfeit.`,
      `${sub.customerName}: skip ${formatDateLong(day.date)} — decide`,
      "/admin/requests",
    ),
  );
  return req;
}

/** Owner's decision. Records who decided, the final date and the effect on the plan's end date. */
export async function decideRequest(
  requestId: string,
  decision: { outcome: Outcome; date?: string | null; note?: string; allowDuplicate?: boolean },
  actor: Actor,
) {
  const [req] = await db.select().from(scheduleRequests).where(eq(scheduleRequests.id, requestId));
  if (!req || req.status !== "PENDING") throw new BizError("This request has already been decided.");
  if (!req.dayId) throw new BizError("This request has no delivery day.");
  const sub = await loadSub(req.subscriptionId);
  const day = sub.days.find((x) => x.id === req.dayId);
  if (!day || day.status !== "HELD") throw new BizError("That day isn't waiting for a decision.");

  let finalDate: string | null = null;
  if (decision.outcome === "RESCHEDULED") {
    if (!decision.date) throw new BizError("Pick the new delivery date.");
    await checkDate(sub, decision.date, { allowDuplicate: decision.allowDuplicate, ignoreDayId: day.id });
    finalDate = decision.date;
  } else if (decision.outcome === "CARRIED_FORWARD") {
    finalDate = await nextDayAfterEnd(sub);
  } else if (decision.outcome === "RESTORED") {
    if (day.date <= istParts().dateStr) throw new BizError("That date has passed — reschedule or forfeit it instead.");
    finalDate = day.date;
  }
  const slot = await slotOf(sub.slotId);

  await db.transaction(async (tx: Tx) => {
    if (decision.outcome === "FORFEITED") {
      await tx.update(subscriptionDays).set({ status: "FORFEITED" }).where(eq(subscriptionDays.id, day.id));
      if (day.orderId) {
        await tx.update(orders).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(orders.id, day.orderId));
        await tx.insert(orderEvents).values({ orderId: day.orderId, status: "CANCELLED", note: `Forfeited — decided by ${actor.name}` });
      }
    } else {
      await tx.update(subscriptionDays).set({ status: "SCHEDULED", date: finalDate!, originalDate: day.originalDate ?? day.date }).where(eq(subscriptionDays.id, day.id));
      if (day.orderId) {
        await tx
          .update(orders)
          .set({
            status: "PAID",
            deliveryDate: finalDate!,
            slotLabel: slot ? `${formatDateLong(finalDate!)}, ${slot.name} (${formatTime(slot.startTime)} – ${formatTime(slot.endTime)})` : `${formatDateLong(finalDate!)}`,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, day.orderId));
        await tx.insert(orderEvents).values({ orderId: day.orderId, status: "PAID", note: finalDate === day.date ? `Skip declined — delivery kept (${actor.name})` : `Moved from ${formatDateLong(day.date)} to ${formatDateLong(finalDate!)} (${actor.name})` });
      }
    }
    const daysAfter = sub.days.map((x) => (x.id === day.id ? { ...x, status: decision.outcome === "FORFEITED" ? "FORFEITED" : "SCHEDULED", date: finalDate ?? x.date } : x));
    const endAfter = endOf(daysAfter, sub.endDate);
    await tx.update(subscriptions).set({ endDate: endAfter, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await tx
      .update(scheduleRequests)
      .set({ status: decision.outcome === "RESTORED" ? "REJECTED" : "APPROVED", outcome: decision.outcome, finalDate, decidedBy: actor.name, decidedAt: new Date(), endDateBefore: sub.endDate, endDateAfter: endAfter, note: decision.note ?? "" })
      .where(eq(scheduleRequests.id, req.id));
    await audit(tx, "request", req.id, `decided: ${OUTCOME_LABELS[decision.outcome].toLowerCase()}`, {
      before: { date: day.date, endDate: sub.endDate },
      after: { finalDate, endDate: endAfter, outcome: decision.outcome, allowDuplicate: !!decision.allowDuplicate },
      reason: decision.note ?? "",
      actor,
    });
    await audit(tx, "day", day.id, OUTCOME_LABELS[decision.outcome].toLowerCase(), { before: { date: day.date, status: "HELD" }, after: { date: finalDate, status: decision.outcome === "FORFEITED" ? "FORFEITED" : "SCHEDULED" }, reason: decision.note ?? req.reason, actor });
    if (endAfter !== sub.endDate)
      await audit(tx, "subscription", sub.id, "end date changed", { before: { endDate: sub.endDate }, after: { endDate: endAfter }, reason: `${OUTCOME_LABELS[decision.outcome]} (request from ${req.requestedBy})`, actor });
  });
  return { finalDate };
}

/** Team logs a skip/reschedule from WhatsApp or a call, and decides it straight away. */
export async function skipNow(
  d: { subscriptionId: string; dayId: string; reason: string; outcome: Outcome; date?: string | null; allowDuplicate?: boolean },
  actor: Actor,
) {
  if (d.reason.trim().length < 3) throw new BizError("Add a reason (kept in the plan history).");
  if (d.outcome === "RESCHEDULED") {
    if (!d.date) throw new BizError("Pick the new delivery date.");
    await checkDate(await loadSub(d.subscriptionId), d.date, { allowDuplicate: d.allowDuplicate, ignoreDayId: d.dayId });
  }
  const req = await requestSkip({ subscriptionId: d.subscriptionId, dayId: d.dayId, reason: d.reason, requestedDate: d.date ?? null }, { actor, customer: false });
  return decideRequest(req.id, { outcome: d.outcome, date: d.date, note: d.reason, allowDuplicate: d.allowDuplicate }, actor);
}

/** Pause from a date: future days are held off the kitchen sheet. */
export async function pausePlan(subscriptionId: string, from: string, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new BizError("Add a reason for the pause.");
  const sub = await loadSub(subscriptionId);
  if (sub.status !== "ACTIVE") throw new BizError("Only active plans can be paused.");
  const hold = sub.days.filter((d) => d.status === "SCHEDULED" && d.date >= from && (!d.order || d.order.status === "PAID"));
  if (!hold.length) throw new BizError("There are no upcoming deliveries to pause from that date.");
  await db.transaction(async (tx) => {
    await tx.update(subscriptionDays).set({ status: "HELD" }).where(inArray(subscriptionDays.id, hold.map((d) => d.id)));
    const orderIds = hold.map((d) => d.orderId).filter(Boolean) as string[];
    if (orderIds.length) {
      await tx.update(orders).set({ status: "HELD", updatedAt: new Date() }).where(inArray(orders.id, orderIds));
      await tx.insert(orderEvents).values(orderIds.map((orderId) => ({ orderId, status: "HELD", note: `Plan paused by ${actor.name}` })));
    }
    await tx.update(subscriptions).set({ status: "PAUSED", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await tx.insert(scheduleRequests).values({
      subscriptionId: sub.id, type: "PAUSE", originalDate: from, reason, requestedBy: actor.name, status: "APPROVED", outcome: "PAUSED",
      decidedBy: actor.name, decidedAt: new Date(), endDateBefore: sub.endDate, endDateAfter: sub.endDate, note: `${hold.length} deliveries held`,
    });
    await audit(tx, "subscription", sub.id, "paused", { before: { status: "ACTIVE" }, after: { status: "PAUSED", from, held: hold.length }, reason, actor });
  });
  return hold.length;
}

/** Resume: held days go back on the calendar from the resume date, on the customer's weekdays. */
export async function resumePlan(subscriptionId: string, from: string, actor: Actor) {
  const sub = await loadSub(subscriptionId);
  if (sub.status !== "PAUSED") throw new BizError("This plan isn't paused.");
  const pendingSkip = (await db.select({ dayId: scheduleRequests.dayId }).from(scheduleRequests).where(and(eq(scheduleRequests.subscriptionId, sub.id), eq(scheduleRequests.status, "PENDING")))).map((r) => r.dayId);
  const held = sub.days.filter((d) => d.status === "HELD" && !pendingSkip.includes(d.id));
  const wd = parseWeekdays(sub.weekdays);
  const dates: string[] = [];
  for (let d = from, i = 0; dates.length < held.length && i < 200; d = addDays(d, 1), i++) {
    if (!wd.includes(dayOfWeek(d))) continue;
    try {
      await checkDate(sub, d, { ignoreDayId: undefined });
      dates.push(d);
    } catch {
      /* skip closed days */
    }
  }
  if (dates.length < held.length) throw new BizError("Not enough open delivery days to resume — check holidays and the delivery time.");
  const slot = await slotOf(sub.slotId);
  const endBefore = sub.endDate;
  await db.transaction(async (tx) => {
    for (let i = 0; i < held.length; i++) {
      const day = held[i];
      const date = dates[i];
      await tx.update(subscriptionDays).set({ status: "SCHEDULED", date, originalDate: day.originalDate ?? day.date }).where(eq(subscriptionDays.id, day.id));
      if (day.orderId) {
        await tx
          .update(orders)
          .set({ status: "PAID", deliveryDate: date, slotLabel: slot ? `${formatDateLong(date)}, ${slot.name} (${formatTime(slot.startTime)} – ${formatTime(slot.endTime)})` : formatDateLong(date), updatedAt: new Date() })
          .where(eq(orders.id, day.orderId));
        await tx.insert(orderEvents).values({ orderId: day.orderId, status: "PAID", note: `Plan resumed — moved to ${formatDateLong(date)}` });
      }
    }
    const endAfter = [...dates, ...sub.days.filter((d) => d.status === "SCHEDULED").map((d) => d.date)].sort().pop() ?? endBefore;
    await tx.update(subscriptions).set({ status: "ACTIVE", endDate: endAfter, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await tx.insert(scheduleRequests).values({
      subscriptionId: sub.id, type: "RESUME", originalDate: from, requestedBy: actor.name, status: "APPROVED", outcome: "RESUMED",
      decidedBy: actor.name, decidedAt: new Date(), endDateBefore: endBefore, endDateAfter: endAfter, note: `${held.length} deliveries rescheduled from ${formatDateLong(from)}`,
    });
    await audit(tx, "subscription", sub.id, "resumed", { before: { status: "PAUSED", endDate: endBefore }, after: { status: "ACTIVE", endDate: endAfter, rescheduled: held.length }, actor });
  });
  return dates;
}

export async function listRequests(status: "PENDING" | "DONE" = "PENDING") {
  return db
    .select({ r: scheduleRequests, customerName: subscriptions.customerName, customerId: subscriptions.customerId, phone: subscriptions.phone, planName: subscriptions.planName, number: subscriptions.number, endDate: subscriptions.endDate })
    .from(scheduleRequests)
    .innerJoin(subscriptions, eq(subscriptions.id, scheduleRequests.subscriptionId))
    .where(status === "PENDING" ? eq(scheduleRequests.status, "PENDING") : ne(scheduleRequests.status, "PENDING"))
    .orderBy(status === "PENDING" ? asc(scheduleRequests.originalDate) : desc(scheduleRequests.decidedAt))
    .limit(200);
}

export async function requestsForPlan(subscriptionId: string) {
  return db.select().from(scheduleRequests).where(eq(scheduleRequests.subscriptionId, subscriptionId)).orderBy(desc(scheduleRequests.createdAt));
}

/** Suggested date for "add to the end" (shown before deciding). */
export async function carryForwardPreview(subscriptionId: string) {
  const sub = await loadSub(subscriptionId);
  return nextDayAfterEnd(sub).catch(() => null);
}

export async function pendingRequestCount() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(scheduleRequests).where(eq(scheduleRequests.status, "PENDING"));
  return n;
}
