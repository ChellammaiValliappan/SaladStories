import { z } from "zod";
import { and, count, eq, gt, like, ne, or, sum } from "drizzle-orm";
import { couponRedemptions, coupons, db, orderItems, orders } from "@/db";
import { getSettings } from "./settings";
import { findAreaByPincode, occupyingOrders } from "./delivery";
import { getProductsByIds } from "./menu";
import {
  GroupDef,
  normalizeSelections,
  selectionKey,
  selectionSummary,
  unitPrice,
  validateSelections,
} from "./customization";
import { computeTotals, CouponRule, deliveryFeeFor, evaluateCoupon, PricedLine } from "./pricing-core";
import { istParts } from "./time";

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  selections: z.record(z.string(), z.record(z.string(), z.number().int().min(0).max(20))).default({}),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const quoteSchema = z.object({
  items: z.array(cartItemSchema).max(40),
  couponCode: z.string().trim().max(40).optional().nullable(),
  pincode: z.string().trim().max(10).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export interface QuoteLine {
  key: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  accent: string;
  isVeg: boolean;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  summary: string;
  selections: Record<string, Record<string, number>>;
  issue: string | null;
}

export function customerKeyOf(email?: string | null, phone?: string | null) {
  if (email && email.includes("@")) return email.trim().toLowerCase();
  if (phone) return phone.replace(/\D/g, "").slice(-10);
  return null;
}

type CouponRow = typeof coupons.$inferSelect;
export const toRule = (c: CouponRow): CouponRule => c;

/** Units of a product already sold for a delivery date (for daily limits). */
async function soldForDate(productId: string, date: string) {
  const [row] = await db
    .select({ n: sum(orderItems.quantity) })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.productId, productId), eq(orders.deliveryDate, date), occupyingOrders()));
  return Number(row?.n ?? 0);
}

/** Redemptions that count against limits: redeemed, or reserved and not yet expired. */
export function liveRedemptions(couponId: string, excludeOrderId?: string) {
  return and(
    eq(couponRedemptions.couponId, couponId),
    excludeOrderId ? ne(couponRedemptions.orderId, excludeOrderId) : undefined,
    or(
      eq(couponRedemptions.status, "REDEEMED"),
      and(eq(couponRedemptions.status, "RESERVED"), gt(couponRedemptions.expiresAt, new Date())),
    ),
  );
}

export async function couponUsage(couponId: string, customerKey: string | null, excludeOrderId?: string) {
  const [total] = await db.select({ n: count() }).from(couponRedemptions).where(liveRedemptions(couponId, excludeOrderId));
  let customerUsed = 0;
  if (customerKey) {
    const [mine] = await db
      .select({ n: count() })
      .from(couponRedemptions)
      .where(and(liveRedemptions(couponId, excludeOrderId), eq(couponRedemptions.customerKey, customerKey)));
    customerUsed = Number(mine?.n ?? 0);
  }
  return { totalUsed: Number(total?.n ?? 0), customerUsed };
}

export async function paidOrderCount(email?: string | null, phone?: string | null) {
  const conds = [];
  if (email) conds.push(eq(orders.email, email.trim().toLowerCase()));
  const digits = phone?.replace(/\D/g, "").slice(-10);
  if (digits && digits.length === 10) conds.push(like(orders.phone, `%${digits}`));
  if (!conds.length) return 0;
  const [row] = await db.select({ n: count() }).from(orders).where(and(eq(orders.paymentStatus, "PAID"), or(...conds)));
  return Number(row?.n ?? 0);
}

/**
 * Authoritative cart pricing. Every price, discount and fee is recalculated
 * here from the database — nothing the browser sends is trusted.
 */
