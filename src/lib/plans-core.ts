/** Pure plan rules shared by the server, the browser and tests. */
import { activeGroups, defaultSelections, type GroupDef, type Selections } from "./customization";
import { addDays, istParts } from "./time";

/** Customers can swap or skip a day until 9 pm the evening before. */
export const PLAN_CHANGE_CUTOFF_MIN = 21 * 60;

/** The default customization for a plan bowl, optionally the Large portion. */
export function planSelections(groups: GroupDef[], large: boolean): Selections {
  const sel = defaultSelections(groups);
  if (large) {
    const g = activeGroups(groups).find((x) => x.type === "SINGLE" && /portion|size/i.test(x.name));
    const c = g?.choices.find((x) => /large/i.test(x.name));
    if (g && c) sel[g.id] = { [c.id]: 1 };
  }
  return sel;
}

/** Can the customer still swap or skip this day? (Until 9 pm the evening before.) */
export function canChangeDay(date: string, now: { dateStr: string; minutes: number } = istParts()) {
  const dayBefore = addDays(date, -1);
  return now.dateStr < dayBefore || (now.dateStr === dayBefore && now.minutes < PLAN_CHANGE_CUTOFF_MIN);
}

/** Earliest date a new plan can start: tomorrow, or the day after if it's past 9 pm. */
export function earliestStart(now: { dateStr: string; minutes: number } = istParts()) {
  return addDays(now.dateStr, now.minutes < PLAN_CHANGE_CUTOFF_MIN ? 1 : 2);
}

/** Plan price: bowls × days, minus the plan's % discount. */
export function planSubtotal(unitPrices: number[], quantity: number, discountPercent: number) {
  const subtotal = unitPrices.reduce((s, p) => s + p * quantity, 0);
  return { subtotal, discount: Math.round((subtotal * discountPercent) / 100) };
}
