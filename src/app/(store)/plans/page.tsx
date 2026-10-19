import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarDays, Repeat, SkipForward } from "lucide-react";
import { getPlans } from "@/lib/plans";
import { getMenu } from "@/lib/menu";
import { formatINR } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Meal plans",
  description: "Fresh salad bowls delivered every day. Trial, weekly and monthly plans — pick any bowl for any day, swap or skip until 9 pm the evening before.",
};

const ACCENTS = ["bg-mango/30", "bg-sprout/40", "bg-basil text-white", "bg-carrot/25"];

export default async function PlansPage() {
  const [plans, { items }] = await Promise.all([getPlans(), getMenu()]);
  const cheapest = Math.min(...items.filter((p) => p.status === "PUBLISHED").map((p) => p.discountPrice ?? p.basePrice));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <p className="font-semibold text-basil">Meal plans</p>
      <h1 className="mt-1 max-w-3xl text-5xl font-[800] text-basil-deep sm:text-6xl">A fresh bowl at your door, every day</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-soft">
        Choose a plan, pick any bowl for each day, and we&apos;ll deliver at the time you choose. Plans save you up to{" "}
        {Math.max(0, ...plans.map((p) => p.discountPercent))}% on the menu price.
      </p>

      {plans.length === 0 ? (
        <p className="mt-10 rounded-3xl bg-crate p-6">Plans are coming soon. Meanwhile, <Link className="font-semibold text-basil underline" href="/menu">order from the menu</Link>.</p>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => {
            const dark = ACCENTS[i % ACCENTS.length].includes("text-white");
            const perDay = Number.isFinite(cheapest) ? Math.round((cheapest * (100 - p.discountPercent)) / 100) : null;
            return (
              <li key={p.id} className={`flex flex-col rounded-[1.75rem] p-6 ${ACCENTS[i % ACCENTS.length]}`}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-2xl font-bold">{p.name}</h2>
                  {p.discountPercent > 0 && (
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${dark ? "bg-sprout text-basil-deep" : "bg-basil text-white"}`}>{p.discountPercent}% off</span>
                  )}
                </div>
                <p className={`mt-1 font-display text-4xl font-[800] ${dark ? "" : "text-basil-deep"}`}>
                  {p.days ? `${p.days} days` : `${p.minDays}–${p.maxDays} days`}
                </p>
                <p className={`mt-3 flex-1 ${dark ? "text-white/85" : "text-ink-soft"}`}>{p.description}</p>
                {perDay != null && (
                  <p className={`mt-4 text-sm font-semibold ${dark ? "text-white/90" : ""}`}>
                    From {formatINR(perDay)} a day{p.deliveryFeePerDay ? ` + ${formatINR(p.deliveryFeePerDay)} delivery` : " · free delivery"}
                  </p>
                )}
                <Link href={`/plans/${p.code.toLowerCase()}`} className={`btn mt-4 ${dark ? "btn-sprout" : "btn-primary"}`}>
                  {p.days ? `Choose ${p.days} bowls` : "Pick your days"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-16" aria-labelledby="plan-how">
        <h2 id="plan-how" className="text-4xl font-bold">How plans work</h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: CalendarDays, t: "Pick your days", d: "Choose a start date and delivery time — or tap exactly the dates you want." },
            { icon: CalendarCheck, t: "Choose a bowl for each day", d: "Mix and match any bowl. Fill every day with one tap, or vary it." },
            { icon: Repeat, t: "Swap any day", d: "Change a day's bowl until 9 pm the evening before — any bowl up to that day's price." },
            { icon: SkipForward, t: "Skip, never lose a meal", d: "Travelling? Skip a day and it moves to the end of your plan." },
          ].map((s, i) => (
            <li key={s.t} className="rounded-[1.5rem] border border-line bg-white p-5">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-basil-soft text-basil"><s.icon className="h-5 w-5" /></span>
              <p className="mt-3 font-bold">{i + 1}. {s.t}</p>
              <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
