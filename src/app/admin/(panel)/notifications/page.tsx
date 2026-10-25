import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { channelStatuses, inbox } from "@/lib/biz/outbox";
import { recentJobRuns } from "@/lib/biz/jobs";
import { getSettings } from "@/lib/settings";
import { addDays, formatDateLong, formatTime, istParts } from "@/lib/time";
import { Card, Empty, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { markReadAction, retryNotificationAction, runDailyNowAction } from "../../biz-actions";

export const metadata = { title: "Alerts" };

const CHANNEL: Record<string, string> = { PUSH: "Phone", EMAIL: "Email", TELEGRAM: "Telegram", WHATSAPP: "WhatsApp" };
const JOB: Record<string, string> = {
  "daily-orders": "Tomorrow's orders list",
  renewals: "Renewal reminders",
  completions: "Finish completed plans",
  "daily-summary": "Daily sales summary",
  "weekly-backup": "Weekly backup",
};
const when = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

function chip(status: string, confirmed: boolean) {
  if (status === "SENT" || status === "READ" || status === "DELIVERED")
    return { text: confirmed ? "sent" : "handed over", cls: "bg-basil-soft text-basil-deep" };
  if (status === "FAILED") return { text: "failed", cls: "bg-tomato/15 text-tomato" };
  if (status === "SKIPPED") return { text: "not set up", cls: "bg-crate text-ink-soft" };
  return { text: "sending", cls: "bg-mango/30" };
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; all?: string }> }) {
  const user = await requireStaff();
  const admin = user.role === "ADMIN";
  const sp = await searchParams;
  const [items, runs, s] = await Promise.all([inbox(sp.all ? 300 : 60), admin ? recentJobRuns(20) : Promise.resolve([]), getSettings()]);
  const others = await channelStatuses([...new Set(items.map((i) => i.dedupeKey))]);
  const unread = items.filter((i) => i.status === "SENT").length;
  const tomorrow = addDays(istParts().dateStr, 1);

  return (
    <>
      <PageHead title="Alerts">
        {unread > 0 && (
          <form action={markReadAction}>
            <input type="hidden" name="returnTo" value="/admin/notifications" />
            <SubmitButton className="btn btn-ghost">Mark all read</SubmitButton>
          </form>
        )}
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <p className="mb-5 text-sm text-ink-soft">
        Every alert lands here first, then goes out on phone, email, Telegram and WhatsApp (whichever are set up). Tomorrow&apos;s orders list goes out daily at {formatTime(s.dailyListTime)}.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          {items.length === 0 ? <Empty>No alerts yet.</Empty> : (
            <ul className="space-y-3">
              {items.map((n) => {
                const chans = others.filter((o) => o.dedupeKey === n.dedupeKey && o.channel !== "IN_APP");
                const isNew = n.status === "SENT";
                return (
                  <li key={n.id} className={`rounded-2xl border bg-white p-4 ${isNew ? "border-basil" : "border-line"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-bold">{isNew && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-tomato align-middle" aria-label="new" />}{n.title}</p>
                      <span className="text-xs text-ink-soft">{when(n.createdAt)}</span>
                    </div>
                    <details className="mt-1" open={isNew && n.body.length < 600}>
                      <summary className="cursor-pointer text-sm text-ink-soft">{n.body.split("\n").find((l) => l.trim() && !l.startsWith("Salad Stories"))?.slice(0, 110) ?? "Details"}</summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm [overflow-wrap:anywhere]">{n.body}</pre>
                    </details>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {n.link && <Link href={n.link} className="btn btn-primary min-h-9 px-3 text-sm">Open</Link>}
                      {chans.map((c) => {
                        const ch = chip(c.status, c.deliveryConfirmed);
                        return (
                          <span key={c.id} title={c.lastError ?? ""} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${ch.cls}`}>
                            {CHANNEL[c.channel] ?? c.channel}: {ch.text}
                            {admin && c.status === "FAILED" && (
                              <form action={retryNotificationAction} className="inline">
                                <input type="hidden" name="id" value={c.id} />
                                <button className="ml-1 underline">retry</button>
                              </form>
                            )}
                          </span>
                        );
                      })}
                      {isNew && (
                        <form action={markReadAction} className="ml-auto">
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="returnTo" value="/admin/notifications" />
                          <button className="font-semibold text-basil hover:underline">Mark read</button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!sp.all && items.length >= 60 && <Link href="/admin/notifications?all=1" className="mt-4 inline-block text-sm font-semibold text-basil">Show older alerts</Link>}
        </section>

        {admin && (
          <aside className="space-y-6">
            <Card title="Tomorrow's list">
              <p className="mb-3 text-sm text-ink-soft">
                Sends the list for {formatDateLong(tomorrow)} now instead of at {formatTime(s.dailyListTime)}. It only goes out once per date, so it won&apos;t be sent again later.
              </p>
              <form action={runDailyNowAction}>
                <input type="hidden" name="date" value={tomorrow} />
                <SubmitButton className="btn btn-ghost w-full" pendingText="Sending…">Send tomorrow&apos;s list now</SubmitButton>
              </form>
              <Link href={`/admin/schedule?date=${tomorrow}`} className="mt-2 block text-center text-sm font-semibold text-basil">See it on the schedule</Link>
            </Card>
            <Card title="Automatic jobs">
              {runs.length === 0 ? <p className="text-sm text-ink-soft">Nothing has run yet. Jobs run every 15 minutes once the site is live.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {runs.map((r) => (
                    <li key={r.runKey} className="py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{JOB[r.job] ?? r.job}</span>
                        <span className={r.status === "DONE" ? "text-basil" : r.status === "FAILED" ? "font-semibold text-tomato" : "text-ink-soft"}>{r.status === "DONE" ? "done" : r.status === "FAILED" ? "failed" : "running"}</span>
                      </div>
                      <span className="text-xs text-ink-soft">{r.runKey.split(":").slice(1).join(":")} · {when(r.startedAt)}{r.attempts > 1 ? ` · ${r.attempts} tries` : ""}</span>
                      {r.error && <p className="text-xs text-tomato">{r.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
