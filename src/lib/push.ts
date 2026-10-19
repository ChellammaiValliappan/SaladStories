import "server-only";
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, pushSubscriptions, users } from "@/db";

/**
 * Free phone notifications sent by the site itself (Web Push).
 * Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate once with `npx web-push generate-vapid-keys`).
 */
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready || !pushConfigured()) return pushConfigured();
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || "owner@example.com"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
  return true;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Sends to every team member's devices (or only one user's). Returns how many devices got it. */
export async function pushToTeam(msg: PushMessage, onlyUserId?: string) {
  if (!setup()) return 0;
  const team = onlyUserId
    ? [{ id: onlyUserId }]
    : await db.select({ id: users.id }).from(users).where(inArray(users.role, ["ADMIN", "STAFF"]));
  if (!team.length) return 0;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, team.map((u) => u.id)));
  const payload = JSON.stringify(msg);
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 6,
          urgency: "high",
          topic: msg.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "-"),
        });
        return true;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // The phone unsubscribed or the browser data was cleared — forget this device.
        if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        else console.error("[push failed]", code, (err as Error).message);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
