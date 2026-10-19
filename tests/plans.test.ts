import { describe, expect, it } from "vitest";
import { addressNoFor, canChangeDay, earliestStart, parseWeekdays, planSelections, planSubtotal, weekdaysLabel } from "../src/lib/plans-core";
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
  it("allows changes until 24 hours before the slot", () => {
    // Wednesday 21 Oct lunch at 12:30 → changeable until Tuesday 20 Oct 12:29
    expect(canChangeDay("2026-10-21", "12:30", { dateStr: "2026-10-19", minutes: 23 * 60 })).toBe(true);
    expect(canChangeDay("2026-10-21", "12:30", { dateStr: "2026-10-20", minutes: 12 * 60 + 29 })).toBe(true);
    expect(canChangeDay("2026-10-21", "12:30", { dateStr: "2026-10-20", minutes: 12 * 60 + 30 })).toBe(false);
    expect(canChangeDay("2026-10-21", "19:00", { dateStr: "2026-10-20", minutes: 18 * 60 })).toBe(true);
    expect(canChangeDay("2026-10-21", "12:30", { dateStr: "2026-10-21", minutes: 8 * 60 })).toBe(false);
  });
  it("first day must be more than 24 hours away", () => {
    expect(earliestStart("12:30", { dateStr: "2026-10-19", minutes: 11 * 60 })).toBe("2026-10-20");
    expect(earliestStart("12:30", { dateStr: "2026-10-19", minutes: 13 * 60 })).toBe("2026-10-21");
    expect(earliestStart("19:00", { dateStr: "2026-10-31", minutes: 9 * 60 })).toBe("2026-11-01");
  });
  it("uses default choices, switching only the portion to Large", () => {
    expect(planSelections(groups, false)).toEqual({ size: { reg: 1 }, spice: { med: 1 } });
    expect(planSelections(groups, true)).toEqual({ size: { lg: 1 }, spice: { med: 1 } });
  });
  it("prices bowls × days with the plan discount", () => {
    expect(planSubtotal([19900, 19900, 19900, 19900, 19900], 1, 5)).toEqual({ subtotal: 99500, discount: 4975 });
    expect(planSubtotal([14900, 22900], 2, 10)).toEqual({ subtotal: 75600, discount: 7560 });
  });
  it("reads weekdays and labels them", () => {
    expect(parseWeekdays("1,2,3,4,5")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays("5, 1,x,9,1")).toEqual([1, 5]);
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(weekdaysLabel([1, 3, 5])).toBe("Mon, Wed, Fri");
  });
  it("sends each weekday to its address (office Mon–Wed, home Thu–Fri)", () => {
    const map = { "1": 1, "2": 1, "3": 1, "4": 2, "5": 2 };
    expect(addressNoFor("2026-10-19", map, true)).toBe(1); // Monday
    expect(addressNoFor("2026-10-22", map, true)).toBe(2); // Thursday
    expect(addressNoFor("2026-10-22", map, false)).toBe(1); // no second address given
  });
});
