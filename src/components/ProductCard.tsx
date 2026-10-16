"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ClientProduct } from "@/lib/menu";
import { defaultSelections, selectionSummary, unitPrice, validateSelections, type GroupDef } from "@/lib/customization";
import { useCart } from "@/lib/cart-store";
import { FoodMark } from "./FoodMark";
import { Price } from "./Price";

export function ProductCard({ p, priority = false }: { p: ClientProduct; priority?: boolean }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const groups = p.optionGroups as GroupDef[];

  function quickAdd() {
    const sel = defaultSelections(groups);
    if (!validateSelections(groups, sel).ok) return router.push(`/menu/${p.slug}`);
    add({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      image: p.image,
      accent: p.accent,
      selections: sel,
      summary: selectionSummary(groups, sel),
      quantity: 1,
      unitPrice: unitPrice(p.discountPrice ?? p.basePrice, groups, sel),
    });
  }

  return (
    <article className={`accent-${p.accent} group relative flex flex-col overflow-hidden rounded-bowl bg-white shadow-lift ring-1 ring-line`}>
      <Link href={`/menu/${p.slug}`} className="relative block aspect-[5/4] overflow-hidden bg-[var(--accent-soft)]" tabIndex={-1} aria-hidden="true">
        {p.image && (
          <Image
            src={p.image}
            alt=""
            width={400}
            height={400}
            priority={priority}
            unoptimized={p.image.endsWith(".svg")}
            className="absolute -right-[12%] -top-[14%] h-[118%] w-auto max-w-none transition-transform duration-500 group-hover:rotate-6"
          />
        )}
        {!p.orderable && (
          <span className="absolute left-4 top-4 rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">{p.availability}</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-3">
          <FoodMark isVeg={p.isVeg} containsEgg={p.containsEgg} withLabel />
          {p.proteinG != null && (
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--accent-ink)]">
              {p.proteinG} g protein
            </span>
          )}
        </div>
        <h3 className="text-[1.4rem] font-bold">
          <Link href={`/menu/${p.slug}`} className="hover:underline decoration-[var(--accent)] decoration-[3px] underline-offset-4">
            {p.name}
          </Link>
        </h3>
        <p className="text-[0.95rem] text-ink-soft">{p.shortDescription}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Price base={p.basePrice} discount={p.discountPrice} className="text-lg" />
          <div className="flex gap-2">
            <Link href={`/menu/${p.slug}`} className="btn btn-ghost min-h-11 px-4 text-sm">
              View details
            </Link>
            <button
              type="button"
              onClick={quickAdd}
              disabled={!p.orderable}
              className="btn btn-primary min-h-11 px-4 text-sm"
              aria-label={`Add ${p.name} to cart`}
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
