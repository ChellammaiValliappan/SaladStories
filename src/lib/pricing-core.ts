/**
 * Pure pricing + coupon rules (no database access) so they can be unit tested.
 *
 * Final payable = Subtotal − Discount + Tax + Delivery fee   (BRD §6.2)
 */

export type CouponType = "PERCENT" | "FLAT" | "FREE_DELIVERY";

export interface CouponRule {
  id: string;
  code: string;
  type: CouponType | string;
  value: number; // percent for PERCENT, paise for FLAT
  maxDiscount: number | null;
  minOrder: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  totalLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  productIds: string[];
  categoryIds: string[];
  areaIds: string[];
  isActive: boolean;
}

export interface PricedLine {
  productId: string;
  categoryId: string | null;
  lineTotal: number;
}

export interface CouponContext {
  now: Date;
  lines: PricedLine[];
  subtotal: number;
  deliveryFee: number;
  areaId: string | null;
  totalUsed: number; // redeemed + live reservations (excluding this order)
  customerUsed: number; // same, for this customer
  customerPaidOrders: number;
  disabledTypes: string[];
}

export type CouponCheck =
  | { ok: true; itemDiscount: number; deliveryDiscount: number; message: string }
  | { ok: false; message: string };

export const COUPON_MESSAGES = {
  applied: "Coupon applied successfully!",
  notFound: "We couldn't find that coupon code. Check the spelling and try again.",
  inactive: "This coupon isn't active right now.",
  notStarted: "This coupon isn't valid yet.",
  expired: "This coupon has expired.",
  minOrder: "Your order does not meet the minimum purchase requirement.",
  firstOrder: "This coupon is valid for first-time customers only.",
  totalLimit: "This coupon has reached its redemption limit.",
  customerLimit: "You've already used this coupon.",
  items: "This coupon is not applicable to the selected items.",
  area: "This coupon isn't valid for your delivery location.",
  noDeliveryFee: "Your order already has free delivery.",
  disabled: "This type of offer is paused right now.",
} as const;

export function evaluateCoupon(c: CouponRule, ctx: CouponContext): CouponCheck {
  const fmt = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
  if (!c.isActive) return { ok: false, message: COUPON_MESSAGES.inactive };
  if (ctx.disabledTypes.includes(c.type)) return { ok: false, message: COUPON_MESSAGES.disabled };
  if (c.startsAt && ctx.now < c.startsAt) return { ok: false, message: COUPON_MESSAGES.notStarted };
  if (c.expiresAt && ctx.now > c.expiresAt) return { ok: false, message: COUPON_MESSAGES.expired };
  if (c.totalLimit != null && ctx.totalUsed >= c.totalLimit)
    return { ok: false, message: COUPON_MESSAGES.totalLimit };
  if (c.perCustomerLimit != null && ctx.customerUsed >= c.perCustomerLimit)
    return { ok: false, message: COUPON_MESSAGES.customerLimit };
  if (c.firstOrderOnly && ctx.customerPaidOrders > 0)
    return { ok: false, message: COUPON_MESSAGES.firstOrder };
  if (c.areaIds.length && (!ctx.areaId || !c.areaIds.includes(ctx.areaId)))
    return { ok: false, message: COUPON_MESSAGES.area };

  // Eligible amount: whole subtotal, or only matching products/categories.
  const restricted = c.productIds.length > 0 || c.categoryIds.length > 0;
  const eligible = restricted
    ? ctx.lines
        .filter(
          (l) =>
            c.productIds.includes(l.productId) ||
            (l.categoryId != null && c.categoryIds.includes(l.categoryId)),
        )
        .reduce((s, l) => s + l.lineTotal, 0)
    : ctx.subtotal;

  if (restricted && eligible === 0) return { ok: false, message: COUPON_MESSAGES.items };
  if (c.minOrder != null && eligible < c.minOrder)
    return {
      ok: false,
      message: `${COUPON_MESSAGES.minOrder} Add ${fmt(c.minOrder - eligible)} more to use it.`,
    };

  if (c.type === "FREE_DELIVERY") {
    if (ctx.deliveryFee <= 0) return { ok: false, message: COUPON_MESSAGES.noDeliveryFee };
    return { ok: true, itemDiscount: 0, deliveryDiscount: ctx.deliveryFee, message: COUPON_MESSAGES.applied };
  }

  let discount = 0;
  if (c.type === "PERCENT") {
    discount = Math.round((eligible * Math.min(100, Math.max(0, c.value))) / 100);
    if (c.maxDiscount != null) discount = Math.min(discount, c.maxDiscount);
  } else if (c.type === "FLAT") {
    discount = Math.max(0, c.value);
  }
  // Never discount more than the eligible amount.
  discount = Math.min(discount, eligible);
  return { ok: true, itemDiscount: discount, deliveryDiscount: 0, message: COUPON_MESSAGES.applied };
}

export interface TotalsInput {
  subtotal: number;
  itemDiscount: number;
  deliveryFee: number;
  deliveryDiscount: number;
  taxPercent: number;
  taxInclusive: boolean;
}

export interface Totals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
}

export function computeTotals(i: TotalsInput): Totals {
  const itemDiscount = Math.min(i.itemDiscount, i.subtotal);
  const deliveryDiscount = Math.min(i.deliveryDiscount, i.deliveryFee);
  const taxable = i.subtotal - itemDiscount;
  const tax = i.taxInclusive ? 0 : Math.round((taxable * Math.max(0, i.taxPercent)) / 100);
  const discount = itemDiscount + deliveryDiscount;
  const total = Math.max(0, i.subtotal - discount + tax + i.deliveryFee);
  return { subtotal: i.subtotal, discount, deliveryFee: i.deliveryFee, tax, total };
}

/** Delivery fee: area fee (or flat fee), waived above the free-delivery threshold. */
export function deliveryFeeFor(
  subtotal: number,
  areaFee: number | null | undefined,
  flatFee: number,
  freeAbove: number | null | undefined,
) {
  if (freeAbove != null && freeAbove > 0 && subtotal >= freeAbove) return 0;
  return areaFee ?? flatFee;
}
