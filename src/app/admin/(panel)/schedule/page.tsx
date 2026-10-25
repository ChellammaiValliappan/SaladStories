import Link from "next/link";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, orders, subscriptionDays } from "@/db";
import { requireStaff } from "@/lib/auth";
import { attentionItems, deliveryList } from "@/lib/biz/daily";
import { PAYMENT_STATUS_LABELS } from "@/lib/biz/core";
import { formatINR } from "@/lib/money";
import { addDays, dayOfWeek, formatDateLong, istParts } from "@/lib/time";
import { Card, Empty, PageHead } from "@/components/admin/ui";

export const metadata = { title: "Schedule" };

const KITCHEN = ["PAID", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; from?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const today = istParts().dateStr;
  const date = sp.date && dateRe.test(sp.date) ? sp.date : addDays(today, 1);
  // A two-week strip starting on the Monday of the chosen week.
  const from = sp.from && dateRe.test(sp.from) ? sp.from : addDays(date, -((dayOfWeek(date) + 6) % 7));
  const to = addDays(from, 13);

  const [counts, held, list] = await Promise.all([
    db
      .select({ d: orders.deliveryDate, kind: orders.kind, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(gte(orders.deliveryDate, from), lte(orders.deliveryDate, to), inArray(orders.status, KITCHEN), inArray(orders.kind, ["ORDER", "PLAN_DAY"])))
      .groupBy(orders.deliveryDate, orders.kind),
    db
      .select({ d: subscriptionDays.date, n: sql<number>`count(*)::int` })
      .from(subscriptionDays)
      .where(and(gte(subscriptionDays.date, from), lte(subscriptionDays.date, to), eq(subscriptionDays.status, "HELD")))
      .groupBy(subscriptionDays.date),
    deliveryList(date),
  ]);
  const attention = await attentionItems(date, list);
  const dayAttention = attention.filter((a) => a.kind === "PAYMENT_DUE" || a.kind === "RENEWAL");
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const countOf = (d: string, kind?: string) => counts.filter((c) => c.d === d && (!kind || c.kind === kind)).reduce((t, c) => t + c.n, 0);
  const heldOf = (d: string) => held.find((h) => h.d === d)?.n ?? 0;

  const prep = new Map<string, number>();
  for (const e of list) for (const b of e.bowls) prep.set(b.name, (prep.get(b.name) ?? 0) + b.qty);
  const slots = [...new Set(list.map((e) => e.slotName))];

  return (
    <>
      <PageHead title="Schedule">
        <Link href={`/admin/kitchen?date=${date}`} className="btn btn-ghost">Kitchen sheet</Link>
      </PageHead>

      <div className="mb-2 flex items-center justify-between text-sm font-semibold">
        <Link href={`/admin/schedule?date=${addDays(from, -7)}&from=${addDays(from, -14)}`} className="text-basil">← Earlier</Link>
        <Link href={`/admin/schedule?date=${today}`} className="text-basil">Today</Link>
        <Link href={`/admin/schedule?date=${addDays(from, 14)}&from=${addDays(from, 14)}`} className="text-basil">Later →</Link>
      </div>
      <div className="mb-6 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const n = countOf(d);
          const h = heldOf(d);
          const sel = d === date;
          return (
            <Link
              key={d}
              href={`/admin/schedule?date=${d}&from=${from}`}
              aria-current={sel ? "date" : undefined}
              className={`rounded-xl border p-1.5 text-center text-xs sm:p-2 ${sel ? "border-basil bg-basil text-white" : d === today ? "border-basil bg-white" : "border-line bg-white"} ${d < today && !sel ? "opacity-60" : ""}`}
            >
              <span className="block font-semibold">{DOW[dayOfWeek(d)]}</span>
              <span className="block text-base font-bold sm:text-lg">{Number(d.slice(8))}</span>
              <span className={`block ${sel ? "text-white" : n ? "text-basil-deep" : "text-ink-soft"}`}>{n ? `${n} order${n === 1 ? "" : "s"}` : "—"}</span>
              {h > 0 && <span className={`block font-semibold ${sel ? "text-white" : "text-carrot"}`}>{h} held</span>}
            </Link>
          );
        })}
      </div>

      <h2 className="mb-1 text-2xl font-bold">{formatDateLong(date)}</h2>
      <p className="mb-4 text-sm text-ink-soft">
        {list.length} deliver{list.length === 1 ? "y" : "ies"} · {countOf(date, "PLAN_DAY")} from plans · {countOf(date, "ORDER")} one-off
        {heldOf(date) ? ` · ${heldOf(date)} held for a skip decision` : ""}
      </p>

      {dayAttention.length > 0 && (
        <Card title="Needs attention" className="mb-5 border-carrot">
          <ul className="space-y-1 text-sm">
            {dayAttention.map((a, i) => (
              <li key={i}><Link href={a.link} className="font-semibold text-[#8a4a00] hover:underline">{a.text}</Link></li>
            ))}
          </ul>
        </Card>
      )}

      {list.length === 0 ? <Empty>No deliveries on this day.</Empty> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            {slots.map((slot) => (
              <section key={slot}>
                <h3 className="mb-2 font-bold">{slot} ({list.filter((e) => e.slotName === slot).length})</h3>
                <ul className="space-y-3">
                  {list.filter((e) => e.slotName === slot).map((e) => (
                    <li key={e.orderId} className="rounded-2xl border border-line bg-white p-4 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-bold">
                          {e.customerId ? <Link href={`/admin/customers/${e.customerId}`} className="text-basil hover:underline">{e.customerName}</Link> : e.customerName}
                          <a href={`tel:${e.phone}`} className="ml-2 font-normal text-ink-soft">{e.phone}</a>
                        </p>
                        {e.plan ? (
                          <Link href={`/admin/plans/${e.plan.subscriptionId}`} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.plan.isLast ? "bg-carrot/20 text-[#8a4a00]" : "bg-basil-soft text-basil-deep"}`}>
                            Day {e.plan.dayNo} of {e.plan.entitled}{e.plan.isLast ? " · last" : ""}
                          </Link>
                        ) : (
                          <Link href={`/admin/orders/${e.orderId}`} className="rounded-full bg-crate px-2.5 py-0.5 text-xs font-bold">One-off {e.orderNumber}</Link>
                        )}
                      </div>
                      <p className="mt-1 font-semibold">{e.items}</p>
                      <p className="text-ink-soft">{e.address}</p>
                      {e.note && <p className="text-ink-soft">Note: {e.note}</p>}
                      {e.plan && (
                        <p className="mt-1 text-xs">
                          {e.plan.name} · {e.plan.remainingAfter} left after this ·{" "}
                          <span className={e.plan.payment === "PAID" ? "text-basil" : "font-semibold text-tomato"}>
                            {PAYMENT_STATUS_LABELS[e.plan.payment]}{e.plan.due ? ` (${formatINR(e.plan.due)} due)` : ""}
                          </span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <Card title="To prepare">
            <ul className="space-y-1 text-sm">
              {[...prep.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2"><span>{k}</span><b>{v}</b></li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
