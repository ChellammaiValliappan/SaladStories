import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { clientIp, fail, ok, rateLimit } from "@/lib/http";

const body = z.object({ current: z.string().min(1), next: z.string().min(8, "Use at least 8 characters for the new password").max(200) });

export async function POST(req: Request) {
  if (!rateLimit(`pw:${clientIp(req)}`, 5, 10 * 60_000)) return fail("Too many attempts. Try again later.", 429);
  const user = await getCurrentUser();
  if (!user?.passwordHash) return fail("Please sign in again.", 401);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return fail("Your current password isn't right.", 400);
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.next) }).where(eq(users.id, user.id));
  return ok({ changed: true });
}
