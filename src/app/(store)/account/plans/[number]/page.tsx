import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, orders, subscriptions } from "@/db";
import { getCurrentUser, isTeam } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { STATUS_LABELS, addressLine } from "@/lib/notify";
import { canChangeDay, getSubscription, planSlotStart, subscriptionState, swapOptions } from "@/lib/plans";
import { formatDateLong, istParts } from "@/lib/time";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { skipDay, swapDay } from "../actions";

export const metadata: Metadata = { title: "My plan", robots: { index: false } };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = { swapped: "Bowl changed. The kitchen has the update." };

export default async function ManagePlanPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/account/plans/${number}`);
  const [row] = await db.select({ id: subscriptions.id, userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.number, number));
  if (!row || (row.userId !== user.id && !isTeam(user.role))) notFound();
  const sub = (await getSubscription(row.id))!;
  const slotStart = await planSlotStart(sub);
  const labelOf = (n: number) => (n === 2 && sub.address2 ? sub.address2Label : sub.addressLabel);
  const weekdaysFor = (n: number) => {
    const days = [...new Set(sub.days.filter((d) => d.addressNo === n).map((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay()))].sort();
    return days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ");
  };
  const st = subscriptionState(sub);
  const today = istParts().dateStr;
  const scheduled = sub.days.filter((d) => d.status === "SCHEDULED");
  const upcoming = scheduled.filter((d) => d.date >= today);
  const [payOrder] = sub.paymentOrderId ? await db.select().from(orders).where(eq(orders.id, sub.paymentOrderId)) : [];
  // Swap choices per price cap (days usually share a few prices).
  const caps = [...new Set(upcoming.map((d) => d.tier))];
  const optionsByCap = new Map(await Promise.all(caps.map(async (c) => [c, await swapOptions(sub, c)] as const)));
  const flash = sp.err ?? (sp.msg ? MESSAGES[sp.msg] ?? sp.msg : null);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10">
      <Link href="/account/plans" className="text-sm font-semibold text-basil">← My plans</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-[800] text-basil-deep sm:text-5xl">{sub.planName} plan</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${st.key === "ACTIVE" ? "bg-basil-soft text-basil-deep" : st.key === "PENDING_PAYMENT" ? "bg-mango/30" : "bg-crate"}`}>{st.label}</span>
      </div>
      <p className="mt-1 text-ink-soft">
        {sub.number} · {sub.daysTotal} days · {sub.quantity} bowl{sub.quantity === 1 ? "" : "s"} a day{sub.large ? " · large" : ""} · {sub.slotName}
      </p>

      {flash && (
        <p role={sp.err ? "alert" : "status"} className={`mt-5 rounded-xl p-3 text-sm font-semibold ${sp.err ? "bg-tomato/10 text-tomato" : "bg-basil-soft text-basil-deep"}`}>{flash}</p>
      )}

      {sub.status === "PENDING_PAYMENT" && payOrder && (
        <div className="mt-6 rounded-3xl bg-mango/25 p-5">
          <p className="font-bold">Waiting for payment of {formatINR(sub.total)}</p>
          <p className="mt-1 text-sm">Your days are held. Finish paying to start the plan.</p>
          <Link href={`/order/${payOrder.orderNumber}?t=${payOrder.trackingToken}`} className="btn btn-primary mt-3">Pay now</Link>
        </div>
      )}

      {sub.status === "ACTIVE" && (
        <p className="mt-6 rounded-2xl bg-crate p-4 text-sm">
          Change a day&apos;s bowl or ask to skip a day up to <b>24 hours before delivery</b>. You can swap to any bowl of the same kind (premium bowls on premium days). We&apos;ll confirm each skip and tell you the new date — usually it&apos;s added to the end of your plan. Delivery addresses can&apos;t be changed.
        </p>
      )}

      <ul className="mt-6 divide-y divide-line rounded-3xl border border-line bg-white">
        {sub.days.map((d) => {
          const skipped = d.status === "SKIPPED" || d.status === "FORFEITED";
          const held = d.status === "HELD";
          const past = d.date < today;
          const editable = sub.status === "ACTIVE" && !skipped && canChangeDay(d.date, slotStart) && (!d.order || d.order.status === "PAID");
          const opts = optionsByCap.get(d.tier) ?? [];
          const orderStatus = d.order ? STATUS_LABELS[d.order.status] ?? d.order.status : null;
          return (
            <li key={d.id} className={`p-4 sm:p-5 ${skipped ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{formatDateLong(d.date)}</p>
                  <p className={`text-sm ${skipped ? "line-through" : ""}`}>{d.productName}</p>
                  {sub.address2 && <p className="text-xs font-semibold text-ink-soft">To {labelOf(d.addressNo)}</p>}
                </div>
                <span className="text-sm font-semibold text-ink-soft">
                  {held ? "Skip requested — we'll confirm" : d.status === "FORFEITED" ? "Not delivered" : skipped ? "Moved" : d.order && d.order.status !== "PAID" ? orderStatus : sub.status !== "ACTIVE" ? "" : editable ? "You can change this" : past ? "" : "Locked in"}
                </span>
              </div>
              {editable && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={swapDay} className="flex flex-1 flex-wrap gap-2">
                    <input type="hidden" name="number" value={sub.number} />
                    <input type="hidden" name="subscriptionId" value={sub.id} />
                    <input type="hidden" name="dayId" value={d.id} />
                    <label className="sr-only" htmlFor={`swap-${d.id}`}>New bowl for {formatDateLong(d.date)}</label>
                    <select id={`swap-${d.id}`} name="productId" defaultValue={d.productId ?? ""} className="field min-h-10 min-w-0 flex-1 py-1.5 text-sm">
                      {opts.map((o) => (
                        <option key={o.id} value={o.id} disabled={!o.ok}>
                          {o.name}{o.soldOut ? " (sold out)" : !o.ok ? " (premium — ask us)" : ""}
                        </option>
                      ))}
                    </select>
                    <SubmitButton className="btn btn-ghost min-h-10 px-4 text-sm" pendingText="Saving…">Swap</SubmitButton>
                  </form>
                  <details className="w-full">
                    <summary className="cursor-pointer py-1 text-sm font-semibold text-basil">Can&apos;t take this day?</summary>
                    <form action={skipDay} className="mt-2 space-y-2">
                      <input type="hidden" name="number" value={sub.number} />
                      <input type="hidden" name="subscriptionId" value={sub.id} />
                      <input type="hidden" name="dayId" value={d.id} />
                      <label className="label" htmlFor={`why-${d.id}`}>Reason (optional)</label>
                      <input id={`why-${d.id}`} name="reason" maxLength={200} placeholder="e.g. travelling, working from office" className="field" />
                      <SubmitButton className="btn btn-ghost min-h-10 px-4 text-sm" pendingText="Sending…">Ask to skip {formatDateLong(d.date)}</SubmitButton>
                    </form>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="mt-6 rounded-3xl bg-crate p-5 text-sm">
        <p className="font-semibold">Delivering to {sub.customerName} · {sub.phone}</p>
        {sub.address2 ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {[{ n: 1, a: sub.address }, { n: 2, a: sub.address2 }].map(({ n, a }) => (
              <div key={n}>
                <p className="font-semibold">{labelOf(n)} · {weekdaysFor(n)}</p>
                <p className="text-ink-soft">{addressLine(a)}</p>
                {a.instructions && <p className="mt-1 text-ink-soft">Note: {a.instructions}</p>}
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="text-ink-soft">{addressLine(sub.address)}</p>
            {sub.address.instructions && <p className="mt-1 text-ink-soft">Note: {sub.address.instructions}</p>}
          </>
        )}
        <p className="mt-3">Paid {formatINR(sub.total)}{sub.discount ? ` (saved ${formatINR(sub.discount)})` : ""}.</p>
      </section>
      {upcoming.length === 0 && sub.status === "ACTIVE" && (
        <Link href="/plans" className="btn btn-primary mt-6">Start a new plan</Link>
      )}
    </div>
  );
}
