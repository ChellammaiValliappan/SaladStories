import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { categories, db, products } from "@/db";
import { formatINR } from "@/lib/money";
import { deleteCategory, saveCategory, setProductAvailability } from "../../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { getCurrentUser } from "@/lib/auth";
import { Badge, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";

export const metadata = { title: "Menu" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const isAdmin = me?.role === "ADMIN";
  const [rows, cats] = await Promise.all([
    db.select().from(products).orderBy(asc(products.sortOrder), asc(products.name)),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
  ]);
  return (
    <>
      <PageHead title="Menu">
        {isAdmin && <Link href="/admin/products/new" className="btn btn-primary min-h-11">Add a menu item</Link>}
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((p) => (
          <li key={p.id} className={`accent-${p.accent} flex gap-4 rounded-2xl border border-line bg-white p-4`}>
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--accent-soft)]">
              {p.image && <Image src={p.image} alt="" fill unoptimized={p.image.endsWith(".svg")} className="object-cover" sizes="80px" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                {isAdmin ? <Link href={`/admin/products/${p.id}`} className="font-bold hover:underline">{p.name}</Link> : <span className="font-bold">{p.name}</span>}
                <span className="shrink-0 font-semibold">{formatINR(p.discountPrice ?? p.basePrice)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge value={p.status} />
                {p.stockStatus === "SOLD_OUT" && <Badge value="UNAVAILABLE" />}
                {!p.nutritionVerified && <span className="rounded-full bg-crate px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Nutrition not verified</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <form action={setProductAvailability}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="field" value="stockStatus" />
                  <input type="hidden" name="value" value={p.stockStatus === "SOLD_OUT" ? "IN_STOCK" : "SOLD_OUT"} />
                  <button className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:border-basil">{p.stockStatus === "SOLD_OUT" ? "Back in stock" : "Mark sold out"}</button>
                </form>
                <form action={setProductAvailability}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="field" value="status" />
                  <input type="hidden" name="value" value={p.status === "PUBLISHED" ? "UNAVAILABLE" : "PUBLISHED"} />
                  <button className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:border-basil">{p.status === "PUBLISHED" ? "Disable for now" : "Publish"}</button>
                </form>
                {isAdmin && <Link href={`/admin/products/${p.id}`} className="rounded-lg px-3 py-1.5 font-semibold text-basil hover:bg-basil-soft">Edit</Link>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <section className="mt-8 rounded-2xl border border-line bg-white p-5">
          <h2 className="text-lg font-bold">Menu categories</h2>
          <p className="mb-4 text-sm text-ink-soft">Categories become filter buttons on the menu page. Lower numbers show first.</p>
          <div className="space-y-2">
            {cats.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <form action={saveCategory} className="flex flex-1 flex-wrap gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} className="field min-h-10 flex-1 py-1.5" aria-label="Category name" required />
                  <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="field min-h-10 w-20 py-1.5" aria-label="Order" />
                  <SubmitButton className="btn btn-ghost min-h-10 px-4 text-sm">Save</SubmitButton>
                </form>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="min-h-10 rounded-lg px-3 text-sm font-semibold text-tomato hover:bg-tomato/10" confirm={`Delete the "${c.name}" category? Its items stay on the menu.`} pendingText="…">Delete</SubmitButton>
                </form>
              </div>
            ))}
            <form action={saveCategory} className="flex flex-wrap gap-2 pt-2">
              <input name="name" placeholder="New category, e.g. Smoothies" className="field min-h-10 flex-1 py-1.5" required />
              <input name="sortOrder" type="number" defaultValue={cats.length + 1} className="field min-h-10 w-20 py-1.5" aria-label="Order" />
              <SubmitButton className="btn btn-primary min-h-10 px-4 text-sm">Add category</SubmitButton>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
