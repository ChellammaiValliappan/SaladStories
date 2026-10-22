import { describe, expect, it } from "vitest";
import { customerStatus, dayNumber, dayValue, ledgerTotals, normalizePhone, paymentStatus, planPrice, scheduleStats, tierAllows } from "../src/lib/biz/core";

describe("phone numbers", () => {
  it("normalises Indian mobiles", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("098765-43210")).toBe("9876543210");
    expect(normalizePhone("9876543210")).toBe("9876543210");
  });
});

describe("payments ledger", () => {
  const pay = (amount: number, status = "RECEIVED", type = "PAYMENT") => ({ amount, status, type });
  it("only received money counts", () => {
    expect(ledgerTotals([pay(500), pay(300, "PENDING_VERIFICATION"), pay(200, "FAILED"), pay(100, "REVERSED")])).toEqual({ received: 500, refunded: 0, net: 500, toVerify: 300, failed: 1 });
  });
  it("derives Pending / Partially paid / Paid / Refunded / Failed", () => {
    expect(paymentStatus(84900, [])).toBe("PENDING");
    expect(paymentStatus(84900, [pay(40000)])).toBe("PARTIALLY_PAID");
    expect(paymentStatus(84900, [pay(40000), pay(44900)])).toBe("PAID");
    expect(paymentStatus(84900, [pay(90000)])).toBe("PAID"); // advance / overpaid
    expect(paymentStatus(84900, [pay(84900), pay(84900, "RECEIVED", "REFUND")])).toBe("REFUNDED");
    expect(paymentStatus(84900, [pay(84900, "FAILED")])).toBe("FAILED");
    expect(paymentStatus(84900, [pay(84900, "PENDING_VERIFICATION")])).toBe("PENDING");
  });
});

describe("subscription schedule", () => {
  const today = "2026-10-22";
  const days = [
    { date: "2026-10-19", status: "SCHEDULED", orderStatus: "DELIVERED" },
    { date: "2026-10-20", status: "SCHEDULED", orderStatus: "PAID" }, // past → counted as delivered
    { date: "2026-10-21", status: "FORFEITED", orderStatus: "CANCELLED" },
    { date: "2026-10-22", status: "SKIPPED", orderStatus: "CANCELLED" }, // moved
    { date: "2026-10-23", status: "SCHEDULED", orderStatus: "PAID" },
    { date: "2026-10-26", status: "HELD", orderStatus: null },
    { date: "2026-10-27", status: "SCHEDULED", orderStatus: "PAID" },
  ];
  it("counts delivered, remaining, forfeited and moved days", () => {
    const s = scheduleStats(days, 5, 0, today);
    expect(s).toMatchObject({ entitled: 5, delivered: 2, upcoming: 2, held: 1, forfeited: 1, moved: 1, remaining: 3, complete: false });
  });
  it("numbers days by the plan days used", () => {
    expect(dayNumber(days, "2026-10-23")).toBe(4); // 19, 20, 21 (forfeited) come before
    expect(dayNumber(days, "2026-10-27")).toBe(5);
  });
  it("is complete only when every paid day is delivered or forfeited", () => {
    const done = [
      { date: "2026-10-19", status: "SCHEDULED", orderStatus: "DELIVERED" },
      { date: "2026-10-20", status: "FORFEITED", orderStatus: "CANCELLED" },
      { date: "2026-10-21", status: "SCHEDULED", orderStatus: "PAID" },
    ];
    expect(scheduleStats(done, 3, 0, today).complete).toBe(true);
    expect(scheduleStats(done, 3, 1, today).complete).toBe(false); // an authorised extra is still owed
    expect(scheduleStats(done, 3, 1, today).unscheduled).toBe(1);
  });
});

describe("customer status", () => {
  const today = "2026-10-22";
  it("follows subscriptions and owner overrides", () => {
    expect(customerStatus(null, [], today)).toBe("NEW");
    expect(customerStatus(null, [{ status: "ACTIVE", endDate: "2026-10-24", isTrial: true }], today)).toBe("TRIAL");
    expect(customerStatus(null, [{ status: "ACTIVE", endDate: "2026-11-20", isTrial: false }], today)).toBe("ACTIVE");
    expect(customerStatus(null, [{ status: "COMPLETED", endDate: "2026-10-01", isTrial: false }], today)).toBe("EXPIRED");
    expect(customerStatus(null, [{ status: "ACTIVE", endDate: "2026-10-20", isTrial: false }], today)).toBe("EXPIRED");
    expect(customerStatus(null, [{ status: "PAUSED", endDate: "2026-11-20", isTrial: false }], today)).toBe("PAUSED");
    expect(customerStatus("CANCELLED", [{ status: "ACTIVE", endDate: "2026-11-20", isTrial: false }], today)).toBe("CANCELLED");
  });
});

describe("plan pricing", () => {
  const weekly = { fixedPrice: 84900, days: 5, premiumSurchargePerDay: 3000, largeSurchargePerDay: 6000 };
  it("fixed price plus premium days and large portions", () => {
    expect(planPrice({ ...weekly, premiumDays: 0, large: false, quantity: 1, discountPercent: 0 })).toMatchObject({ subtotal: 84900, discount: 0 });
    expect(planPrice({ ...weekly, premiumDays: 2, large: false, quantity: 1, discountPercent: 0 })).toMatchObject({ subtotal: 90900, premium: 6000 });
    expect(planPrice({ ...weekly, premiumDays: 2, large: true, quantity: 2, discountPercent: 0 })).toMatchObject({ subtotal: (84900 + 6000 + 30000) * 2 });
    expect(planPrice({ ...weekly, premiumDays: 0, large: false, quantity: 1, discountPercent: 10 }).discount).toBe(8490);
  });
  it("values a day and limits swaps by tier", () => {
    expect(dayValue({ ...weekly, large: false }, false)).toBe(16980);
    expect(dayValue({ ...weekly, large: true }, true)).toBe(16980 + 3000 + 6000);
    expect(tierAllows("STANDARD", "PREMIUM")).toBe(false);
    expect(tierAllows("PREMIUM", "STANDARD")).toBe(true);
    expect(tierAllows("STANDARD", "STANDARD")).toBe(true);
  });
});
