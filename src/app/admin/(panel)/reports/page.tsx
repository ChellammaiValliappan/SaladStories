import { requireAdmin } from "@/lib/auth";
import { and, count, desc, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";
import { db, deliveryAreas, orderItems, orders } from "@/db";
import { formatINR } from "@/lib/money";
import { addDays, istParts } from "@/lib/time";
import { Card, PageHead, Table } from "@/components/admin/ui";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = istParts().dateStr;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : addDays(today, -29);
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T23:59:59+05:30`);
  const paidInRange = and(eq(orders.paymentStatus, "PAID"), gte(orders.createdAt, start), lte(orders.createdAt, end));
  const day = sql<string>`to_char(${orders.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`;

  const [[totals], byDay, topProducts, byCoupon, byArea] = await Promise.all([
    db.select({ n: count(), revenue: sum(orders.total), discount: sum(orders.discount), delivery: sum(orders.deliveryFee), tax: sum(orders.tax) }).from(orders).where(paidInRange),
    db.select({ day, n: count(), revenue: sum(orders.total) }).from(orders).where(paidInRange).groupBy(day).orderBy(day),
    db.select({ name: orderItems.name, qty: sum(orderItems.quantity), revenue: sum(orderItems.lineTotal) }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(paidInRange).groupBy(orderItems.name).orderBy(desc(sum(orderItems.quantity))),
    db.select({ code: orders.couponCode, n: count(), discount: sum(orders.discount) }).from(orders).where(and(paidInRange, isNotNull(orders.couponCode))).groupBy(orders.couponCode).orderBy(desc(count())),
    db.select({ area: deliveryAreas.name, n: count(), revenue: sum(orders.total) }).from(orders).leftJoin(deliveryAreas, eq(orders.areaId, deliveryAreas.id)).where(paidInRange).groupBy(deliveryAreas.name).orderBy(desc(count())),
  ]);
  const n = Number(totals.n);
  const revenue = Number(totals.revenue ?? 0);
  const maxDay = Math.max(1, ...byDay.map((d) => Number(d.revenue ?? 0)));

  const tiles = [
    { label: "Paid orders", value: String(n) },
    { label: "Revenue", value: formatINR(revenue) },
    { label: "Average order", value: formatINR(n ? Math.round(revenue / n) : 0) },
    { label: "Discounts given", value: formatINR(Number(totals.discount ?? 0)) },
  ];

  return (
    <>
      <PageHead title="Sales reports" />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} className="field" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} className="field" /></div>
        <button className="btn btn-primary">Show</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm font-semibold text-ink-soft">{t.label}</p>
            <p className="mt-1 font-display text-3xl font-[800]">{t.value}</p>
          </div>
        ))}
      </div>
      <Card title="Revenue by day" className="mt-6">
        {byDay.length === 0 ? <p className="text-ink-soft">No paid orders in this period.</p> : (
          <div className="flex h-48 items-end gap-1 overflow-x-auto">
            {byDay.map((d) => (
              <div key={d.day} className="flex min-w-6 flex-1 flex-col items-center gap-1" title={`${d.day}: ${formatINR(Number(d.revenue ?? 0))} from ${d.n} orders`}>
                <div className="w-full rounded-t-md bg-basil" style={{ height: `${(Number(d.revenue ?? 0) / maxDay) * 160}px` }} />
                <span className="text-[10px] text-ink-soft">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <h2 className="mb-3 text-lg font-bold">Best sellers</h2>
          <Table head={["Item", "Sold", "Revenue"]}>
            {topProducts.map((p) => <tr key={p.name}><td className="px-4 py-2.5 font-semibold">{p.name}</td><td className="px-4 py-2.5">{p.qty}</td><td className="px-4 py-2.5">{formatINR(Number(p.revenue ?? 0))}</td></tr>)}
          </Table>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold">By area</h2>
          <Table head={["Area", "Orders", "Revenue"]}>
            {byArea.map((a) => <tr key={a.area ?? "none"}><td className="px-4 py-2.5 font-semibold">{a.area ?? "Unknown"}</td><td className="px-4 py-2.5">{a.n}</td><td className="px-4 py-2.5">{formatINR(Number(a.revenue ?? 0))}</td></tr>)}
          </Table>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold">Coupons used</h2>
          <Table head={["Code", "Orders", "Discount"]}>
            {byCoupon.map((c) => <tr key={c.code}><td className="px-4 py-2.5 font-semibold">{c.code}</td><td className="px-4 py-2.5">{c.n}</td><td className="px-4 py-2.5">{formatINR(Number(c.discount ?? 0))}</td></tr>)}
          </Table>
        </div>
      </div>
    </>
  );
}
