import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db, orders } from "@/db";
import { formatINR } from "@/lib/money";
import { istParts } from "@/lib/time";
import { Badge, Empty, PageHead, Table } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/AutoRefresh";

export const metadata = { title: "Orders" };

const FILTERS = [
  { id: "open", label: "To prepare", where: inArray(orders.status, ["PAID", "PREPARING", "OUT_FOR_DELIVERY"]) },
  { id: "today", label: "Delivering today", where: undefined },
  { id: "all", label: "All", where: undefined },
  { id: "delivered", label: "Delivered", where: eq(orders.status, "DELIVERED") },
  { id: "pending", label: "Awaiting payment", where: eq(orders.status, "PENDING_PAYMENT") },
  { id: "cancelled", label: "Cancelled", where: eq(orders.status, "CANCELLED") },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "open", q = "" } = await searchParams;
  const f = FILTERS.find((x) => x.id === status) ?? FILTERS[0];
  const conds: (SQL | undefined)[] = [f.id === "today" ? and(eq(orders.deliveryDate, istParts().dateStr), eq(orders.paymentStatus, "PAID")) : f.where];
  if (q.trim()) {
    const like = `%${q.trim()}%`;
    conds.push(or(ilike(orders.orderNumber, like), ilike(orders.customerName, like), ilike(orders.phone, like), ilike(orders.email, like)));
  }
  const rows = await db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(200);

  return (
    <>
      <PageHead title="Orders" />
      <AutoRefresh seconds={30} forMinutes={600} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <Link key={x.id} href={`/admin/orders?status=${x.id}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${x.id === f.id ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>
            {x.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="status" value={f.id} />
          <input name="q" defaultValue={q} placeholder="Search name, phone, order no." className="field min-h-10 w-64 py-2 text-sm" />
        </form>
      </div>
      {rows.length === 0 ? (
        <Empty>No orders here right now.</Empty>
      ) : (
        <>
        <ul className="space-y-2 sm:hidden">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="block rounded-2xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-basil">{o.orderNumber}</p>
                  <Badge value={o.paymentStatus === "PAID" || o.status === "CANCELLED" ? o.status : o.paymentStatus === "FAILED" ? "FAILED" : "PENDING_PAYMENT"} />
                </div>
                <p className="mt-1 font-semibold">{o.customerName} · {formatINR(o.total)}</p>
                <p className="text-sm text-ink-soft">{o.slotLabel}</p>
                <p className="text-sm text-ink-soft">{o.address.area} {o.pincode}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
        <Table head={["Order", "Customer", "Delivery", "Total", "Status"]}>
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-paper">
              <td className="px-4 py-3 font-bold"><Link href={`/admin/orders/${o.id}`} className="text-basil hover:underline">{o.orderNumber}</Link></td>
              <td className="px-4 py-3">{o.customerName}<br /><span className="text-ink-soft">{o.phone}</span></td>
              <td className="px-4 py-3">{o.slotLabel}<br /><span className="text-ink-soft">{o.address.area} {o.pincode}</span></td>
              <td className="px-4 py-3 font-semibold">{formatINR(o.total)}</td>
              <td className="px-4 py-3"><Badge value={o.paymentStatus === "PAID" || o.status === "CANCELLED" ? o.status : o.paymentStatus === "FAILED" ? "FAILED" : "PENDING_PAYMENT"} /></td>
            </tr>
          ))}
        </Table>
        </div>
        </>
      )}
    </>
  );
}
