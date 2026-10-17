import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, deliverySlots, orders } from "@/db";
import { requireStaff } from "@/lib/auth";
import { addDays, formatDateLong, formatTime, istParts } from "@/lib/time";
import { addressLine, STATUS_LABELS } from "@/lib/notify";
import { PageHead } from "@/components/admin/ui";
import { PrintButton } from "@/components/admin/PrintButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { markSlotPreparing } from "../../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Kitchen sheet" };

const KITCHEN_STATUSES = ["PAID", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"];

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const today = istParts().dateStr;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const [slots, dayOrders] = await Promise.all([
    db.select().from(deliverySlots).orderBy(asc(deliverySlots.sortOrder), asc(deliverySlots.startTime)),
    db.query.orders.findMany({
      where: and(eq(orders.deliveryDate, date), inArray(orders.status, KITCHEN_STATUSES)),
      with: { items: true },
      orderBy: asc(orders.createdAt),
    }),
  ]);

  // Group by slot (orders whose slot was later deleted fall into "Other")
  const groups = [
    ...slots.map((s) => ({ id: s.id, title: `${s.name} · ${formatTime(s.startTime)}–${formatTime(s.endTime)}`, orders: dayOrders.filter((o) => o.slotId === s.id) })),
    { id: "other", title: "Other", orders: dayOrders.filter((o) => !o.slotId || !slots.some((s) => s.id === o.slotId)) },
  ].filter((g) => g.orders.length > 0);

  const dayChips = [0, 1, 2].map((n) => addDays(today, n));

  return (
    <>
      <div className="print:hidden">
        <PageHead title="Kitchen sheet">
          <PrintButton />
        </PageHead>
        <AutoRefresh seconds={60} forMinutes={600} />
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {dayChips.map((d, i) => (
            <Link key={d} href={`/admin/kitchen?date=${d}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${d === date ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>
              {i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDateLong(d)}
            </Link>
          ))}
          <form className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={date} className="field min-h-10 w-auto py-1.5 text-sm" aria-label="Pick a date" />
            <button className="btn btn-ghost min-h-10 px-4 text-sm">Show</button>
          </form>
        </div>
      </div>

      <h2 className="mb-4 hidden text-2xl font-bold print:block">Salad Stories — kitchen sheet for {formatDateLong(date)}</h2>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-ink-soft">
          No paid orders for {date === today ? "today" : formatDateLong(date)} yet.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            // Totals: same bowl + same customization counted together
            const totals = new Map<string, { name: string; summary: string; qty: number }>();
            for (const o of g.orders)
              for (const it of o.items) {
                const key = `${it.name}|${it.summary}`;
                const t = totals.get(key) ?? { name: it.name, summary: it.summary, qty: 0 };
                t.qty += it.quantity;
                totals.set(key, t);
              }
            const rows = [...totals.values()].sort((a, b) => a.name.localeCompare(b.name) || b.qty - a.qty);
            const bowls = rows.reduce((s, r) => s + r.qty, 0);
            const toStart = g.orders.filter((o) => o.status === "PAID").length;

            return (
              <section key={g.id} className="break-inside-avoid rounded-2xl border border-line bg-white p-5 print:border-ink print:p-3">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{g.title}</h2>
                    <p className="text-sm text-ink-soft">{g.orders.length} order{g.orders.length === 1 ? "" : "s"} · {bowls} bowl{bowls === 1 ? "" : "s"}</p>
                  </div>
                  {toStart > 0 && g.id !== "other" && (
                    <form action={markSlotPreparing} className="print:hidden">
                      <input type="hidden" name="date" value={date} />
                      <input type="hidden" name="slotId" value={g.id} />
                      <SubmitButton className="btn btn-primary min-h-10 px-4 text-sm" confirm={`Mark ${toStart} new order(s) as "Being prepared"? Customers get an email.`} pendingText="Updating…">
                        Start preparing all {toStart} new
                      </SubmitButton>
                    </form>
                  )}
                </div>

                <h3 className="mb-2 font-bold">What to make</h3>
                <table className="mb-5 w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={`${r.name}|${r.summary}`}>
                        <td className="w-14 py-2 pr-3 align-top font-display text-2xl font-[800]">{r.qty}×</td>
                        <td className="py-2">
                          <p className="font-semibold">{r.name}</p>
                          {r.summary && <p className="text-ink-soft">{r.summary}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="mb-2 font-bold">Packing and delivery</h3>
                <ol className="space-y-3">
                  {g.orders.map((o) => (
                    <li key={o.id} className="break-inside-avoid rounded-xl border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/admin/orders/${o.id}`} className="font-bold text-basil hover:underline print:text-ink">{o.orderNumber}</Link>
                        <span className="text-xs font-semibold text-ink-soft">{STATUS_LABELS[o.status] ?? o.status}</span>
                      </div>
                      <p className="font-semibold">{o.customerName} · {o.phone}</p>
                      <p className="text-ink-soft">{addressLine(o.address)}</p>
                      {o.address.instructions && <p className="mt-1 rounded bg-mango/20 px-2 py-1">Note: {o.address.instructions}</p>}
                      <ul className="mt-2 list-disc pl-5">
                        {o.items.map((it) => (
                          <li key={it.id}>{it.quantity} × {it.name}{it.summary ? ` — ${it.summary}` : ""}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