export async function quoteCart(input: QuoteInput, opts: { excludeOrderId?: string } = {}) {
  const settings = await getSettings();
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await getProductsByIds(ids);
  const byId = new Map(products.map((p) => [p.id, p]));
  const date = input.deliveryDate || istParts().dateStr;

  // Merge identical lines (same product + same customization).
  const merged = new Map<string, CartItemInput>();
  for (const item of input.items) {
    const p = byId.get(item.productId);
    const groups = (p?.optionGroups ?? []) as GroupDef[];
    const selections = p ? normalizeSelections(groups, item.selections) : item.selections;
    const key = selectionKey(item.productId, selections);
    const prev = merged.get(key);
    merged.set(key, { productId: item.productId, selections, quantity: (prev?.quantity ?? 0) + item.quantity });
  }

  const lines: QuoteLine[] = [];
  const priced: PricedLine[] = [];
  const qtyByProduct = new Map<string, number>();
  for (const item of merged.values()) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  for (const [key, item] of merged) {
    const p = byId.get(item.productId);
    if (!p) {
      lines.push({
        key, productId: item.productId, slug: "", name: "Item no longer on the menu", image: null, accent: "leaf",
        isVeg: true, quantity: item.quantity, unitPrice: 0, lineTotal: 0, summary: "", selections: item.selections,
        issue: "This item has been removed from the menu. Please remove it to continue.",
      });
      continue;
    }
    const groups = p.optionGroups as GroupDef[];
    const base = p.discountPrice ?? p.basePrice;
    const price = unitPrice(base, groups, item.selections);
    let issue: string | null = null;

    if (p.status !== "PUBLISHED") issue = "This item is unavailable right now. Please remove it to continue.";
    else if (p.stockStatus === "SOLD_OUT") issue = "Sold out for now. Please remove it or pick another bowl.";
    else {
      const v = validateSelections(groups, item.selections);
      if (!v.ok) issue = "Some of your choices have changed. Please edit this item.";
    }
    const totalQty = qtyByProduct.get(p.id) ?? item.quantity;
    if (!issue && p.maxPerOrder != null && totalQty > p.maxPerOrder)
      issue = `You can order up to ${p.maxPerOrder} of this bowl per order.`;
    if (!issue && p.dailyLimit != null) {
      const left = p.dailyLimit - (await soldForDate(p.id, date));
      if (left <= 0) issue = "Sold out for the selected day.";
      else if (totalQty > left) issue = `Only ${left} left for the selected day.`;
    }

    const lineTotal = price * item.quantity;
    lines.push({
      key, productId: p.id, slug: p.slug, name: p.name, image: p.image, accent: p.accent, isVeg: p.isVeg,
      quantity: item.quantity, unitPrice: price, lineTotal, summary: selectionSummary(groups, item.selections),
      selections: item.selections, issue,
    });
    if (!issue) priced.push({ productId: p.id, categoryId: p.categoryId, lineTotal });
  }

  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);

  // Delivery area & fee
  let area: { id: string; name: string; fee: number | null; minOrder: number | null } | null = null;
  let areaError: string | null = null;
  if (input.pincode) {
    const a = await findAreaByPincode(input.pincode);
    if (a) area = { id: a.id, name: a.name, fee: a.fee, minOrder: a.minOrder };
    else areaError = "Sorry, Salad Stories is not delivering to this location yet.";
  }
  const deliveryFee = subtotal > 0 ? deliveryFeeFor(subtotal, area?.fee, settings.flatDeliveryFee, settings.freeDeliveryAbove) : 0;

  // Coupon
  const customerKey = customerKeyOf(input.email, input.phone);
  let coupon: { code: string; ok: boolean; message: string; couponId?: string } | null = null;
  let itemDiscount = 0;
  let deliveryDiscount = 0;
  const code = input.couponCode?.trim().toUpperCase();
  if (code) {
    const [c] = await db.select().from(coupons).where(eq(coupons.code, code));
    if (!c) coupon = { code, ok: false, message: "We couldn't find that coupon code. Check the spelling and try again." };
    else {
      const usage = await couponUsage(c.id, customerKey, opts.excludeOrderId);
      const paid = await paidOrderCount(input.email, input.phone);
      const result = evaluateCoupon(toRule(c), {
        now: new Date(),
        lines: priced,
        subtotal,
        deliveryFee,
        areaId: area?.id ?? null,
        totalUsed: usage.totalUsed,
        customerUsed: usage.customerUsed,
        customerPaidOrders: paid,
        disabledTypes: settings.disabledCouponTypes.split(",").map((s) => s.trim()).filter(Boolean),
      });
      // First-order coupons need to know who the customer is.
      if (result.ok && c.firstOrderOnly && !customerKey) {
        coupon = { code, ok: true, couponId: c.id, message: "Coupon applied! We'll confirm it's your first order at checkout." };
      } else {
        coupon = { code, ok: result.ok, message: result.message, couponId: c.id };
      }
      if (result.ok) {
        itemDiscount = result.itemDiscount;
        deliveryDiscount = result.deliveryDiscount;
      }
    }
  }

  const totals = computeTotals({
    subtotal,
    itemDiscount,
    deliveryFee,
    deliveryDiscount,
    taxPercent: settings.taxPercent,
    taxInclusive: settings.taxInclusive,
  });

  const minOrder = Math.max(settings.minOrderValue, area?.minOrder ?? 0);
  const blockers: string[] = [];
  if (lines.some((l) => l.issue)) blockers.push("Some items in your cart need attention.");
  if (subtotal > 0 && minOrder > 0 && subtotal < minOrder)
    blockers.push(`The minimum order is ₹${minOrder / 100}. Add ₹${(minOrder - subtotal) / 100} more to check out.`);
  if (settings.deliveryPaused) blockers.push(settings.pausedMessage);
  if (areaError) blockers.push(areaError);
  if (lines.length === 0) blockers.push("Your cart is empty.");

  return {
    lines,
    totals,
    coupon,
    area,
    areaError,
    minOrder,
    blockers,
    taxLabel: settings.taxLabel,
    taxPercent: settings.taxPercent,
    taxInclusive: settings.taxInclusive,
    freeDeliveryAbove: settings.freeDeliveryAbove,
  };
}

export type Quote = Awaited<ReturnType<typeof quoteCart>>;
