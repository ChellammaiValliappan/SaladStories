import { describe, expect, it } from "vitest";
import { canChangeDay, earliestStart, planSelections, planSubtotal } from "../src/lib/plans-core";
import type { GroupDef } from "../src/lib/customization";

const groups: GroupDef[] = [
  { id: "size", name: "Portion size", type: "SINGLE", required: true, minSelect: 1, maxSelect: 1, isActive: true, choices: [
    { id: "reg", name: "Regular", priceDelta: 0, isDefault: true, isActive: true, maxQty: null },
    { id: "lg", name: "Large", priceDelta: 7000, isDefault: false, isActive: true, maxQty: null },
  ] },
  { id: "spice", name: "Spice level", type: "SINGLE", required: true, minSelect: 1, maxSelect: 1, isActive: true, choices: [
    { id: "mild", name: "Mild", priceDelta: 0, isDefault: false, isActive: true, maxQty: null },
    { id: "med", name: "Medium", priceDelta: 0, isDefault: true, isActive: true, maxQty: null },
  ] },
];

describe("plan rules", () => {
  it("allows changes until 9 pm the evening before", () => {
    expect(canChangeDay("2026-10-21", { dateStr: "2026-10-19", minutes: 23 * 60 })).toBe(true);
    expect(canChangeDay("2026-10-21", { dateStr: "2026-10-20", minutes: 20 * 60 + 59 })).toBe(true);
    expect(canChangeDay("2026-10-21", { dateStr: "2026-10-20", minutes: 21 * 60 })).toBe(false);
    expect(canChangeDay("2026-10-21", { dateStr: "2026-10-21", minutes: 8 * 60 })).toBe(false);
  });
  it("starts tomorrow, or the day after once it's past 9 pm", () => {
    expect(earliestStart({ dateStr: "2026-10-19", minutes: 13 * 60 })).toBe("2026-10-20");
    expect(earliestStart({ dateStr: "2026-10-19", minutes: 22 * 60 })).toBe("2026-10-21");
    expect(earliestStart({ dateStr: "2026-10-31", minutes: 9 * 60 })).toBe("2026-11-01");
  });
  it("uses default choices, switching only the portion to Large", () => {
    expect(planSelections(groups, false)).toEqual({ size: { reg: 1 }, spice: { med: 1 } });
    expect(planSelections(groups, true)).toEqual({ size: { lg: 1 }, spice: { med: 1 } });
  });
  it("prices bowls × days with the plan discount", () => {
    // Weekly: 6 days at ₹199, 1 bowl a day, 5% off → ₹1,194 − ₹59.70
    expect(planSubtotal([19900, 19900, 19900, 19900, 19900, 19900], 1, 5)).toEqual({ subtotal: 119400, discount: 5970 });
    expect(planSubtotal([14900, 22900], 2, 10)).toEqual({ subtotal: 75600, discount: 7560 });
  });
});
