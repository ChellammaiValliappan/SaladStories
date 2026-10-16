import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession, hashPassword } from "@/lib/auth";
import { clientIp, fail, ok, rateLimit } from "@/lib/http";

const body = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters for your password").max(200),
});

export async function POST(req: Request) {
  if (!rateLimit(`register:${clientIp(req)}`, 5, 10 * 60_000)) return fail("Too many attempts. Try again later.", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { name, email, phone, password } = parsed.data;
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return fail("An account with this email already exists. Sign in instead.", 409);
  const [user] = await db
    .insert(users)
    .values({ name, email, phone: phone || null, passwordHash: await hashPassword(password) })
    .returning();
  await createSession({ uid: user.id, role: "CUSTOMER" });
  return ok({ name: user.name });
}
