import crypto from "crypto";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { customers, db, deliverySlots, subscriptions } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getMenu } from "@/lib/menu";
import { getPlans, slotLabelOf } from "@/lib/plans";
import { parseWeekdays } from "@/lib/plans-core";
import { addDays, istParts } from "@/lib/time";
import { PageHead } from "@/components/admin/ui";
import { NewSubscriptionForm } from "@/components/admin/biz/NewSubscriptionForm";

export const metadata = { title: "New plan" };

export default async function NewSubscriptionPage({ searchParams }: { searchParams: Promise<{ customer?: string; renew?: string }> }) {
  await requireAdmin();
  const { customer: customerId, renew: renewId } = await searchParams;
  const [c] = customerId ? await db.select().from(customers).where(eq(customers.id, customerId)) : [];
  if (!c) {
    return (
      <>
        <PageHead title="New plan" back={{ href: "/admin/customers", label: "Customers" }} />
        <p className="rounded-2xl bg-crate p-5">Open a customer first, then tap <b>New plan</b>. <Link href="/admin/customers" className="font-semibold text-basil underline">Find a customer</Link> or <Link href="/admin/customers/new" className="font-semibold text-basil underline">add one</Link>.</p>
      </>
    );
  }
  const [plans, slots, { items }] = await Promise.all([
    getPlans(false),
    db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder)),
    getMenu(),
  ]);
  const today = istParts().dateStr;
  const [old] = renewId ? await db.select().from(subscriptions).where(eq(subscriptions.id, renewId)) : [];
  const renew =
    old && old.customerId === c.id
      ? {
          fromId: old.id,
          number: old.number,
          planCode: old.planCode,
          slotId: old.slotId,
          weekdays: parseWeekdays(old.weekdays),
          quantity: old.quantity,
          large: old.large,
          // Carry on straight after the old plan's last delivery.
          startDate: [addDays(old.actualEndDate ?? old.endDate, 1), addDays(today, 1)].sort().pop()!,
        }
      : null;
  return (
    <>
      <PageHead title={renew ? `Renew ${c.name}'s plan` : `New plan for ${c.name}`} back={{ href: `/admin/customers/${c.id}`, label: c.name }} />
      {renew && <p className="mb-4 rounded-2xl bg-basil-soft p-4 text-sm">Renewing <Link href={`/admin/plans/${renew.fromId}`} className="font-semibold underline">{renew.number}</Link>. Same delivery days and time are filled in — change anything you need. The old plan is marked renewed once you save.</p>}
      {!c.address?.house || !c.address?.pincode ? (
        <p className="rounded-2xl bg-tomato/10 p-5 font-semibold text-tomato">
          Add {c.name}&apos;s delivery address first. <Link href={`/admin/customers/${c.id}`} className="underline">Edit details</Link>
        </p>
      ) : (
        <NewSubscriptionForm
          customer={{ id: c.id, name: c.name, pincode: c.address.pincode, preferredSlotId: c.preferredSlotId }}
          plans={plans
            .filter((p) => (p.days ? p.price : p.pricePerDay) > 0)
            .map((p) => ({ code: p.code, name: p.name, days: p.days, minDays: p.minDays, maxDays: p.maxDays, weekdays: parseWeekdays(p.weekdays), price: p.price, pricePerDay: p.pricePerDay, isTrial: p.isTrial }))}
          slots={slots.map((s) => ({ id: s.id, label: slotLabelOf(s) }))}
          bowls={items.filter((p) => p.status === "PUBLISHED").map((p) => ({ id: p.id, name: p.name, premium: p.planTier === "PREMIUM", soldOut: p.stockStatus === "SOLD_OUT" }))}
          tomorrow={addDays(today, 1)}
          today={today}
          idempotencyKey={crypto.randomUUID()}
          renew={renew}
        />
      )}
    </>
  );
}
