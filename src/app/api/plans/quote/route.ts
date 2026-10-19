import { CheckoutError } from "@/lib/orders";
import { planQuoteSchema, quotePlan } from "@/lib/plans";
import { clientIp, fail, ok, rateLimit, zodMessage } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Live price and delivery dates for the plan builder (all prices from the database). */
export async function POST(req: Request) {
  if (!rateLimit(`planquote:${clientIp(req)}`, 120, 60_000)) return fail("Too many requests. Please wait a moment.", 429);
  const parsed = planQuoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodMessage(parsed.error));
  try {
    return ok(await quotePlan(parsed.data));
  } catch (err) {
    if (err instanceof CheckoutError) return fail(err.message, 409);
    console.error("[plan quote failed]", err);
    return fail("Couldn't price this plan. Please try again.", 500);
  }
}
