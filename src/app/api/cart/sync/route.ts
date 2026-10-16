import { z } from "zod";
import { eq } from "drizzle-orm";
import { carts, db } from "@/db";
import { getSession } from "@/lib/auth";
import { cartItemSchema, quoteCart } from "@/lib/pricing";
import { fail, ok } from "@/lib/http";

const body = z.object({ items: z.array(cartItemSchema).max(40), merge: z.boolean().default(false) });

/**
 * Logged-in carts live on the account (BRD §6.3).
 * merge=true (right after login): guest cart + saved cart, deduplicated and re-validated.
 * merge=false: replace the saved cart with the current one.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return fail("Not signed in", 401);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid cart");

  let items = parsed.data.items;
  if (parsed.data.merge) {
    const [saved] = await db.select().from(carts).where(eq(carts.userId, session.uid));
    items = [...(saved?.items ?? []), ...items];
  }
  // quoteCart merges identical lines and flags anything no longer valid.
  const quote = await quoteCart({ items });
  const clean = quote.lines
    .filter((l) => l.slug) // drop products that no longer exist
    .map((l) => ({ productId: l.productId, quantity: Math.min(l.quantity, 20), selections: l.selections }));
  await db
    .insert(carts)
    .values({ userId: session.uid, items: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: carts.userId, set: { items: clean, updatedAt: new Date() } });
  return ok({ lines: quote.lines.filter((l) => l.slug) });
}
