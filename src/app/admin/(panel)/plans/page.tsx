import Link from "next/link";
import { asc, count, desc, eq, gte, and, inArray } from "drizzle-orm";
import { db, orders, subscriptionDays, subscriptions } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getPlans, subscriptionState } from "@/lib/plans";
import { parseWeekdays, WEEKDAY_NAMES } from "@/lib/plans-core";
import { addDays, formatDateLong, istParts } from "@/lib/time";
import { savePlan } from "../../actions";
import { Badge, Card, Check, Empty, Field, PageHead, Table } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Meal plans" };

const r = (p: number) => p / 100;

export default async function PlansAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; show?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const today = istParts().dateStr;
  const showAll = sp.show === "all";
  const [plans, subs, [tomorrow]] = await Promise.all([
    getPlans(false),
    db
      .select()
      .from(subscriptions)
      .where(showAll ? undefined : inArray(subscriptions.status, ["ACTIVE", "PENDING_PAYMENT"]))
      .orderBy(desc(subscriptions.createdAt))
      .limit(200),
    db
      .select({ n: count() })
      .from(subscriptionDays)
      .innerJoin(orders, eq(orders.id, subscriptionDays.orderId))
      .where(and(eq(subscriptionDays.date, addDays(today, 1)), eq(subscriptionDays.status, "SCHEDULED"), eq(orders.status, "PAID"))),
  ]);
  const left = subs.length
    ? await db
        .select({ id: subscriptionDays.subscriptionId, n: count() })
        .from(subscriptionDays)
        .where(and(inArray(subscriptionDays.subscriptionId, subs.map((s) => s.id)), eq(subscriptionDays.status, "SCHEDULED"), gte(subscriptionDays.date, today)))
        .groupBy(subscriptionDays.subscriptionId)
    : [];
  const leftOf = new Map(left.map((l) => [l.id, Number(l.n)]));
  const active = subs.filter((s) => subscriptionState(s).key === "ACTIVE");
  const waiting = subs.filter((s) => s.status === "PENDING_PAYMENT");

  return (
    <>
      <PageHead title="Meal plans">
        <Link href="/plans" target="_blank" className="btn btn-ghost min-h-10 text-sm">View plans page</Link>
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Active plans", value: active.length },
          { label: "Waiting for payment", value: waiting.length },
          { label: "Plan bowls tomorrow", value: Number(tomorrow?.n ?? 0) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm font-semibold text-ink-soft">{t.label}</p>
            <p className="mt-1 font-display text-3xl font-[800]">{t.value}</p>
          </div>
        ))}
      </div>

      <Card
        title={showAll ? "All plans" : "Current plans"}
        actions={<Link href={showAll ? "/admin/plans" : "/admin/plans?show=all"} className="text-sm font-semibold text-basil">{showAll ? "Only current" : "Show all"}</Link>}
        className="mb-6"
      >
        {subs.length === 0 ? (
          <Empty>No plans yet. They&apos;ll appear here when customers buy one from the Meal plans page.</Empty>
        ) : (
          <Table head={["Plan", "Customer", "Dates", "Days left", "Paid", "Status"]}>
            {subs.map((s) => {
              const st = subscriptionState(s);
              return (
                <tr key={s.id} className="hover:bg-paper">
                  <td className="px-4 py-3"><Link href={`/admin/plans/${s.id}`} className="font-bold text-basil hover:underline">{s.number}</Link><br /><span className="text-ink-soft">{s.planName} · {s.slotName}</span></td>
                  <td className="px-4 py-3">{s.customerName}<br /><span className="text-ink-soft">{s.phone}</span></td>
                  <td className="px-4 py-3">{formatDateLong(s.startDate)}<br /><span className="text-ink-soft">to {formatDateLong(s.endDate)}</span></td>
                  <td className="px-4 py-3 font-semibold">{leftOf.get(s.id) ?? 0} / {s.daysTotal}</td>
                  <td className="px-4 py-3 font-semibold">{formatINR(s.total)}</td>
                  <td className="px-4 py-3"><Badge value={st.key} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {me.role === "ADMIN" && (
        <Card title="Plans customers can buy">
          <p className="mb-4 text-sm text-ink-soft">
            Leave <b>Days</b> blank for a plan where customers pick their own dates (then set the minimum and maximum). Changes apply to new plans only — plans already bought keep their price.
          </p>
          <div className="space-y-4">
            {[...plans, null].map((p) => (
              <form key={p?.id ?? "new"} action={savePlan} className={`grid gap-3 rounded-2xl border p-4 md:grid-cols-6 ${p ? "border-line" : "border-dashed border-basil"}`}>
                <input type="hidden" name="id" value={p?.id ?? ""} />
                <p className="font-bold md:col-span-6">{p ? `${p.name}${p.isActive ? "" : " (hidden)"}` : "Add a plan"}</p>
                <Field label="Name" name="name" defaultValue={p?.name} required className="md:col-span-2" />
                <Field label="Description" name="description" defaultValue={p?.description} className="md:col-span-4" />
                <Field label="Days" name="days" type="number" defaultValue={p ? p.days ?? "" : ""} hint="Blank = customer picks" />
                <Field label="Min days" name="minDays" type="number" defaultValue={p?.minDays ?? 2} />
                <Field label="Max days" name="maxDays" type="number" defaultValue={p?.maxDays ?? 30} />
                <Field label="Plan price (₹)" name="price" type="number" step="0.01" defaultValue={p ? r(p.price) : ""} hint="For plans with a set number of days" />
                <Field label="Price per day (₹)" name="pricePerDay" type="number" step="0.01" defaultValue={p ? r(p.pricePerDay) : ""} hint="For pick-your-days plans" />
                <Field label="Premium bowl extra / day (₹)" name="premiumSurchargePerDay" type="number" step="0.01" defaultValue={p ? r(p.premiumSurchargePerDay) : 30} />
                <Field label="Large portion extra / day (₹)" name="largeSurchargePerDay" type="number" step="0.01" defaultValue={p ? r(p.largeSurchargePerDay) : 60} hint="0 = no large option" />
                <Field label="Discount %" name="discountPercent" type="number" defaultValue={p?.discountPercent ?? 0} hint="Optional promo on top" />
                <Field label="Delivery per day (₹)" name="deliveryFeePerDay" type="number" step="0.01" defaultValue={p ? r(p.deliveryFeePerDay) : 0} hint="0 = free" />
                <Field label="Order on page" name="sortOrder" type="number" defaultValue={p?.sortOrder ?? plans.length + 1} />
                <fieldset className="md:col-span-6">
                  <legend className="label">Delivery days</legend>
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <label key={d} className="flex items-center gap-1.5 text-sm font-semibold">
                        <input type="checkbox" name="weekdays" value={d} defaultChecked={parseWeekdays(p?.weekdays ?? "1,2,3,4,5").includes(d)} className="h-5 w-5 accent-[#1f6b3a]" />
                        {WEEKDAY_NAMES[d]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex items-end justify-between gap-3 md:col-span-6">
                  <div className="flex flex-wrap gap-5">
                    <Check label="Show on the plans page" name="isActive" defaultChecked={p ? p.isActive : true} />
                    <Check label="Trial plan" name="isTrial" defaultChecked={p ? p.isTrial : false} />
                  </div>
                  <SubmitButton className="btn btn-primary">{p ? "Save" : "Add plan"}</SubmitButton>
                </div>
              </form>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
