/**
 * Pure business rules for subscriptions, payments and customers.
 * No database access — shared by server code and unit tests.
 */

// ---------------- Phone numbers ----------------

/** "+91 98765 43210" → "9876543210" (Indian mobile, 10 digits). */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^0+/, "");
  return d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
}
export const isMobile = (p: string) => /^[6-9]\d{9}$/.test(p);

// ---------------- Payments ----------------

export type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "REFUNDED";

export type LedgerRow = { type: string; amount: number; status: string };

/** Sums the ledger: only RECEIVED rows count as money in or out. */
export function ledgerTotals(rows: LedgerRow[]) {
  let received = 0;
  let refunded = 0;
  let toVerify = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === "RECEIVED") {
      if (r.type === "REFUND") refunded += r.amount;
      else received += r.amount;
    } else if (r.status === "PENDING_VERIFICATION" && r.type === "PAYMENT") toVerify += r.amount;
    else if (r.status === "FAILED") failed += 1;
  }
  return { received, refunded, net: received - refunded, toVerify, failed };
}

/** Pending / Partially paid / Paid / Failed / Refunded for a bill of `total` paise. */
export function paymentStatus(total: number, rows: LedgerRow[]): PaymentStatus {
  const t = ledgerTotals(rows);
  if (t.refunded > 0 && t.net <= 0) return "REFUNDED";
  if (t.net >= total && total > 0) return "PAID";
  if (total === 0) return "PAID";
  if (t.net > 0) return "PARTIALLY_PAID";
  if (t.failed > 0 && t.toVerify === 0) return "FAILED";
  return "PENDING";
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

// ---------------- Subscription schedule ----------------

export type DayLite = { date: string; status: string; orderStatus?: string | null };

/**
 * Counts for a subscription. Every paid delivery is one row; a row is
 * SCHEDULED (to deliver / delivered), HELD (skip requested), FORFEITED (used up),
 * or SKIPPED (moved — replaced by another row, so it doesn't count).
 * A scheduled day counts as delivered once its kitchen order is delivered or its date has passed.
 */
export function scheduleStats(days: DayLite[], paidDays: number, extraAuthorized: number, today: string) {
  const live = days.filter((d) => d.status === "SCHEDULED" && d.orderStatus !== "CANCELLED");
  const delivered = live.filter((d) => d.orderStatus === "DELIVERED" || d.date < today).length;
  const upcoming = live.length - delivered;
  const held = days.filter((d) => d.status === "HELD").length;
  const forfeited = days.filter((d) => d.status === "FORFEITED").length;
  const moved = days.filter((d) => d.status === "SKIPPED").length;
  const entitled = paidDays + extraAuthorized;
  return {
    entitled,
    delivered,
    upcoming,
    held,
    forfeited,
    moved,
    /** Deliveries still owed to the customer (upcoming + waiting for a decision). */
    remaining: upcoming + held,
    /** Paid days not yet placed on the calendar (should be 0; >0 means a day needs scheduling). */
    unscheduled: Math.max(0, entitled - live.length - held - forfeited),
    complete: upcoming === 0 && held === 0 && live.length + forfeited >= entitled,
  };
}

/** "Day 8 of 22": position of a date among the days that use up the plan. */
export function dayNumber(days: DayLite[], date: string) {
  return days.filter((d) => (d.status === "SCHEDULED" || d.status === "FORFEITED") && d.date < date).length + 1;
}

// ---------------- Customers ----------------

export type CustomerStatus = "NEW" | "TRIAL" | "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  NEW: "New",
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

/** Derived from the customer's subscriptions, so it never goes out of date. */
export function customerStatus(
  manual: string | null | undefined,
  subs: { status: string; endDate: string; isTrial: boolean }[],
  today: string,
): CustomerStatus {
  if (manual === "CANCELLED") return "CANCELLED";
  if (manual === "PAUSED" || subs.some((s) => s.status === "PAUSED")) return "PAUSED";
  const running = subs.filter((s) => s.status === "ACTIVE" && s.endDate >= today);
  if (running.length) return running.every((s) => s.isTrial) ? "TRIAL" : "ACTIVE";
  if (subs.some((s) => s.status === "ACTIVE" || s.status === "COMPLETED")) return "EXPIRED";
  if (subs.length && subs.every((s) => s.status === "CANCELLED")) return "CANCELLED";
  return "NEW";
}

// ---------------- Plan pricing ----------------

export type PlanPriceInput = {
  fixedPrice: number; // price for the whole plan (or pricePerDay × days for pick-your-days)
  days: number;
  premiumDays: number;
  premiumSurchargePerDay: number;
  large: boolean;
  largeSurchargePerDay: number;
  quantity: number;
  discountPercent: number;
};

/** Fixed plan price + premium-bowl days + large portions, × bowls per day, minus any plan discount. */
export function planPrice(i: PlanPriceInput) {
  const base = i.fixedPrice;
  const premium = i.premiumDays * i.premiumSurchargePerDay;
  const large = i.large ? i.days * i.largeSurchargePerDay : 0;
  const subtotal = (base + premium + large) * i.quantity;
  const discount = Math.round((subtotal * i.discountPercent) / 100);
  return { base: base * i.quantity, premium: premium * i.quantity, large: large * i.quantity, subtotal, discount };
}

/** Value of one delivery day (for kitchen tickets and refunds of unused days). */
export function dayValue(i: Pick<PlanPriceInput, "fixedPrice" | "days" | "premiumSurchargePerDay" | "large" | "largeSurchargePerDay">, premium: boolean) {
  return Math.round(i.fixedPrice / Math.max(1, i.days)) + (premium ? i.premiumSurchargePerDay : 0) + (i.large ? i.largeSurchargePerDay : 0);
}

/** A day paid as STANDARD can only be swapped to STANDARD bowls; PREMIUM days can take either. */
export const tierAllows = (paidTier: string, bowlTier: string) => paidTier === "PREMIUM" || bowlTier !== "PREMIUM";
