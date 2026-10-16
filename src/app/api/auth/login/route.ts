import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { clientIp, fail, ok, rateLimit } from "@/lib/http";

const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!rateLimit(`login:${clientIp(req)}`, 10, 10 * 60_000)) return fail("Too many attempts. Try again in a few minutes.", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Enter your email and password.");
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (!user?.passwordHash || user.isBlocked || !(await verifyPassword(parsed.data.password, user.passwordHash)))
    return fail("That email and password don't match.", 401);
  await createSession({ uid: user.id, role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER" });
  return ok({ role: user.role, name: user.name });
}
