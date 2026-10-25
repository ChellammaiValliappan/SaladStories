import "server-only";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { db, jobRuns, subscriptions } from "@/db";
import { getSettings } from "../settings";
import { addDays, formatDateLong, istParts, toMinutes } from "../time";
import { audit } from "./audit";
import { scheduleStats } from "./core";
import { attentionItems, deliveryList, formatDeliveryList, plansEndingOn } from "./daily";
import { enqueue, retryFailed, toOwner, type OutMsg } from "./outbox";

/**
 * Runs `fn` once per run key. A finished run is never repeated; a failed or
 * stuck run (over 10 minutes) is retried by the next tick.
 */
export async function runJob<T>(runKey: string, job: string, fn: () => Promise<T>): Promise<{ ran: boolean; result?: T; error?: string }> {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const [claimed] = await db
    .insert(jobRuns)
    .values({ runKey, job })
    .onConflictDoUpdate({
      target: jobRuns.runKey,
      set: { status: "RUNNING", attempts: sql`${jobRuns.attempts} + 1`, startedAt: new Date(), error: null },
      where: or(eq(jobRuns.status, "FAILED"), and(eq(jobRuns.status, "RUNNING"), lt(jobRuns.startedAt, staleBefore))),
    })
    .returning();
  if (!claimed) return { ran: false };
  try {
    const result = await fn();
    await db.update(jobRuns).set({ status: "DONE", result: (result ?? null) as never, finishedAt: new Date() }).where(eq(jobRuns.runKey, runKey));
    return { ran: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[job ${runKey} failed]`, e);
    await db.update(jobRuns).set({ status: "FAILED", error: error.slice(0, 500), finishedAt: new Date() }).where(eq(jobRuns.runKey, runKey));
    return { ran: true, error };
  }
}

/** 8 pm (configurable): tomorrow's consolidated list + a separate "needs attention" alert. */
export async function sendTomorrowList(date: string) {
  const list = await deliveryList(date);
  const text = formatDeliveryList(date, list);
  const plansCount = list.filter((e) => e.plan).length;
  const bowls = list.reduce((t, e) => t + e.bowls.reduce((x, b) => x + b.qty, 0), 0);
  const short = list.length ? `${list.length} deliveries (${plansCount} plan, ${list.length - plansCount} one-off) · ${bowls} bowls` : "No deliveries.";
  await enqueue("DAILY_ORDERS", `daily-orders:${date}`, toOwner(`Tomorrow's orders · ${formatDateLong(date)}`, text, short, `/admin/schedule?date=${date}`));

  const items = await attentionItems(date, list);
  if (items.length) {
    const body = items.map((i, n) => `${n + 1}. ${i.text}`).join("\n");
    await enqueue("ATTENTION", `attention:${date}`, toOwner(`Needs attention before ${formatDateLong(date)}`, body, `${items.length} item${items.length === 1 ? "" : "s"} need you`, "/admin"));
  }
  return { deliveries: list.length, attention: items.length };
}

/** The day before a plan's final delivery: owner alert + customer reminder (once per plan). */
export async function sendRenewalReminders(date: string) {
  const s = await getSettings();
  const ending = await plansEndingOn(addDays(date, Math.max(1, s.renewalReminderDays)));
  for (const sub of ending) {
    const due = `renewal:${sub.id}`;
    const link = `/admin/plans/${sub.id}`;
    const msgs: OutMsg[] = toOwner(
      `Renewal due · ${sub.customerName}`,
      `${sub.customerName}'s ${sub.planName} plan ends with the delivery on ${formatDateLong(sub.endDate)}.\nRenew before the next delivery: same plan or a different one. The next plan starts once its payment is recorded.\nCall ${sub.phone} · https://wa.me/91${sub.phone}?text=${encodeURIComponent(renewalText(sub, s.businessName))}`,
      `${sub.customerName}'s plan ends ${formatDateLong(sub.endDate)}`,
      link,
    );
    if (s.customerMessaging) {
      const text = renewalText(sub, s.businessName);
      if (sub.email && !sub.email.endsWith("@no-email.saladstories")) msgs.push({ channel: "EMAIL", recipient: sub.email, title: `Your ${s.businessName} plan ends on ${formatDateLong(sub.endDate)}`, body: text, link: "/plans" });
      msgs.push({ channel: "WHATSAPP", recipient: `91${sub.phone}`, title: "Plan renewal", body: text });
    }
    await enqueue("RENEWAL_DUE", due, msgs);
    if (sub.renewalStatus === "NONE") {
      await db.update(subscriptions).set({ renewalStatus: "DUE", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
      await audit(db, "subscription", sub.id, "renewal due", { after: { renewalStatus: "DUE" } });
    }
  }
  return { reminders: ending.length };
}

function renewalText(sub: { customerName: string; planName: string; endDate: string }, business: string) {
  return `Hi ${sub.customerName.split(" ")[0]}, your ${business} ${sub.planName} plan ends with your delivery on ${formatDateLong(sub.endDate)}. Reply to renew and keep your fresh bowls coming — same plan or a different one. Thank you!`;
}

/** Plans with every paid delivery delivered or forfeited → Completed; tell the owner a new payment is needed. */
export async function completeFinishedPlans(today: string) {
  const candidates = await db.query.subscriptions.findMany({
    where: and(eq(subscriptions.status, "ACTIVE"), lt(subscriptions.endDate, today)),
    with: { days: { with: { order: true } } },
  });
  let done = 0;
  for (const sub of candidates) {
    const lite = sub.days.map((d) => ({ date: d.date, status: d.status, orderStatus: d.order?.status ?? null }));
    const stats = scheduleStats(lite, sub.daysTotal, sub.extraAuthorized, today);
    if (!stats.complete) continue;
    const last = sub.days.filter((d) => d.status === "SCHEDULED").map((d) => d.date).sort().pop() ?? sub.endDate;
    const [changed] = await db
      .update(subscriptions)
      .set({ status: "COMPLETED", actualEndDate: last, renewalStatus: sub.renewalStatus === "RENEWED" ? "RENEWED" : "DUE", updatedAt: new Date() })
      .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.status, "ACTIVE")))
      .returning();
    if (!changed) continue;
    done++;
    await audit(db, "subscription", sub.id, "completed", { before: { status: "ACTIVE" }, after: { status: "COMPLETED", actualEndDate: last, delivered: stats.delivered, forfeited: stats.forfeited } });
    if (sub.renewalStatus !== "RENEWED")
      await enqueue(
        "PLAN_COMPLETED",
        `plan-completed:${sub.id}`,
        toOwner(
          `Plan finished · ${sub.customerName}`,
          `${sub.customerName}'s ${sub.planName} plan (${sub.number}) is complete: ${stats.delivered} delivered${stats.forfeited ? `, ${stats.forfeited} forfeited` : ""}.\nNo more deliveries will be added under this plan. Payment for the next plan is required — renew it from the plan page.`,
          `${sub.customerName}: plan complete, renewal payment needed`,
          `/admin/plans/${sub.id}`,
        ),
      );
  }
  return { completed: done };
}

/** Every 15 minutes (Netlify scheduled function). Each part is idempotent. */
export async function tick(now = istParts()) {
  const s = await getSettings();
  const out: Record<string, unknown> = {};
  const today = now.dateStr;
  const tomorrow = addDays(today, 1);
  out.completed = await runJob(`completions:${today}:${Math.floor(now.minutes / 60)}`, "completions", () => completeFinishedPlans(today));
  if (now.minutes >= toMinutes(s.dailyListTime)) {
    out.renewals = await runJob(`renewals:${today}`, "renewals", () => sendRenewalReminders(today));
    out.dailyOrders = await runJob(`daily-orders:${tomorrow}`, "daily-orders", () => sendTomorrowList(tomorrow));
  }
  if (now.minutes >= 22 * 60) {
    const { sendDailySummary } = await import("../reports");
    const { activatePaidPlans } = await import("../plans");
    out.summary = await runJob(`daily-summary:${today}`, "daily-summary", async () => {
      const { issueMissingInvoices } = await import("./invoices");
      return { ...(await sendDailySummary(today)), healed: await activatePaidPlans(), billing: await issueMissingInvoices() };
    });
  }
  if (now.dow === 1 && now.minutes >= 8 * 60) {
    const { sendOrdersBackup } = await import("../reports");
    out.backup = await runJob(`weekly-backup:${today}`, "weekly-backup", () => sendOrdersBackup());
  }
  out.retried = await retryFailed();
  return out;
}

export async function recentJobRuns(limit = 30) {
  const { desc } = await import("drizzle-orm");
  return db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit);
}
