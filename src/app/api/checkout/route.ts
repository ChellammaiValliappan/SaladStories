import { getCurrentUser } from "@/lib/auth";
import { checkoutSchema, CheckoutError, createOrder } from "@/lib/orders";
import { clientIp, fail, ok, rateLimit, zodMessage } from "@/lib/http";

export async function POST(req: Request) {
  if (!rateLimit(`checkout:${clientIp(req)}`, 15, 60_000)) return fail("Too many attempts. Please wait a minute.", 429);
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodMessage(parsed.error));
  try {
    const user = await getCurrentUser();
    return ok(await createOrder(parsed.data, user?.id ?? null));
  } catch (err) {
    if (err instanceof CheckoutError) return fail(err.message, 409);
    console.error("[checkout failed]", err);
    return fail("Something went wrong while placing your order. Please try again.", 500);
  }
}
