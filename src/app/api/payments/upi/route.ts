import { z } from "zod";
import { CheckoutError, submitUpiPayment } from "@/lib/orders";
import { clientIp, fail, ok, rateLimit } from "@/lib/http";

const body = z.object({ orderId: z.string().min(1), trackingToken: z.string().min(1), utr: z.string().max(30) });

/** Customer has paid by Google Pay / UPI and enters the transaction ID. */
export async function POST(req: Request) {
  if (!rateLimit(`upi:${clientIp(req)}`, 10, 10 * 60_000)) return fail("Too many attempts. Please wait a few minutes.", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Enter the 12-digit UPI transaction ID.");
  try {
    const order = await submitUpiPayment(parsed.data.orderId, parsed.data.trackingToken, parsed.data.utr);
    return ok({ status: order.paymentStatus });
  } catch (err) {
    if (err instanceof CheckoutError) return fail(err.message, 409);
    console.error("[upi submit failed]", err);
    return fail("Something went wrong. Please try again.", 500);
  }
}
