import type { Metadata } from "next";
import { getMenu, toClientProduct } from "@/lib/menu";
import { MenuGrid } from "@/components/MenuGrid";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu", description: "High-protein salads, paneer bowls, egg salads and fruit bowls." };

export default async function MenuPage() {
  const { items, categories } = await getMenu();
  return (
    <div id="order" className="mx-auto max-w-6xl px-4 pt-10">
      <h1 className="text-5xl font-[800] text-basil-deep sm:text-6xl">Our menu</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-soft">Every bowl can be customized — portion, extra protein, dressing and what to leave out.</p>
      <MenuGrid products={items.map(toClientProduct)} categories={categories.map((c) => ({ id: c.id, name: c.name }))} productCategory={Object.fromEntries(items.map((p) => [p.id, p.categoryId]))} />
    </div>
  );
}
