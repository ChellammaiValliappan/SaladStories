/** Pure plan rules shared by the server, the browser and tests. */
import { activeGroups, defaultSelections, type GroupDef, type Selections } from "./customization";
import { addDays, dayOfWeek, istParts, toMinutes } from "./time";

type Now = { dateStr: string; minutes: number };

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

/**
 * Customers can swap or skip a day until 24 hours before its delivery slot starts
 * (e.g. Wednesday's 12:30 lunch can be changed until Tuesday 12:30).
 */
export function canChangeDay(date: string, slotStart: string, now: Now = istParts()) {
  const dayBefore = addDays(date, -1);
  return now.dateStr < dayBefore || (now.dateStr === dayBefore && now.minutes < toMinutes(slotStart));
}

/** Earliest first day of a new plan: the first day that is still more than 24 hours away. */
export function earliestStart(slotStart: string, now: Now = istParts()) {
  return addDays(now.dateStr, now.minutes < toMinutes(slotStart) ? 1 : 2);
}

/** Plan price: bowls × days, minus the plan's % discount. */
export function planSubtotal(unitPrices: number[], quantity: number, discountPercent: number) {
  const subtotal = unitPrices.reduce((s, p) => s + p * quantity, 0);
  return { subtotal, discount: Math.round((subtotal * discountPercent) / 100) };
}

/** "1,2,3,4,5" → [1,2,3,4,5] (0 = Sunday). */
export const parseWeekdays = (s: string) =>
  [...new Set(s.split(",").map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon–Fri", "Mon, Wed, Fri"… */
export function weekdaysLabel(days: number[]) {
  const d = [...days].sort();
  const run = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return run ? `${WEEKDAY_NAMES[d[0]]}–${WEEKDAY_NAMES[d[d.length - 1]]}` : d.map((x) => WEEKDAY_NAMES[x]).join(", ");
}

/** Which of the plan's two addresses a date goes to (address 2 only if the customer gave one). */
export function addressNoFor(date: string, byWeekday: Record<string, number>, hasSecond: boolean) {
  return hasSecond && byWeekday[String(dayOfWeek(date))] === 2 ? 2 : 1;
}
