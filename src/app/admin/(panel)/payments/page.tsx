import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { desc, ne } from "drizzle-orm";
import { db, orders } from "@/db";
import { formatINR } from "@/lib/money";
import { razorpayConfigured } from "@/lib/razorpay";
import { Badge, Empty, PageHead, Table } from "@/components/admin/ui";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  await requireAdmin();
  const rows = await db.select().from(orders).where(ne(orders.paymentStatus, "CREATED")).orderBy(desc(orders.updatedAt)).limit(200);
  return (
    <>
      <PageHead title="Payments">
        <a href="https://dashboard.razorpay.com/app/payments" target="_blank" rel="noopener" className="btn btn-ghost min-h-11 text-sm">Open Razorpay dashboard</a>
      </PageHead>
      <p className="mb-5 text-sm text-ink-soft">Google Pay payments show the UPI transaction ID the customer entered. Razorpay payments show the Razorpay payment ID.</p>
      {rows.length === 0 ? (
        <Empty>No payments yet.</Empty>
      ) : (
        <Table head={["Order", "Customer", "Amount", "Method", "Payment reference", "Status", "Updated"]}>
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3 font-bold"><Link href={`/admin/orders/${o.id}`} className="text-basil hover:underline">{o.orderNumber}</Link></td>
              <td className="px-4 py-3">{o.customerName}</td>
              <td className="px-4 py-3 font-semibold">{formatINR(o.total)}</td>
              <td className="px-4 py-3">{o.paymentMethod ?? "—"}</td>
              <td className="px-4 py-3 text-xs text-ink-soft">{o.razorpayPaymentId ?? o.upiRef ?? o.razorpayOrderId ?? "—"}</td>
              <td className="px-4 py-3"><Badge value={o.paymentStatus} /></td>
              <td className="px-4 py-3 text-ink-soft">{new Date(o.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
