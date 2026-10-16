import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { markPaymentFailed } from "@/lib/orders";
import { razorpay, razorpayConfigured } from "@/lib/razorpay";
import { fail, ok } from "@/lib/http";

const body = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string().optional(), reason: z.string().max(300).optional() });

/** Browser reports a failed attempt; we confirm with Razorpay before recording it. */
export async function POST(req: Request) {
  if (!razorpayConfigured()) return fail("Payments are not configured", 503);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.razorpay_payment_id) return ok({ recorded: false });
  const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, parsed.data.razorpay_order_id));
  if (!order) return ok({ recorded: false });
  const payment = await razorpay().payments.fetch(parsed.data.razorpay_payment_id);
  if (payment.order_id === order.razorpayOrderId && payment.status === "failed") {
    await markPaymentFailed(order.id, payment.error_description || parsed.data.reason);
    return ok({ recorded: true });
  }
  return ok({ recorded: false });
}
