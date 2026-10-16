"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import type { ClientProduct } from "@/lib/menu";
import {
  activeGroups,
  defaultSelections,
  normalizeSelections,
  selectionSummary,
  unitPrice,
  validateSelections,
  type GroupDef,
  type Selections,
} from "@/lib/customization";
import { useCart } from "@/lib/cart-store";
import { formatINR } from "@/lib/money";

function hint(g: GroupDef) {
  if (g.type === "SINGLE") return g.required ? "Required · choose one" : "Optional · choose one";
  if (g.type === "REMOVAL") return "Optional · tap to leave out";
  if (g.type === "YESNO") return "Optional";
  const min = Math.max(g.required ? 1 : 0, g.minSelect);
  const parts = [min > 0 ? `Choose at least ${min}` : "Optional"];
  if (g.maxSelect != null) parts.push(`up to ${g.maxSelect}`);
  return parts.join(", ");
}

const plus = (p: number) => (p > 0 ? `+${formatINR(p)}` : p < 0 ? `−${formatINR(-p)}` : "");

export function Customizer({ product }: { product: ClientProduct }) {
  const router = useRouter();
  const params = useSearchParams();
  const editKey = params.get("edit");
  const { add, replace, lines, hydrated } = useCart();
  const groups = useMemo(() => activeGroups(product.optionGroups as GroupDef[]), [product.optionGroups]);

  const [sel, setSel] = useState<Selections>(() => defaultSelections(groups));
  const [qty, setQty] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [added, setAdded] = useState(false);

  // Editing an item from the cart: start from its current choices.
  const editing = editKey ? lines.find((l) => l.key === editKey && l.productId === product.id) : undefined;
  useEffect(() => {
    if (hydrated && editing) {
      setSel(normalizeSelections(groups, editing.selections));
      setQty(editing.quantity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, editKey]);

  const validation = validateSelections(groups, sel);
  const price = unitPrice(product.discountPrice ?? product.basePrice, groups, sel);
  const maxQty = Math.min(20, product.maxPerOrder ?? 20);

  function toggle(g: GroupDef, choiceId: string) {
    setSel((prev) => {
      const current = { ...(prev[g.id] ?? {}) };
      if (g.type === "SINGLE") {
        if (current[choiceId] && !g.required) return { ...prev, [g.id]: {} };
        return { ...prev, [g.id]: { [choiceId]: 1 } };
      }
      if (current[choiceId]) delete current[choiceId];
      else {
        const count = Object.keys(current).length;
        if (g.maxSelect != null && count >= g.maxSelect) return prev; // don't exceed the limit
        current[choiceId] = 1;
      }
      return { ...prev, [g.id]: current };
    });
  }

  function setChoiceQty(g: GroupDef, choiceId: string, n: number) {
    setSel((prev) => {
      const current = { ...(prev[g.id] ?? {}) };
      const choice = g.choices.find((c) => c.id === choiceId)!;
      const others = Object.entries(current).filter(([k]) => k !== choiceId).reduce((s, [, v]) => s + v, 0);
      let next = Math.max(0, n);
      if (choice.maxQty != null) next = Math.min(next, choice.maxQty);
      if (g.maxSelect != null) next = Math.min(next, g.maxSelect - others);
      if (next === 0) delete current[choiceId];
      else current[choiceId] = next;
      return { ...prev, [g.id]: current };
    });
  }

  function submit() {
    if (!validation.ok) {
      setShowErrors(true);
      const first = Object.keys(validation.errors)[0];
      document.getElementById(`group-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const line = {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      accent: product.accent,
      selections: sel,
      summary: selectionSummary(groups, sel),
      quantity: qty,
      unitPrice: price,
    };
    if (editing) {
      replace(editing.key, line);
      router.push("/cart");
      return;
    }
    add(line);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  if (!product.orderable) {
    return (
      <div className="rounded-3xl bg-crate p-6">
        <h2 className="text-2xl font-bold">{product.availability}</h2>
        <p className="mt-2 text-ink-soft">This bowl can't be ordered right now. Please check back later or try another bowl from the menu.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold">{editing ? "Edit your bowl" : "Make it yours"}</h2>
      {groups.length === 0 && <p className="mt-2 text-ink-soft">This bowl comes as it is — just choose how many.</p>}
      <div className="mt-6 space-y-6">
        {groups.map((g) => {
          const err = showErrors ? validation.errors[g.id] : undefined;
          const picked = sel[g.id] ?? {};
          return (
            <fieldset key={g.id} id={`group-${g.id}`} className={`rounded-3xl border-[1.5px] p-5 ${err ? "border-tomato" : "border-line"} bg-white`}>
              <legend className="sr-only">{g.name}</legend>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-xl font-bold" aria-hidden="true">{g.name}</h3>
                <span className={`text-xs font-semibold ${g.required ? "text-[var(--accent-ink)]" : "text-ink-soft"}`}>{hint(g)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.choices.map((c) => {
                  const on = (picked[c.id] ?? 0) > 0;
                  if (g.type === "QUANTITY") {
                    const n = picked[c.id] ?? 0;
                    return (
                      <div key={c.id} className={`flex items-center justify-between gap-3 rounded-2xl border-[1.5px] px-4 py-3 ${n ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-line"}`}>
                        <div>
                          <p className="font-semibold">{c.name}</p>
                          <p className="text-sm text-ink-soft">{plus(c.priceDelta)} each</p>
                        </div>
                        <Stepper value={n} min={0} max={c.maxQty ?? g.maxSelect ?? 10} onChange={(v) => setChoiceQty(g, c.id, v)} label={c.name} />
                      </div>
                    );
                  }
                  const role = g.type === "SINGLE" ? "radio" : "checkbox";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role={role}
                      aria-checked={on}
                      onClick={() => toggle(g, c.id)}
                      className={`flex min-h-14 items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors ${
                        on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-line hover:border-ink-soft"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center border-2 ${g.type === "SINGLE" ? "rounded-full" : "rounded-md"} ${
                          on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-crate-deep bg-white"
                        }`}
                      >
                        {on && <Check className="h-4 w-4" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 font-semibold">{g.type === "REMOVAL" ? `No ${c.name.toLowerCase()}` : c.name}</span>
                      {c.priceDelta !== 0 && <span className="text-sm font-semibold text-ink-soft">{plus(c.priceDelta)}</span>}
                    </button>
                  );
                })}
              </div>
              {err && <p className="mt-3 text-sm font-semibold text-tomato" role="alert">{err}</p>}
            </fieldset>
          );
        })}
      </div>

      {/* Sticky add bar: final price is always visible before adding (BRD §5.2) */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-line bg-paper/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:rounded-3xl md:border md:bg-white md:p-4">
        <div className="flex items-center gap-3">
          <Stepper value={qty} min={1} max={maxQty} onChange={setQty} label="Quantity" large />
          <button type="button" onClick={submit} className="btn btn-primary h-14 flex-1 justify-between rounded-2xl px-5 text-base">
            <span>{added ? "Added!" : editing ? "Update item" : "Add to cart"}</span>
            <span>{formatINR(price * qty)}</span>
          </button>
        </div>
        {showErrors && !validation.ok && <p className="mt-2 text-center text-sm font-semibold text-tomato">Please complete the highlighted choices.</p>}
      </div>
    </div>
  );
}

function Stepper({ value, min, max, onChange, label, large = false }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; large?: boolean }) {
  const size = large ? "h-14 w-12" : "h-10 w-10";
  return (
    <div className="flex items-center rounded-2xl border-[1.5px] border-line bg-white" role="group" aria-label={label}>
      <button type="button" className={`${size} grid place-items-center disabled:opacity-30`} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-6 text-center font-bold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={`${size} grid place-items-center disabled:opacity-30`} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export { Stepper };
