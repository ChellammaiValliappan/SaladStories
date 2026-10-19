import { getCurrentUser } from "@/lib/auth";
import { CheckoutError } from "@/lib/orders";
import { buyPlan, planBuySchema } from "@/lib/plans";
import { clientIp, fail, ok, rateLimit, zodMessage } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`plancheckout:${clientIp(req)}`, 10, 60_000)) return fail("Too many attempts. Please wait a minute.", 429);
  const user = await getCurrentUser();
  if (!user) return fail("Please log in to buy a plan, so you can manage your days later.", 401);
  const parsed = planBuySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodMessage(parsed.error));
  try {
    return ok(await buyPlan(parsed.data, user.id));
  } catch (err) {
    if (err instanceof CheckoutError) return fail(err.message, 409);
    console.error("[plan checkout failed]", err);
    return fail("Something went wrong while starting your plan. Please try again.", 500);
  }
}
