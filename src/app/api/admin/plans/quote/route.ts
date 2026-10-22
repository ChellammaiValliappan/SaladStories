import { getCurrentUser, isTeam } from "@/lib/auth";
import { CheckoutError } from "@/lib/orders";
import { planQuoteSchema, quotePlan } from "@/lib/plans";
import { fail, ok, zodMessage } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Admin "New plan" preview: dates and price for any delivery weekdays. */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !isTeam(u.role)) return fail("Please log in again.", 401);
  const parsed = planQuoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodMessage(parsed.error));
  try {
    return ok(await quotePlan(parsed.data, { team: true }));
  } catch (err) {
    if (err instanceof CheckoutError) return fail(err.message, 409);
    console.error("[admin plan quote]", err);
    return fail("Couldn't work out this plan.", 500);
  }
}
