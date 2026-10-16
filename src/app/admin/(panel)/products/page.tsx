import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, products } from "@/db";
import { formatINR } from "@/lib/money";
import { setProductAvailability } from "../../actions";
import { Badge, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";

export const metadata = { title: "Menu" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select().from(products).orderBy(asc(products.sortOrder), asc(products.name));
  return (
    <>
      <PageHead title="Menu">
        <Link href="/admin/products/new" className="btn btn-primary min-h-11">Add a menu item</Link>
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
                <Link href={`/admin/products/${p.id}`} className="font-bold hover:underline">{p.name}</Link>
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
                <Link href={`/admin/products/${p.id}`} className="rounded-lg px-3 py-1.5 font-semibold text-basil hover:bg-basil-soft">Edit</Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
