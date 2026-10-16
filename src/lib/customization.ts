/**
 * Product customization engine — shared by the browser (live price) and the
 * server (authoritative price). Pure functions only.
 *
 * Selections shape: { [groupId]: { [choiceId]: quantity } }
 */

export type OptionType = "SINGLE" | "MULTIPLE" | "YESNO" | "QUANTITY" | "ADDON" | "REMOVAL";

export interface ChoiceDef {
  id: string;
  name: string;
  priceDelta: number; // paise
  isDefault: boolean;
  isActive: boolean;
  maxQty: number | null;
}

export interface GroupDef {
  id: string;
  name: string;
  type: OptionType | string;
  required: boolean;
  minSelect: number;
  maxSelect: number | null;
  isActive: boolean;
  choices: ChoiceDef[];
}

export type Selections = Record<string, Record<string, number>>;

export const OPTION_TYPE_LABELS: Record<OptionType, string> = {
  SINGLE: "Choose one",
  MULTIPLE: "Choose several",
  YESNO: "Yes / No",
  QUANTITY: "Choose quantity",
  ADDON: "Optional add-ons",
  REMOVAL: "Remove ingredients",
};

export function activeGroups(groups: GroupDef[]) {
  return groups
    .filter((g) => g.isActive)
    .map((g) => ({ ...g, choices: g.choices.filter((c) => c.isActive) }))
    .filter((g) => g.choices.length > 0);
}

/** Default selections a customer starts with on the product page. */
export function defaultSelections(groups: GroupDef[]): Selections {
  const sel: Selections = {};
  for (const g of activeGroups(groups)) {
    const defaults = g.choices.filter((c) => c.isDefault);
    if (g.type === "SINGLE") {
      const pick = defaults[0] ?? (g.required ? g.choices[0] : undefined);
      if (pick) sel[g.id] = { [pick.id]: 1 };
    } else if (defaults.length) {
      sel[g.id] = Object.fromEntries(defaults.map((c) => [c.id, 1]));
    }
  }
  return sel;
}

/** Drop unknown ids and zero quantities so stored selections stay clean. */
export function normalizeSelections(groups: GroupDef[], selections: Selections): Selections {
  const out: Selections = {};
  for (const g of activeGroups(groups)) {
    const raw = selections?.[g.id];
    if (!raw) continue;
    const picked: Record<string, number> = {};
    for (const c of g.choices) {
      const qty = Math.floor(Number(raw[c.id] ?? 0));
      if (qty > 0) picked[c.id] = g.type === "QUANTITY" ? qty : 1;
    }
    if (Object.keys(picked).length) out[g.id] = picked;
  }
  return out;
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>; // groupId -> message
}

export function validateSelections(groups: GroupDef[], selections: Selections): ValidationResult {
  const errors: Record<string, string> = {};
  const active = activeGroups(groups);
  const known = new Set(active.map((g) => g.id));

  // Any choice pointing at an inactive/unknown option is invalid.
  for (const gid of Object.keys(selections ?? {})) {
    const hasQty = Object.values(selections[gid] ?? {}).some((q) => q > 0);
    if (hasQty && !known.has(gid)) errors[gid] = "This option is no longer available.";
  }

  for (const g of active) {
    const picked = selections?.[g.id] ?? {};
    const choiceIds = new Set(g.choices.map((c) => c.id));
    let distinct = 0;
    let units = 0;
    for (const [cid, qty] of Object.entries(picked)) {
      if (!qty || qty <= 0) continue;
      if (!choiceIds.has(cid)) {
        errors[g.id] = "One of your choices is no longer available.";
        continue;
      }
      const choice = g.choices.find((c) => c.id === cid)!;
      if (g.type === "QUANTITY" && choice.maxQty != null && qty > choice.maxQty) {
        errors[g.id] = `You can add up to ${choice.maxQty} of ${choice.name}.`;
      }
      distinct += 1;
      units += g.type === "QUANTITY" ? qty : 1;
    }
    const count = g.type === "QUANTITY" ? units : distinct;
    const min = Math.max(g.required ? Math.max(1, g.minSelect) : 0, g.minSelect);
    const max = g.type === "SINGLE" ? 1 : g.maxSelect;

    if (errors[g.id]) continue;
    if (count < min) {
      errors[g.id] =
        min === 1 ? `Please choose ${g.type === "SINGLE" ? "an option" : "at least one"}.` : `Please choose at least ${min}.`;
    } else if (max != null && count > max) {
      errors[g.id] = max === 1 ? "Choose only one." : `Choose up to ${max}.`;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Unit price = base price + every paid customization. */
export function unitPrice(basePrice: number, groups: GroupDef[], selections: Selections): number {
  let price = basePrice;
  for (const g of activeGroups(groups)) {
    const picked = selections?.[g.id];
    if (!picked) continue;
    for (const c of g.choices) {
      const qty = picked[c.id] ?? 0;
      if (qty > 0) price += c.priceDelta * (g.type === "QUANTITY" ? qty : 1);
    }
  }
  return Math.max(0, price);
}

/** Human-readable summary, e.g. "Large · Extra paneer · No onion". */
export function selectionSummary(groups: GroupDef[], selections: Selections): string {
  const parts: string[] = [];
  for (const g of activeGroups(groups)) {
    const picked = selections?.[g.id];
    if (!picked) continue;
    for (const c of g.choices) {
      const qty = picked[c.id] ?? 0;
      if (qty <= 0) continue;
      if (g.type === "REMOVAL") parts.push(`No ${c.name.toLowerCase()}`);
      else if (g.type === "QUANTITY") parts.push(qty > 1 ? `${c.name} ×${qty}` : c.name);
      else parts.push(c.name);
    }
  }
  return parts.join(", ");
}

/** Stable key so identical customizations merge into one cart line. */
export function selectionKey(productId: string, selections: Selections): string {
  const groups = Object.keys(selections ?? {}).sort();
  const body = groups
    .map((gid) => {
      const picked = selections[gid];
      const choices = Object.keys(picked)
        .filter((cid) => picked[cid] > 0)
        .sort()
        .map((cid) => `${cid}:${picked[cid]}`);
      return `${gid}=${choices.join(",")}`;
    })
    .filter((s) => !s.endsWith("="))
    .join("|");
  return `${productId}#${body}`;
}
