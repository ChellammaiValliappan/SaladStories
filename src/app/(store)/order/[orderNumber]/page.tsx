import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Check, MessageCircle } from "lucide-react";
import { db, orderEvents, orders } from "@/db";
import { getCurrentUser, isTeam } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { STATUS_LABELS, addressLine } from "@/lib/notify";
import { getSettings, whatsappLink } from "@/lib/settings";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ReorderButton } from "@/components/ReorderButton";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

const FLOW = ["PAID", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"];
const FLOW_LABELS: Record<string, string> = { PAID: "Order confirmed", PREPARING: "Being prepared", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ t?: string; new?: string }> }) {
  const { orderNumber } = await params;
  const { t, new: isNew } = await searchParams;
  const order = await db.query.orders.findFirst({ where: eq(orders.orderNumber, orderNumber), with: { items: true } });
  if (!order) notFound();
  const viewer = t && t === order.trackingToken ? null : await getCurrentUser();
  const allowed = (t && t === order.trackingToken) || (viewer && (isTeam(viewer.role) || viewer.id === order.userId));
  if (!allowed) notFound();

  const [events, settings] = await Promise.all([
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.createdAt)),
    getSettings(),
  ]);
  const paid = order.paymentStatus === "PAID";
  const step = FLOW.indexOf(order.status);
  const wa = whatsappLink(settings.whatsapp, `Hi! I have a question about my order ${order.orderNumber}.`);
  const reached = (s: string) => events.find((e) => e.status === s);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      {!paid && order.status !== "CANCELLED" && <AutoRefresh seconds={5} />}
      <div className={`rounded-[2rem] p-6 sm:p-8 ${paid ? "bg-basil text-white" : "bg-crate"}`}>
        {paid ? (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-sprout text-basil-deep"><Check className="h-7 w-7" strokeWidth={3} /></span>
            <h1 className="mt-4 text-4xl font-[800] sm:text-5xl">{isNew ? "Thank you! Your order is confirmed." : STATUS_LABELS[order.status]}</h1>
            <p className="mt-2 text-white/80">Order {order.orderNumber} · {order.slotLabel}</p>
            {isNew && <p className="mt-2 text-white/80">We've emailed a confirmation to {order.email}.</p>}
          </>
        ) : order.status === "CANCELLED" ? (
          <h1 className="text-4xl font-[800]">This order was cancelled</h1>
        ) : (
          <>
            <h1 className="text-4xl font-[800] text-basil-deep">{order.paymentStatus === "FAILED" ? "Payment didn't go through" : "Confirming your payment…"}</h1>
            <p className="mt-2 text-ink-soft">
              {order.paymentStatus === "FAILED"
                ? "No money was taken for this order. You can go back to checkout and try again."
                : "This usually takes a few seconds. This page updates on its own."}
            </p>
            {order.paymentStatus === "FAILED" && <Link href="/checkout" className="btn btn-primary mt-4">Try again</Link>}
          </>
        )}
      </div>

      {paid && order.status !== "CANCELLED" && (
        <ol className="mt-8 space-y-0" aria-label="Order progress">
          {FLOW.map((s, i) => {
            const done = i <= step;
            const ev = reached(s);
            return (
              <li key={s} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className={`grid h-8 w-8 place-items-center rounded-full border-2 ${done ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>
                    {done && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                  {i < FLOW.length - 1 && <span className={`h-10 w-0.5 ${i < step ? "bg-basil" : "bg-line"}`} />}
                </div>
                <div className="pt-1">
                  <p className={`font-bold ${done ? "" : "text-ink-soft"}`}>{FLOW_LABELS[s]}</p>
                  {ev && <p className="text-sm text-ink-soft">{new Date(ev.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="panel mt-8 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Order details</h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{i.quantity} × {i.name}</p>
                {i.summary && <p className="text-sm text-ink-soft">{i.summary}</p>}
              </div>
              <p className="font-semibold">{formatINR(i.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <Row k="Subtotal" v={formatINR(order.subtotal)} />
          {order.discount > 0 && <Row k={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} v={`−${formatINR(order.discount)}`} />}
          <Row k="Delivery" v={order.deliveryFee ? formatINR(order.deliveryFee) : "Free"} />
          {order.tax > 0 && <Row k="Tax" v={formatINR(order.tax)} />}
          <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
          <Row k="Payment" v={paid ? `Paid${order.paymentMethod ? ` (${order.paymentMethod})` : ""}` : order.paymentStatus === "FAILED" ? "Failed" : "Pending"} />
        </dl>
        <div className="mt-4 rounded-2xl bg-crate p-4 text-sm">
          <p className="font-semibold">Delivering to {order.customerName}</p>
          <p className="text-ink-soft">{addressLine(order.address)}</p>
          {order.address.instructions && <p className="mt-1 text-ink-soft">Note: {order.address.instructions}</p>}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {wa && (
          <a href={wa} target="_blank" rel="noopener" className="btn btn-ghost"><MessageCircle className="h-4 w-4" /> Questions? WhatsApp us</a>
        )}
        <ReorderButton items={order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, selections: i.selections }))} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
