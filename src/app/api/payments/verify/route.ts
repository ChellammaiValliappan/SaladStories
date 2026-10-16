import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { markOrderPaid } from "@/lib/orders";
import { razorpay, razorpayConfigured, verifyCheckoutSignature } from "@/lib/razorpay";
import { fail, ok } from "@/lib/http";

const body = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

/** Called by the browser after Razorpay Checkout succeeds (BRD §10.1). */
export async function POST(req: Request) {
  if (!razorpayConfigured()) return fail("Payments are not configured", 503);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid payment response");
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  // 1. Signature proves the response really came from Razorpay.
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))
    return fail("We couldn't verify this payment. If money was deducted, it will be refunded automatically.", 400);

  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpay_order_id));
  if (!order) return fail("Order not found", 404);

  // 2. Ask Razorpay directly for the payment status and amount.
  let payment = await razorpay().payments.fetch(razorpay_payment_id);
  if (payment.order_id !== razorpay_order_id || Number(payment.amount) !== order.total)
    return fail("Payment details don't match this order. Please contact us.", 400);
  if (payment.status === "authorized") {
    payment = await razorpay().payments.capture(razorpay_payment_id, order.total, "INR");
  }
  if (payment.status !== "captured") return ok({ paid: false, status: payment.status });

  // 3. Only now is the order marked Paid (idempotent with the webhook).
  await markOrderPaid(order.id, { paymentId: razorpay_payment_id, method: String(payment.method ?? "") });
  return ok({ paid: true, orderNumber: order.orderNumber, trackingToken: order.trackingToken });
}
