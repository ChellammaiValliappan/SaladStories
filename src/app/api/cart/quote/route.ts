import { quoteCart, quoteSchema } from "@/lib/pricing";
import { clientIp, fail, ok, rateLimit, zodMessage } from "@/lib/http";

export async function POST(req: Request) {
  if (!rateLimit(`quote:${clientIp(req)}`, 120, 60_000)) return fail("Too many requests. Please wait a moment.", 429);
  const parsed = quoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(zodMessage(parsed.error));
  return ok(await quoteCart(parsed.data));
}
