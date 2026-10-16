import { eq } from "drizzle-orm";
import { db, orders, webhookEvents } from "@/db";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/razorpay";

/**
 * Razorpay webhook (Dashboard → Webhooks). Subscribe to:
 *   payment.captured, payment.failed, order.paid
 * This is the reliable confirmation path even if the customer closes the tab.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(raw) as {
    event: string;
    payload: { payment?: { entity: { id: string; order_id: string; amount: number; status: string; method?: string; error_description?: string } } };
  };
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${event.event}:${event.payload.payment?.entity.id}`;

  // Ignore duplicates — Razorpay may deliver the same event more than once.
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: eventId, type: event.event, payload: event })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!inserted.length) return new Response("ok");

  const payment = event.payload.payment?.entity;
  if (!payment) return new Response("ok");
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, payment.order_id));
  if (!order) return new Response("ok");

  if ((event.event === "payment.captured" || event.event === "order.paid") && payment.amount === order.total) {
    await markOrderPaid(order.id, { paymentId: payment.id, method: payment.method ?? null });
  } else if (event.event === "payment.failed") {
    await markPaymentFailed(order.id, payment.error_description);
  }
  return new Response("ok");
}
