import Image from "next/image";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { Bike, Leaf, Salad, ShieldCheck, Sprout, Star } from "lucide-react";
import { db, deliveryAreas, reviews } from "@/db";
import { getMenu, toClientProduct } from "@/lib/menu";
import { ProductCard } from "@/components/ProductCard";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const BENEFITS = [
  { icon: Salad, title: "Built around protein", text: "Chicken, paneer and egg bowls for days you want a filling, protein-focused meal.", color: "text-tomato" },
  { icon: Sprout, title: "Made when you order", text: "Vegetables are cut and bowls are assembled in our kitchen for your delivery slot.", color: "text-leaf" },
  { icon: Bike, title: "Delivered to your door", text: "Lunch, afternoon and dinner slots across Taramani, Perungudi and Thoraipakkam.", color: "text-carrot" },
  { icon: Leaf, title: "Veg and non-veg", text: "Every bowl is clearly marked, so you always know what's inside.", color: "text-beet" },
  { icon: ShieldCheck, title: "Nothing hidden", text: "Ingredients are listed on every bowl, and nutrition figures appear once they're verified.", color: "text-basil" },
];

const STEPS = [
  { title: "Choose your bowl", text: "Pick from salads, protein bowls and fruit bowls." },
  { title: "Customize your meal", text: "Change the portion, add extra protein, leave out what you don't like." },
  { title: "Pay securely online", text: "UPI, cards, net banking and wallets through Razorpay." },
  { title: "Enjoy doorstep delivery", text: "Choose a slot and we'll bring it fresh to your door." },
];

export default async function HomePage() {
  const [{ items }, published, areas] = await Promise.all([
    getMenu(),
    db.select().from(reviews).where(eq(reviews.isPublished, true)).orderBy(desc(reviews.createdAt)).limit(6),
    db.select().from(deliveryAreas).where(eq(deliveryAreas.isActive, true)).orderBy(asc(deliveryAreas.sortOrder)),
  ]);
  const settings = await getSettings();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  // Helps Google show Salad Stories as a local food business (no ratings — only real data).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: settings.businessName,
    url: site || undefined,
    image: site ? `${site}/icon-512.png` : undefined,
    servesCuisine: ["Salads", "Healthy food"],
    priceRange: "₹₹",
    telephone: settings.phone || undefined,
    email: settings.email || undefined,
    address: { "@type": "PostalAddress", streetAddress: settings.address || undefined, addressLocality: "Chennai", addressRegion: "Tamil Nadu", addressCountry: "IN" },
    areaServed: areas.map((a) => ({ "@type": "Place", name: `${a.name}, Chennai` })),
    hasMenu: site ? `${site}/menu` : undefined,
    sameAs: [settings.instagram, settings.facebook, settings.youtube].filter(Boolean),
  };
  const featured = items.filter((p) => p.featured).map(toClientProduct);
  const shown = featured.length ? featured : items.map(toClientProduct);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-crate">
        <div className="pointer-events-none absolute -right-20 -top-4 w-[21rem] sm:-right-20 sm:top-0 sm:w-[30rem] lg:right-[-4rem] lg:top-1/2 lg:w-[40rem] lg:-translate-y-1/2">
          <Image src="/images/bowls/hero.svg" alt="" width={640} height={640} priority unoptimized className="hero-bowl h-auto w-full" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-[19.5rem] sm:pt-[27rem] lg:py-28">
          <div className="max-w-xl">
            <h1 className="text-[3.1rem] font-[800] leading-[0.92] text-basil-deep sm:text-7xl" style={{ fontStretch: "88%" }}>
              Fresh Bowls.
              <br />
              High Protein.
              <br />
              Better You.
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-soft">
              Discover delicious, protein-focused salads made for your everyday health goals.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/menu" className="btn btn-primary text-base">Explore Our Menu</Link>
              <Link href="/menu#order" className="btn btn-sprout text-base">Order Now</Link>
            </div>
            <p className="mt-6 text-sm font-medium text-ink-soft">
              Delivering in {areas.map((a) => a.name).join(", ").replace(/, ([^,]*)$/, " and $1")}.
            </p>
          </div>
        </div>
      </section>

      {/* Featured menu */}
      <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="menu-title">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="menu-title" className="text-4xl font-bold sm:text-5xl">Five bowls, your way</h2>
          <Link href="/menu" className="hidden shrink-0 font-semibold text-basil underline-offset-4 hover:underline sm:block">
            See the full menu
          </Link>
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
          {shown.map((p, i) => (
            <div key={p.id} className="w-[84%] shrink-0 snap-start sm:w-auto">
              <ProductCard p={p} priority={i < 2} />
            </div>
          ))}
        </div>
      </section>

      {/* Why choose */}
      <section className="mx-auto mt-16 max-w-6xl px-4" aria-labelledby="why-title">
        <div className="rounded-[2.5rem] bg-basil-soft px-6 py-12 sm:px-12">
          <h2 id="why-title" className="max-w-lg text-4xl font-bold text-basil-deep sm:text-5xl">Why choose Salad Stories?</h2>
          <ul className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white">
                  <b.icon className={`h-6 w-6 ${b.color}`} />
                </span>
                <div>
                  <h3 className="text-xl font-bold text-basil-deep">{b.title}</h3>
                  <p className="mt-1 text-ink-soft">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-16 max-w-6xl px-4" aria-labelledby="how-title">
        <h2 id="how-title" className="text-4xl font-bold sm:text-5xl">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-3xl border border-line bg-white p-5 sm:block sm:p-6">
              <span className="font-display text-5xl font-[800] leading-none text-sprout">{i + 1}</span>
              <div>
                <h3 className="text-xl font-bold sm:mt-3">{s.title}</h3>
                <p className="mt-1 text-ink-soft">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Reviews — only genuine, owner-published reviews */}
      {published.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4" aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="text-4xl font-bold sm:text-5xl">What our customers say</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {published.map((r) => (
              <figure key={r.id} className="rounded-3xl bg-crate p-6">
                {r.rating != null && (
                  <div className="mb-3 flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < r.rating! ? "fill-mango text-mango" : "text-crate-deep"}`} />
                    ))}
                  </div>
                )}
                <blockquote className="text-lg">“{r.text}”</blockquote>
                <figcaption className="mt-3 font-semibold text-basil-deep">{r.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section id="order" className="mx-auto mt-16 max-w-6xl px-4">
        <div className="flex flex-col items-start gap-5 rounded-[2.5rem] bg-basil px-6 py-10 text-white sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">Hungry for something fresh?</h2>
            <p className="mt-2 text-white/80">Pick a bowl now and choose a lunch, afternoon or dinner slot.</p>
          </div>
          <Link href="/menu" className="btn btn-sprout text-base">Order Now</Link>
        </div>
      </section>
    </>
  );
}
