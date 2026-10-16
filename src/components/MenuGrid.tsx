"use client";

import { useMemo, useState } from "react";
import type { ClientProduct } from "@/lib/menu";
import { ProductCard } from "./ProductCard";

type Filter = { id: string; label: string; test: (p: ClientProduct) => boolean };

export function MenuGrid({
  products,
  categories,
  productCategory,
}: {
  products: ClientProduct[];
  categories: { id: string; name: string }[];
  productCategory: Record<string, string | null>;
}) {
  const filters: Filter[] = useMemo(
    () => [
      { id: "all", label: "All bowls", test: () => true },
      { id: "veg", label: "Veg", test: (p: ClientProduct) => p.isVeg },
      { id: "nonveg", label: "Non-veg", test: (p: ClientProduct) => !p.isVeg },
      ...categories.map((c) => ({ id: c.id, label: c.name, test: (p: ClientProduct) => productCategory[p.id] === c.id })),
    ],
    [categories, productCategory],
  );
  const [active, setActive] = useState("all");
  const f = filters.find((x) => x.id === active) ?? filters[0];
  const shown = products.filter(f.test);

  return (
    <>
      <div className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label="Filter the menu">
        {filters.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={active === x.id}
            onClick={() => setActive(x.id)}
            className={`shrink-0 rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold transition-colors ${
              active === x.id ? "border-basil bg-basil text-white" : "border-line bg-white text-ink hover:border-basil"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="mt-10 rounded-3xl bg-crate p-8 text-center text-ink-soft">No bowls match this filter yet. Try another one.</p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p, i) => (
            <ProductCard key={p.id} p={p} priority={i < 3} />
          ))}
        </div>
      )}
    </>
  );
}
