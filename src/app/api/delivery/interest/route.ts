import { z } from "zod";
import { db, deliveryInterests } from "@/db";
import { clientIp, fail, ok, rateLimit } from "@/lib/http";

const body = z.object({
  name: z.string().trim().max(80).default(""),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
});

export async function POST(req: Request) {
  if (!rateLimit(`interest:${clientIp(req)}`, 5, 60_000)) return fail("Too many requests", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  await db.insert(deliveryInterests).values(parsed.data);
  return ok({ saved: true });
}
