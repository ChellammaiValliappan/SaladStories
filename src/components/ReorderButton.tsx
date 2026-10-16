"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import type { Quote } from "@/lib/pricing";

type Item = { productId: string | null; quantity: number; selections: Record<string, Record<string, number>> };

/** Adds a past order back into the cart, re-priced and re-checked by the server. */
export function ReorderButton({ items }: { items: Item[] }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [msg, setMsg] = useState("");
  async function reorder() {
    const valid = items.filter((i) => i.productId) as { productId: string; quantity: number; selections: Item["selections"] }[];
    const res = await fetch("/api/cart/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: valid }) });
    const q: Quote = await res.json();
    const ok = q.lines.filter((l) => !l.issue);
    for (const l of ok) {
      add({ productId: l.productId, slug: l.slug, name: l.name, image: l.image, accent: l.accent, selections: l.selections, summary: l.summary, quantity: l.quantity, unitPrice: l.unitPrice });
    }
    if (ok.length < q.lines.length) setMsg("Some items from this order aren't available right now, so we left them out.");
    if (ok.length) router.push("/cart");
    else setMsg("None of these items are available right now.");
  }
  return (
    <div>
      <button type="button" onClick={reorder} className="btn btn-primary"><RotateCcw className="h-4 w-4" /> Order again</button>
      {msg && <p className="mt-2 text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
