import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { carryForwardPreview, listRequests, OUTCOME_LABELS } from "@/lib/biz/requests";
import { formatDateLong } from "@/lib/time";
import { Card, Empty, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { DecisionForm } from "@/components/admin/biz/DecisionForm";

export const metadata = { title: "Skip requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const [pending, done] = await Promise.all([listRequests("PENDING"), listRequests("DONE")]);
  const previews = new Map(await Promise.all([...new Set(pending.map((p) => p.r.subscriptionId))].map(async (id) => [id, await carryForwardPreview(id)] as const)));
  return (
    <>
      <PageHead title="Skip & reschedule requests" />
      <Flash msg={sp.msg} err={sp.err} />
      <p className="mb-5 text-sm text-ink-soft">
        A requested day is held off the kitchen sheet until you decide. Every decision is kept with who made it and how it changed the plan&apos;s end date.
      </p>
      <h2 className="mb-3 text-xl font-bold">Waiting for you ({pending.length})</h2>
      {pending.length === 0 ? <Empty>No requests waiting.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.map(({ r, customerName, customerId, phone, planName, number, endDate }) => (
            <Card key={r.id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{customerId ? <Link href={`/admin/customers/${customerId}`} className="text-basil hover:underline">{customerName}</Link> : customerName} · {phone}</p>
                  <p className="text-sm text-ink-soft"><Link href={`/admin/plans/${r.subscriptionId}`} className="hover:underline">{planName} plan {number}</Link> · ends {formatDateLong(endDate)}</p>
                </div>
                <span className="rounded-full bg-carrot/20 px-2.5 py-0.5 text-xs font-bold text-[#8a4a00]">{r.type === "RESCHEDULE" ? "Reschedule" : "Skip"}</span>
              </div>
              <p className="text-sm"><b>{r.originalDate ? formatDateLong(r.originalDate) : ""}</b>{r.requestedDate ? <> → wants <b>{formatDateLong(r.requestedDate)}</b></> : null}</p>
              {r.reason && <p className="text-sm text-ink-soft">“{r.reason}”</p>}
              <p className="mb-3 text-xs text-ink-soft">Asked by {r.requestedBy}{r.requestedByCustomer ? " (website)" : ""} · {new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
              <DecisionForm mode="decide" requestId={r.id} requested={r.requestedDate} suggestedEnd={previews.get(r.subscriptionId) ? formatDateLong(previews.get(r.subscriptionId)!) : null} returnTo="/admin/requests" />
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-10 text-xl font-bold">Decided</h2>
      {done.length === 0 ? <Empty>Nothing decided yet.</Empty> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white px-4 text-sm">
          {done.map(({ r, customerName, planName, number }) => (
            <li key={r.id} className="py-3">
              <p><b>{customerName}</b> · <Link href={`/admin/plans/${r.subscriptionId}`} className="text-basil hover:underline">{planName} {number}</Link> · {r.type.toLowerCase()}</p>
              <p>
                {r.originalDate ? formatDateLong(r.originalDate) : ""}{r.finalDate && r.finalDate !== r.originalDate ? ` → ${formatDateLong(r.finalDate)}` : ""} · <b>{OUTCOME_LABELS[r.outcome ?? ""] ?? r.outcome}</b>
                {r.endDateBefore && r.endDateAfter && r.endDateBefore !== r.endDateAfter ? <span className="text-ink-soft"> · plan end {formatDateLong(r.endDateBefore)} → {formatDateLong(r.endDateAfter)}</span> : null}
              </p>
              <p className="text-xs text-ink-soft">{r.reason ? `“${r.reason}” · ` : ""}asked by {r.requestedBy} · decided by {r.decidedBy}{r.note ? ` · ${r.note}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
