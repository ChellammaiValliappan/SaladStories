import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { addresses, db, deliverySlots } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getMenu } from "@/lib/menu";
import { getSettings } from "@/lib/settings";
import { unitPrice, type GroupDef } from "@/lib/customization";
import { getPlanByCode, PLAN_START_WITHIN_DAYS, slotLabelOf } from "@/lib/plans";
import { earliestStart, planSelections } from "@/lib/plans-core";
import { addDays } from "@/lib/time";
import { PlanBuilder } from "@/components/PlanBuilder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Build your plan", robots: { index: false } };

export default async function PlanBuilderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const plan = await getPlanByCode(code);
  if (!plan || !plan.isActive) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/plans/${code.toLowerCase()}`)}`);

  const [slots, { items }, saved, settings] = await Promise.all([
    db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder), asc(deliverySlots.startTime)),
    getMenu(),
    db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault)).limit(1),
    getSettings(),
  ]);
  const bowls = items
    .filter((p) => p.status === "PUBLISHED")
    .map((p) => {
      const groups = p.optionGroups as GroupDef[];
      const base = p.discountPrice ?? p.basePrice;
      const regular = unitPrice(base, groups, planSelections(groups, false));
      const large = unitPrice(base, groups, planSelections(groups, true));
      return { id: p.id, name: p.name, image: p.image, accent: p.accent, isVeg: p.isVeg, price: regular, priceLarge: large, soldOut: p.stockStatus === "SOLD_OUT" };
    });
  const first = earliestStart();
  const a = saved[0];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <Link href="/plans" className="text-sm font-semibold text-basil">← All plans</Link>
      <h1 className="mt-2 text-4xl font-[800] text-basil-deep sm:text-5xl">
        {plan.name} plan{plan.days ? ` · ${plan.days} days` : ""}
        {plan.discountPercent > 0 && <span className="ml-3 inline-block -translate-y-1 rounded-full bg-sprout px-3 py-1 align-middle text-base font-bold text-basil-deep">{plan.discountPercent}% off</span>}
      </h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{plan.description}</p>
      {slots.length === 0 || bowls.length === 0 ? (
        <p className="mt-8 rounded-3xl bg-crate p-6">Plans aren&apos;t open right now. Please check back soon.</p>
      ) : (
        <PlanBuilder
          plan={{ code: plan.code, name: plan.name, days: plan.days, minDays: plan.minDays, maxDays: plan.maxDays, discountPercent: plan.discountPercent }}
          slots={slots.map((s) => ({ id: s.id, label: slotLabelOf(s) }))}
          bowls={bowls}
          hasLarge={bowls.some((b) => b.priceLarge > b.price)}
          earliest={first}
          latest={addDays(first, PLAN_START_WITHIN_DAYS)}
          upi={settings.paymentMode === "UPI"}
          user={{ name: user.name, email: user.email ?? "", phone: user.phone ?? "" }}
          address={
            a
              ? { house: a.house, building: a.building, street: a.street, area: a.area, city: a.city, state: a.state, pincode: a.pincode, landmark: a.landmark, instructions: a.instructions }
              : null
          }
        />
      )}
    </div>
  );
}
