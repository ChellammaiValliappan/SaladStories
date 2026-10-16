import { describe, expect, it } from "vitest";
import { computeTotals, CouponContext, CouponRule, deliveryFeeFor, evaluateCoupon } from "@/lib/pricing-core";
import { defaultSelections, GroupDef, selectionKey, selectionSummary, unitPrice, validateSelections } from "@/lib/customization";

const coupon = (o: Partial<CouponRule>): CouponRule => ({
  id: "c1", code: "X", type: "PERCENT", value: 10, maxDiscount: null, minOrder: null, startsAt: null, expiresAt: null,
  totalLimit: null, perCustomerLimit: null, firstOrderOnly: false, productIds: [], categoryIds: [], areaIds: [], isActive: true, ...o,
});
const ctx = (o: Partial<CouponContext> = {}): CouponContext => ({
  now: new Date("2026-10-16T10:00:00Z"),
  lines: [{ productId: "p1", categoryId: "salads", lineTotal: 40000 }, { productId: "p2", categoryId: "fruit", lineTotal: 15000 }],
  subtotal: 55000, deliveryFee: 4000, areaId: "a1", totalUsed: 0, customerUsed: 0, customerPaidOrders: 0, disabledTypes: [], ...o,
});

describe("coupons (BRD §7)", () => {
  it("WELCOME10: 10% capped at max discount, first orders only", () => {
    const c = coupon({ code: "WELCOME10", value: 10, maxDiscount: 5000, firstOrderOnly: true });
    expect(evaluateCoupon(c, ctx())).toMatchObject({ ok: true, itemDiscount: 5000 });
    expect(evaluateCoupon(c, ctx({ customerPaidOrders: 1 }))).toMatchObject({ ok: false, message: expect.stringContaining("first-time") });
  });
  it("HEALTH50: ₹50 off only when subtotal reaches ₹500", () => {
    const c = coupon({ type: "FLAT", value: 5000, minOrder: 50000 });
    expect(evaluateCoupon(c, ctx())).toMatchObject({ ok: true, itemDiscount: 5000 });
    const low = evaluateCoupon(c, ctx({ subtotal: 30000, lines: [{ productId: "p1", categoryId: null, lineTotal: 30000 }] }));
    expect(low.ok).toBe(false);
    expect(low.message).toContain("minimum purchase");
  });
  it("FREEDELIVERY waives the delivery fee", () => {
    expect(evaluateCoupon(coupon({ type: "FREE_DELIVERY" }), ctx())).toMatchObject({ ok: true, deliveryDiscount: 4000, itemDiscount: 0 });
  });
  it("product-specific coupons only discount eligible items", () => {
    const r = evaluateCoupon(coupon({ value: 50, productIds: ["p2"] }), ctx());
    expect(r).toMatchObject({ ok: true, itemDiscount: 7500 });
    expect(evaluateCoupon(coupon({ productIds: ["zzz"] }), ctx()).message).toContain("not applicable");
  });
  it("never discounts more than the eligible amount", () => {
    expect(evaluateCoupon(coupon({ type: "FLAT", value: 999999, categoryIds: ["fruit"] }), ctx())).toMatchObject({ itemDiscount: 15000 });
  });
  it("rejects expired, not-started, inactive and exhausted coupons", () => {
    expect(evaluateCoupon(coupon({ expiresAt: new Date("2026-01-01") }), ctx()).message).toContain("expired");
    expect(evaluateCoupon(coupon({ startsAt: new Date("2027-01-01") }), ctx()).ok).toBe(false);
    expect(evaluateCoupon(coupon({ isActive: false }), ctx()).ok).toBe(false);
    expect(evaluateCoupon(coupon({ totalLimit: 5 }), ctx({ totalUsed: 5 })).message).toContain("redemption limit");
    expect(evaluateCoupon(coupon({ perCustomerLimit: 1 }), ctx({ customerUsed: 1 })).ok).toBe(false);
    expect(evaluateCoupon(coupon({ areaIds: ["other"] }), ctx()).ok).toBe(false);
  });
});

describe("totals (BRD §6.2)", () => {
  it("Final = Subtotal − Discount + Tax + Delivery", () => {
    const t = computeTotals({ subtotal: 50000, itemDiscount: 5000, deliveryFee: 4000, deliveryDiscount: 0, taxPercent: 5, taxInclusive: false });
    expect(t).toEqual({ subtotal: 50000, discount: 5000, deliveryFee: 4000, tax: 2250, total: 51250 });
  });
  it("never goes negative", () => {
    const t = computeTotals({ subtotal: 1000, itemDiscount: 99999, deliveryFee: 0, deliveryDiscount: 0, taxPercent: 5, taxInclusive: false });
    expect(t.total).toBe(0);
  });
  it("free delivery above the threshold", () => {
    expect(deliveryFeeFor(60000, null, 4000, 59900)).toBe(0);
    expect(deliveryFeeFor(30000, 2500, 4000, 59900)).toBe(2500);
  });
});

describe("customization (BRD §5)", () => {
  const groups: GroupDef[] = [
    { id: "size", name: "Portion", type: "SINGLE", required: true, minSelect: 0, maxSelect: null, isActive: true,
      choices: [{ id: "reg", name: "Regular", priceDelta: 0, isDefault: true, isActive: true, maxQty: null }, { id: "lg", name: "Large", priceDelta: 7000, isDefault: false, isActive: true, maxQty: null }] },
    { id: "egg", name: "Extra egg", type: "QUANTITY", required: false, minSelect: 0, maxSelect: 3, isActive: true,
      choices: [{ id: "e", name: "Boiled egg", priceDelta: 2000, isDefault: false, isActive: true, maxQty: 3 }] },
    { id: "top", name: "Toppings", type: "MULTIPLE", required: false, minSelect: 0, maxSelect: 2, isActive: true,
      choices: ["a", "b", "c"].map((id) => ({ id, name: `T${id}`, priceDelta: 2000, isDefault: false, isActive: true, maxQty: null })) },
    { id: "rm", name: "Leave out", type: "REMOVAL", required: false, minSelect: 0, maxSelect: null, isActive: true,
      choices: [{ id: "onion", name: "Onion", priceDelta: 0, isDefault: false, isActive: true, maxQty: null }] },
  ];
  it("prices Example C: regular, two toppings, one extra egg", () => {
    const sel = { size: { reg: 1 }, top: { a: 1, b: 1 }, egg: { e: 1 } };
    expect(validateSelections(groups, sel).ok).toBe(true);
    expect(unitPrice(17900, groups, sel)).toBe(17900 + 4000 + 2000);
    expect(selectionSummary(groups, sel)).toBe("Regular, Boiled egg, Ta, Tb");
  });
  it("blocks too many toppings and too many eggs", () => {
    expect(validateSelections(groups, { size: { reg: 1 }, top: { a: 1, b: 1, c: 1 } }).ok).toBe(false);
    expect(validateSelections(groups, { size: { reg: 1 }, egg: { e: 4 } }).ok).toBe(false);
  });
  it("requires a portion size and starts from defaults", () => {
    expect(validateSelections(groups, {}).ok).toBe(false);
    expect(defaultSelections(groups)).toEqual({ size: { reg: 1 } });
  });
  it("identical customizations share a cart key", () => {
    expect(selectionKey("p", { b: { y: 1, x: 1 }, a: { z: 2 } })).toBe(selectionKey("p", { a: { z: 2 }, b: { x: 1, y: 1 } }));
    expect(selectionSummary(groups, { rm: { onion: 1 } })).toBe("No onion");
  });
});
