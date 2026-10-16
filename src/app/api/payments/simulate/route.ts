import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, orders } from "@/db";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
import { simulatorEnabled } from "@/lib/razorpay";
import { fail, ok } from "@/lib/http";

const body = z.object({ orderId: z.string(), trackingToken: z.string(), outcome: z.enum(["success", "failure"]) });

/** Local development only: lets you try the full flow before adding Razorpay keys. */
export async function POST(req: Request) {
  if (!simulatorEnabled()) return fail("Not available", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request");
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, parsed.data.orderId), eq(orders.trackingToken, parsed.data.trackingToken)));
  if (!order) return fail("Order not found", 404);
  if (parsed.data.outcome === "failure") {
    await markPaymentFailed(order.id, "Simulated payment failure");
    return ok({ paid: false });
  }
  await markOrderPaid(order.id, { paymentId: `sim_${Date.now()}`, method: "simulated" });
  return ok({ paid: true, orderNumber: order.orderNumber, trackingToken: order.trackingToken });
}
