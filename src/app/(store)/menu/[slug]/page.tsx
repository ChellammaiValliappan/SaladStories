import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Clock } from "lucide-react";
import { getProductBySlug, toClientProduct } from "@/lib/menu";
import { FoodMark } from "@/components/FoodMark";
import { Customizer } from "@/components/Customizer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return {};
  return {
    title: p.name,
    description: p.shortDescription,
    alternates: { canonical: `/menu/${p.slug}` },
    openGraph: { title: p.name, description: p.shortDescription, images: p.image && !p.image.endsWith(".svg") ? [p.image] : ["/icon-512.png"] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProductBySlug((await params).slug);
  if (!p) notFound();
  const client = toClientProduct(p);
  const nutrition = p.nutritionVerified
    ? [
        { label: "Protein", value: p.proteinG, unit: "g" },
        { label: "Calories", value: p.calories, unit: "kcal" },
        { label: "Carbs", value: p.carbsG, unit: "g" },
        { label: "Fat", value: p.fatG, unit: "g" },
        { label: "Fibre", value: p.fibreG, unit: "g" },
      ].filter((n) => n.value != null)
    : [];

  return (
    <div className={`accent-${p.accent}`}>
      <div className="bg-[var(--accent-soft)]">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-8 pt-4 lg:grid-cols-2 lg:pb-14">
          <div className="lg:order-2">
            <Link href="/menu" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] lg:hidden">
              <ChevronLeft className="h-4 w-4" /> Menu
            </Link>
            {p.image && (
              <Image
                src={p.image}
                alt={p.name}
                width={560}
                height={560}
                priority
                unoptimized={p.image.endsWith(".svg")}
                className="mx-auto h-auto w-[78%] max-w-md lg:w-full"
              />
            )}
          </div>
          <div className="lg:order-1">
            <Link href="/menu" className="mb-6 hidden items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] lg:inline-flex">
              <ChevronLeft className="h-4 w-4" /> Back to menu
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <FoodMark isVeg={p.isVeg} containsEgg={p.containsEgg} withLabel />
              {p.prepTimeMins && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                  <Clock className="h-3.5 w-3.5" /> Prepared in about {p.prepTimeMins} min
                </span>
              )}
            </div>
            <h1 className="mt-3 text-[2.6rem] font-[800] leading-[0.95] sm:text-6xl" style={{ fontStretch: "90%" }}>{p.name}</h1>
            <p className="mt-4 max-w-lg text-lg text-ink-soft">{p.description}</p>
            {p.ingredients.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Ingredients">
                {p.ingredients.map((i) => (
                  <li key={i} className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium">{i}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 lg:grid-cols-[1fr_22rem]">
        <Suspense>
          <Customizer product={client} />
        </Suspense>
        <aside className="space-y-4 lg:pt-2">
          <div className="panel p-5">
            <h2 className="text-lg font-bold">Nutrition per serving</h2>
            {nutrition.length ? (
              <dl className="mt-3 grid grid-cols-3 gap-3">
                {nutrition.map((n) => (
                  <div key={n.label} className="rounded-2xl bg-[var(--accent-soft)] p-3 text-center">
                    <dt className="text-xs font-semibold text-ink-soft">{n.label}</dt>
                    <dd className="font-display text-xl font-bold">{n.value}<span className="text-xs font-semibold"> {n.unit}</span></dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">We're verifying the nutrition figures for this bowl and will publish them here soon.</p>
            )}
            {p.portionSize && <p className="mt-3 text-sm text-ink-soft">Portion: {p.portionSize}{p.servingInfo ? ` · ${p.servingInfo}` : ""}</p>}
          </div>
          {p.allergens && (
            <div className="panel p-5">
              <h2 className="text-lg font-bold">Allergens</h2>
              <p className="mt-2 text-sm text-ink-soft">{p.allergens}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
