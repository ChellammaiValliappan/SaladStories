import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, pushSubscriptions } from "@/db";
import { getCurrentUser, isTeam } from "@/lib/auth";
import { pushToTeam } from "@/lib/push";

export const dynamic = "force-dynamic";

const Sub = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  device: z.string().max(80).optional(),
  test: z.boolean().optional(),
});

async function teamUser() {
  const u = await getCurrentUser();
  return u && isTeam(u.role) ? u : null;
}

/** Turn on notifications for this device (and optionally send a test). */
export async function POST(req: Request) {
  const user = await teamUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "This browser sent an unexpected subscription." }, { status: 400 });
  const { endpoint, keys, device = "", test } = parsed.data;
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, device } });
  let sent = 0;
  if (test) sent = await pushToTeam({ title: "Notifications are on ✅", body: "You'll get a notification here for every new order and payment to check.", url: "/admin", tag: "test" }, user.id);
  return Response.json({ ok: true, sent });
}

/** Turn off notifications for this device. */
export async function DELETE(req: Request) {
  const user = await teamUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  return Response.json({ ok: true });
}
