import { and, asc, count, eq, gte, inArray, ne, or } from "drizzle-orm";
import { blackoutDates, db, deliveryAreas, deliverySlots, orders } from "@/db";
import { getSettings } from "./settings";
import { addDays, dayOfWeek, formatDateLabel, formatDateLong, formatTime, istParts, toMinutes } from "./time";

export const PINCODE_RE = /^[1-9][0-9]{5}$/;

/** Unpaid checkouts hold a slot place (and a limited coupon) for this long. */
export const PENDING_HOLD_MINUTES = 20;

export const ACTIVE_ORDER_STATUSES = ["PAID", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"];

/** Orders that count against capacity: active ones plus fresh unpaid checkouts. */
export function occupyingOrders() {
  const holdSince = new Date(Date.now() - PENDING_HOLD_MINUTES * 60_000);
  return or(
    inArray(orders.status, ACTIVE_ORDER_STATUSES),
    // Customer says they paid by UPI and the owner hasn't checked yet.
    and(eq(orders.status, "PENDING_PAYMENT"), eq(orders.paymentStatus, "VERIFYING")),
    and(eq(orders.status, "PENDING_PAYMENT"), gte(orders.createdAt, holdSince)),
  )!;
}

export async function findAreaByPincode(pincode: string) {
  const pin = pincode.trim();
  if (!PINCODE_RE.test(pin)) return null;
  const areas = await db.select().from(deliveryAreas).where(eq(deliveryAreas.isActive, true));
  return areas.find((a) => a.pincodes.split(/[,\s]+/).map((p) => p.trim()).includes(pin)) ?? null;
}

export interface SlotOption {
  slotId: string;
  date: string;
  dateLabel: string;
  name: string;
  timeLabel: string;
  remaining: number;
  available: boolean;
  reason?: string;
}

export async function slotUsage(date: string, slotId: string, excludeOrderId?: string) {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.deliveryDate, date),
        eq(orders.slotId, slotId),
        excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
        occupyingOrders(),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function listSlotOptions() {
  const settings = await getSettings();
  const now = istParts();
  const days: { date: string; label: string; slots: SlotOption[] }[] = [];
  if (settings.deliveryPaused) return { days };

  const [slots, blackouts] = await Promise.all([
    db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder), asc(deliverySlots.startTime)),
    db.select().from(blackoutDates).where(gte(blackoutDates.date, now.dateStr)),
  ]);
  const blackoutSet = new Set(blackouts.map((b) => b.date));
  const startOffset = settings.sameDayOrders ? 0 : 1;
  const lastOffset = Math.max(startOffset, settings.advanceDays);

  for (let offset = startOffset; offset <= lastOffset; offset++) {
    const date = addDays(now.dateStr, offset);
    if (blackoutSet.has(date)) continue;
    const dow = dayOfWeek(date);
    const options: SlotOption[] = [];
    for (const s of slots) {
      const allowed = s.daysOfWeek.split(",").map((d) => Number(d.trim()));
      if (!allowed.includes(dow)) continue;
      const used = await slotUsage(date, s.id);
      const remaining = Math.max(0, s.maxOrders - used);
      let reason: string | undefined;
      if (offset === 0 && now.minutes > toMinutes(s.startTime) - s.cutoffMinutes) reason = "Closed for today";
      else if (remaining === 0) reason = "Fully booked";
      options.push({
        slotId: s.id,
        date,
        dateLabel: formatDateLabel(date, now.dateStr),
        name: s.name,
        timeLabel: `${formatTime(s.startTime)} – ${formatTime(s.endTime)}`,
        remaining,
        available: !reason,
        reason,
      });
    }
    if (options.some((o) => o.available)) days.push({ date, label: formatDateLabel(date, now.dateStr), slots: options });
  }
  return { days };
}

/** Server-side re-check right before an order is created. */
export async function checkSlotBookable(date: string, slotId: string) {
  const { days } = await listSlotOptions();
  const slot = days.find((d) => d.date === date)?.slots.find((s) => s.slotId === slotId);
  if (!slot) return { ok: false as const, message: "That delivery slot isn't available. Please pick another." };
  if (!slot.available)
    return { ok: false as const, message: `That slot is ${slot.reason?.toLowerCase()}. Please pick another.` };
  return { ok: true as const, label: `${formatDateLong(date)}, ${slot.name} (${slot.timeLabel})` };
}
