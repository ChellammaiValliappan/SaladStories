import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, notifications, pushSubscriptions } from "@/db";
import {
  emailConfigured,
  ownerContacts,
  sendEmail,
  sendOwnerWhatsApp,
  sendTelegram,
  sendWhatsAppText,
  whatsappCloudConfigured,
} from "../notify";
import { pushConfigured, pushToTeam } from "../push";

export type Channel = "IN_APP" | "PUSH" | "EMAIL" | "WHATSAPP" | "TELEGRAM";
export type OutMsg = { channel: Channel; recipient?: string; title: string; body: string; link?: string };
type Row = typeof notifications.$inferSelect;

const MAX_ATTEMPTS = 3;
const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://saladstories.netlify.app").replace(/\/$/, "");
const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/**
 * Queue messages under one dedupe key (one row per channel + recipient) and send them.
 * Calling again with the same key does nothing, so retries and re-runs never double-send.
 */
export async function enqueue(kind: string, dedupeKey: string, msgs: OutMsg[]) {
  if (!msgs.length) return [];
  const inserted = await db
    .insert(notifications)
    .values(
      msgs.map((m) => ({
        kind,
        dedupeKey: m.recipient && m.recipient !== "team" && m.recipient !== "owner" ? `${dedupeKey}:${m.recipient}` : dedupeKey,
        channel: m.channel,
        recipient: m.recipient ?? "team",
        title: m.title,
        body: m.body,
        link: m.link ?? "",
      })),
    )
    .onConflictDoNothing()
    .returning();
  for (const row of inserted) await deliver(row);
  return inserted;
}

/** The owner's channels for an alert: full text in-app, email and Telegram; short text on push and WhatsApp. */
export function toOwner(title: string, full: string, short: string, link: string): OutMsg[] {
  return [
    { channel: "IN_APP", title, body: full, link },
    { channel: "PUSH", title, body: short, link },
    { channel: "EMAIL", recipient: "owner", title, body: full, link },
    { channel: "TELEGRAM", recipient: "owner", title, body: full, link },
    { channel: "WHATSAPP", recipient: "owner", title, body: `${title}\n${short}`, link },
  ];
}

async function mark(row: Row, patch: Partial<Row>) {
  await db.update(notifications).set({ ...patch, attempts: row.attempts + 1 }).where(eq(notifications.id, row.id));
}

/** Sends one queued message. "SKIPPED" = that channel isn't set up (not an error). */
export async function deliver(row: Row) {
  const url = row.link ? (row.link.startsWith("http") ? row.link : `${site()}${row.link}`) : "";
  const withLink = url ? `${row.body}\n\nOpen: ${url}` : row.body;
  try {
    switch (row.channel) {
      case "IN_APP":
        return mark(row, { status: "SENT", sentAt: new Date(), deliveryConfirmed: true });
      case "PUSH": {
        if (!pushConfigured()) return mark(row, { status: "SKIPPED", lastError: "Phone notifications not set up" });
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions);
        if (!n) return mark(row, { status: "SKIPPED", lastError: "No phone has notifications turned on" });
        const sent = await pushToTeam({ title: row.title, body: row.body.slice(0, 180), url: row.link || "/admin", tag: row.dedupeKey.slice(0, 60) });
        return mark(row, sent ? { status: "SENT", sentAt: new Date(), deliveryConfirmed: true, lastError: null } : { status: "FAILED", lastError: "Push service refused" });
      }
      case "EMAIL": {
        const to = row.recipient === "owner" ? (await ownerContacts()).email : row.recipient;
        if (!emailConfigured() || !to) return mark(row, { status: "SKIPPED", lastError: "Email not set up" });
        const html = `<div style="font-family:Arial,sans-serif;max-width:640px"><h2 style="color:#1f6b3a">${esc(row.title)}</h2><pre style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:14px">${esc(row.body)}</pre>${url ? `<p><a href="${url}">Open in Salad Stories</a></p>` : ""}</div>`;
        const ok = await sendEmail(to, row.title, withLink, html);
        return mark(row, ok ? { status: "SENT", sentAt: new Date(), lastError: null } : { status: "FAILED", lastError: "Mail server refused" });
      }
      case "TELEGRAM": {
        const chat = (await ownerContacts()).chatId;
        if (!process.env.TELEGRAM_BOT_TOKEN || !chat) return mark(row, { status: "SKIPPED", lastError: "Telegram not connected" });
        const ok = await sendTelegram(chat, `${row.title}\n\n${withLink}`);
        return mark(row, ok ? { status: "SENT", sentAt: new Date(), deliveryConfirmed: true, lastError: null } : { status: "FAILED", lastError: "Telegram refused" });
      }
      case "WHATSAPP": {
        if (row.recipient === "owner") {
          if (!process.env.CALLMEBOT_APIKEY && !whatsappCloudConfigured()) return mark(row, { status: "SKIPPED", lastError: "WhatsApp alerts not set up" });
          const ok = await sendOwnerWhatsApp(url ? `${row.body}\n${url}` : row.body);
          // CallMeBot can't tell us the message reached the phone.
          return mark(row, ok ? { status: "SENT", sentAt: new Date(), deliveryConfirmed: false, lastError: null } : { status: "FAILED", lastError: "WhatsApp service didn't accept it" });
        }
        // To a customer: only through the official WhatsApp Business API.
        if (!whatsappCloudConfigured()) return mark(row, { status: "SKIPPED", lastError: "Official WhatsApp API not set up — use the WhatsApp link instead" });
        const id = await sendWhatsAppText(row.recipient, row.body);
        return mark(row, id ? { status: "SENT", sentAt: new Date(), providerId: id, deliveryConfirmed: false, lastError: null } : { status: "FAILED", lastError: "WhatsApp API refused" });
      }
    }
  } catch (e) {
    return mark(row, { status: "FAILED", lastError: e instanceof Error ? e.message.slice(0, 300) : "Unknown error" });
  }
}

/** Retry failed sends (up to 3 attempts in total). */
export async function retryFailed() {
  const rows = await db.select().from(notifications).where(and(eq(notifications.status, "FAILED"), lt(notifications.attempts, MAX_ATTEMPTS))).limit(50);
  for (const r of rows) await deliver(r);
  return rows.length;
}

/** Owner pressed Retry: try again whatever the attempt count. */
export async function retryOne(id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (row && (row.status === "FAILED" || row.status === "SKIPPED" || row.status === "PENDING")) await deliver(row);
}

export async function inbox(limit = 100) {
  return db.select().from(notifications).where(eq(notifications.channel, "IN_APP")).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount() {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.channel, "IN_APP"), eq(notifications.status, "SENT")));
  return n;
}

export async function markRead(ids: string[] | "all") {
  await db
    .update(notifications)
    .set({ status: "READ", readAt: new Date() })
    .where(and(eq(notifications.channel, "IN_APP"), eq(notifications.status, "SENT"), ids === "all" ? undefined : inArray(notifications.id, ids)));
}

/** Other channels for the same alert (for the "sent by" line under each inbox item). */
export async function channelStatuses(dedupeKeys: string[]) {
  if (!dedupeKeys.length) return [];
  return db
    .select({ id: notifications.id, dedupeKey: notifications.dedupeKey, channel: notifications.channel, status: notifications.status, lastError: notifications.lastError, deliveryConfirmed: notifications.deliveryConfirmed, attempts: notifications.attempts })
    .from(notifications)
    .where(inArray(notifications.dedupeKey, dedupeKeys));
}
