import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { MessageCircle, Phone } from "lucide-react";
import { db, orderEvents, orders } from "@/db";
import { formatINR } from "@/lib/money";
import { addressLine, STATUS_LABELS } from "@/lib/notify";
import { whatsappLink } from "@/lib/settings";
import { confirmUpi, rejectUpi, refundOrder, updateOrderStatus } from "../../../actions";
import { getCurrentUser } from "@/lib/auth";
import { Badge, Card, PageHead, orderBadge } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

const NEXT: Record<string, { status: string; label: string }> = {
  PAID: { status: "PREPARING", label: "Start preparing" },
  PREPARING: { status: "OUT_FOR_DELIVERY", label: "Mark out for delivery" },
  OUT_FOR_DELIVERY: { status: "DELIVERED", label: "Mark delivered" },
};

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id), with: { items: true } });
  if (!order) notFound();
  const me = await getCurrentUser();
  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.createdAt));
  const fulfilable = order.paymentStatus === "PAID" || order.paymentStatus === "PLAN";
  const next = fulfilable ? NEXT[order.status] : undefined;
  const wa = whatsappLink(
    order.phone.length === 10 ? `91${order.phone}` : order.phone,
    `Hi ${order.customerName.split(" ")[0]}, this is Salad Stories about your order ${order.orderNumber}.`,
  );

  return (
    <>
      <PageHead title={`Order ${order.orderNumber}`} back={{ href: "/admin/orders", label: "Orders" }}>
        <Badge value={orderBadge(order)} />
      </PageHead>
      {order.subscriptionId && (
        <Link href={`/admin/plans/${order.subscriptionId}`} className="mb-5 flex items-center justify-between gap-3 rounded-2xl border-2 border-mango bg-white p-4 font-semibold">
          <span>{order.kind === "PLAN" ? "Payment for a meal plan — the bowls are separate daily orders." : "One day of a meal plan (already paid)."}</span>
          <span className="shrink-0 text-basil">Open plan →</span>
        </Link>
      )}
      <Flash msg={sp.msg} err={sp.err} />
      {order.paymentStatus === "VERIFYING" && order.status !== "CANCELLED" && (
        <section className="mb-6 rounded-2xl border-2 border-carrot bg-white p-5">
          <h2 className="text-xl font-bold">Check this Google Pay payment</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Open Google Pay (or your bank app) on the phone linked to your UPI ID and look for this payment. Only confirm it once you can see the money.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-crate p-3"><dt className="text-xs font-semibold text-ink-soft">Amount</dt><dd className="font-display text-2xl font-[800]">{formatINR(order.total)}</dd></div>
            <div className="rounded-xl bg-crate p-3"><dt className="text-xs font-semibold text-ink-soft">UPI transaction ID</dt><dd className="font-display text-2xl font-[800] tracking-wider">{order.upiRef}</dd></div>
            <div className="rounded-xl bg-crate p-3"><dt className="text-xs font-semibold text-ink-soft">From</dt><dd className="font-semibold">{order.customerName}<br /><span className="text-sm font-normal">{order.phone}</span></dd></div>
          </dl>
          {me?.role === "ADMIN" ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={confirmUpi}>
                <input type="hidden" name="orderId" value={order.id} />
                <SubmitButton className="btn btn-primary" pendingText="Confirming…">Payment received — confirm order</SubmitButton>
              </form>
              <form action={rejectUpi} className="flex flex-wrap gap-2">
                <input type="hidden" name="orderId" value={order.id} />
                <input name="reason" className="field min-h-12 w-64" placeholder="Reason (optional)" />
                <SubmitButton className="btn btn-ghost text-tomato" confirm="Mark this payment as not received? The customer will be emailed and asked to pay again." pendingText="Saving…">Not received</SubmitButton>
              </form>
            </div>
          ) : (
            <p className="mt-4 text-sm font-semibold">Ask an admin to confirm this payment.</p>
          )}
        </section>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Items">
            <ul className="divide-y divide-line">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-3">
                  <div>
                    <p className="text-lg font-bold">{i.quantity} × {i.name}</p>
                    {i.summary && <p className="text-ink-soft">{i.summary}</p>}
                  </div>
                  <p className="font-semibold">{formatINR(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(order.subtotal)}</dd></div>
              {order.discount > 0 && <div className="flex justify-between"><dt>Discount {order.couponCode && `(${order.couponCode})`}</dt><dd>−{formatINR(order.discount)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>{formatINR(order.deliveryFee)}</dd></div>
              <div className="flex justify-between"><dt>Tax</dt><dd>{formatINR(order.tax)}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
            </dl>
          </Card>
          <Card title="History">
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-ink-soft">{new Date(e.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  <span><span className="font-semibold">{STATUS_LABELS[e.status] ?? e.status.replace(/_/g, " ").toLowerCase()}</span>{e.note && ` — ${e.note}`}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Update status">
            {next ? (
              <form action={updateOrderStatus} className="space-y-3">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value={next.status} />
                <input name="note" className="field" placeholder="Note (optional)" />
                <SubmitButton className="btn btn-primary w-full">{next.label}</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-ink-soft">
                {order.kind === "PLAN" ? "This is a plan payment — its daily bowls appear as separate orders." : !fulfilable ? "This order hasn't been paid, so it can't be prepared yet." : "Nothing more to do for this order."}
              </p>
            )}
            {order.status !== "CANCELLED" && order.status !== "DELIVERED" && (
              <form action={updateOrderStatus} className="mt-3">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value="CANCELLED" />
                <SubmitButton className="btn btn-ghost w-full text-tomato" confirm="Cancel this order? The customer will be emailed. Use Refund below to return their money.">Cancel order</SubmitButton>
              </form>
            )}
          </Card>
          <Card title="Customer">
            <p className="font-bold">{order.customerName}</p>
            <p className="text-sm text-ink-soft">{order.phone} · {order.email}</p>
            <p className="mt-3 text-sm">{addressLine(order.address)}</p>
            {order.address.instructions && <p className="mt-2 rounded-lg bg-mango/20 p-2 text-sm">Note: {order.address.instructions}</p>}
            <p className="mt-3 text-sm font-semibold">{order.slotLabel}</p>
            <div className="mt-4 flex gap-2">
              <a href={`tel:${order.phone}`} className="btn btn-ghost min-h-10 flex-1 text-sm"><Phone className="h-4 w-4" /> Call</a>
              {wa && <a href={wa} target="_blank" rel="noopener" className="btn btn-sprout min-h-10 flex-1 text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
            </div>
            <Link href={`/order/${order.orderNumber}?t=${order.trackingToken}`} target="_blank" className="mt-3 block text-sm font-semibold text-basil underline">Customer's tracking page</Link>
          </Card>
          <Card title="Payment">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>Status</dt><dd><Badge value={order.paymentStatus === "CREATED" ? "PENDING_PAYMENT" : order.paymentStatus} /></dd></div>
              {order.paymentMethod && <div className="flex justify-between"><dt>Method</dt><dd>{order.paymentMethod}</dd></div>}
              {order.razorpayOrderId && <div className="flex justify-between gap-2"><dt>Razorpay order</dt><dd className="truncate">{order.razorpayOrderId}</dd></div>}
              {order.razorpayPaymentId && <div className="flex justify-between gap-2"><dt>Payment ID</dt><dd className="truncate">{order.razorpayPaymentId}</dd></div>}
              {order.upiRef && <div className="flex justify-between gap-2"><dt>UPI transaction ID</dt><dd>{order.upiRef}</dd></div>}
            </dl>
            {order.paymentStatus === "PAID" && me?.role === "ADMIN" && (
              <form action={refundOrder} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="orderId" value={order.id} />
                {order.upiRef && <p className="text-xs text-ink-soft">Paid by Google Pay: send the refund to the customer from your Google Pay app first, then record it here.</p>}
                <label className="label" htmlFor="amount">Refund amount (₹)</label>
                <input id="amount" name="amount" type="number" step="0.01" min="1" max={order.total / 100} defaultValue={order.total / 100} className="field" />
                <SubmitButton className="btn btn-ghost w-full text-beet" confirm="Send this refund through Razorpay? This can't be undone." pendingText="Refunding…">Refund</SubmitButton>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
