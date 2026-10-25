import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { STATUS_LABELS, addressLine } from "@/lib/notify";
import { subscriptionState, swapOptions } from "@/lib/plans";
import { formatDateLong, istParts } from "@/lib/time";
import { adminSwapPlanDay, cancelPlan } from "../../../actions";
import { pauseAction, reissueInvoiceAction, startEarlyAction } from "../../../biz-actions";
import { liveInvoice } from "@/lib/biz/invoices";
import { DecisionForm } from "@/components/admin/biz/DecisionForm";
import { carryForwardPreview, OUTCOME_LABELS, requestsForPlan } from "@/lib/biz/requests";
import { addDays } from "@/lib/time";
import { subscriptionSummary } from "@/lib/biz/subscriptions";
import { PAYMENT_STATUS_LABELS } from "@/lib/biz/core";
import { historyFor } from "@/lib/biz/history";
import { PaymentForm } from "@/components/admin/biz/PaymentForm";
import { PaymentsList } from "@/components/admin/biz/PaymentsList";
import { History } from "@/components/admin/biz/History";
import { WEEKDAY_NAMES, parseWeekdays } from "@/lib/plans-core";
import { Badge, Card, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata = { title: "Plan" };

export default async function PlanAdminDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; value?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const summary = await subscriptionSummary(id);
  if (!summary) notFound();
  const { sub, stats, money, next, dayNumberOf } = summary;
  const admin = me.role === "ADMIN";
  const [carry, reqs, invoice] = await Promise.all([sub.status === "ACTIVE" ? carryForwardPreview(sub.id) : Promise.resolve(null), requestsForPlan(sub.id), liveInvoice({ subscriptionId: sub.id })]);
  const history = await historyFor([
    { entity: "request", ids: reqs.map((r) => r.id) },
    { entity: "subscription", ids: [sub.id] },
    { entity: "day", ids: sub.days.map((d) => d.id) },
    { entity: "payment", ids: money.rows.map((p) => p.id) },
  ]);
  const st = subscriptionState(sub);
  const today = istParts().dateStr;
  const caps = [...new Set(sub.days.filter((d) => d.status === "SCHEDULED" && d.date >= today).map((d) => d.tier))];
  const optionsByCap = new Map(await Promise.all(caps.map(async (c) => [c, await swapOptions(sub, c)] as const)));

  return (
    <>
      <PageHead title={`Plan ${sub.number}`} back={{ href: "/admin/plans", label: "Meal plans" }}>
        <Badge value={st.key} />
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { k: "Delivered", v: `${stats.delivered} of ${stats.entitled}` },
          { k: "Remaining", v: String(stats.remaining) },
          { k: "Next delivery", v: next ? `Day ${next.number} · ${formatDateLong(next.date)}` : "—" },
          { k: PAYMENT_STATUS_LABELS[money.status], v: money.due ? `${formatINR(money.due)} due` : formatINR(money.net), bad: money.due > 0 },
        ].map((t) => (
          <div key={t.k} className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-semibold text-ink-soft">{t.k}</p>
            <p className={`mt-1 font-display text-xl font-[800] ${t.bad ? "text-tomato" : ""}`}>{t.v}</p>
          </div>
        ))}
      </div>
      {sub.status === "PENDING_PAYMENT" && (
        <div className="mb-6 rounded-2xl border-2 border-mango bg-white p-4 text-sm">
          <p className="font-bold">Waiting for payment — no deliveries are scheduled in the kitchen yet.</p>
          <p className="text-ink-soft">The plan starts automatically once {formatINR(sub.total)} is recorded as received{money.net ? ` (${formatINR(money.net)} received so far)` : ""}.</p>
          {admin && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-basil">Start before payment (exception)</summary>
              <form action={startEarlyAction} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <input name="reason" required minLength={3} placeholder="Reason — kept in history" className="field min-h-10 flex-1 py-1.5" />
                <SubmitButton className="btn btn-ghost min-h-10" confirm="Start deliveries before full payment?">Start now</SubmitButton>
              </form>
            </details>
          )}
        </div>
      )}
      {sp.msg === "planCancelled" && Number(sp.value) > 0 && (
        <p className="-mt-3 mb-5 text-sm font-semibold">Value of the cancelled days at bowl price: {formatINR(Number(sp.value))} (before the plan discount).</p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Days">
          <p className="mb-3 text-sm text-ink-soft">The team can swap a bowl or skip / move any day the kitchen hasn&apos;t started, even within the customer&apos;s 24-hour cut-off. Every change asks for a reason and is kept in the history.</p>
          <ul className="divide-y divide-line">
            {sub.days.map((d) => {
              const open = sub.status === "ACTIVE" && d.status === "SCHEDULED" && (!d.order || d.order.status === "PAID") && d.date >= today;
              return (
                <li key={d.id} className={`grid gap-2 py-3 sm:grid-cols-[9rem_1fr] sm:items-start ${d.status === "SKIPPED" ? "opacity-60" : ""}`}>
                  <div>
                    <p className="font-bold">{d.status === "SCHEDULED" || d.status === "FORFEITED" ? <span className="mr-1 text-xs font-semibold text-ink-soft">Day {dayNumberOf(d.date)}</span> : null}{formatDateLong(d.date)}</p>
                    {d.originalDate && d.originalDate !== d.date && <p className="text-xs text-ink-soft">moved from {formatDateLong(d.originalDate)}</p>}
                    {d.order && <Link href={`/admin/orders/${d.order.id}`} className="text-xs font-semibold text-basil hover:underline">{d.order.orderNumber}</Link>}
                  </div>
                  <p>
                    <span className={d.status === "SKIPPED" || d.status === "FORFEITED" ? "line-through" : "font-semibold"}>{sub.quantity} × {d.productName}</span>
                    {sub.address2 && <span className="ml-2 whitespace-nowrap rounded-full bg-mango/30 px-2 py-0.5 text-xs font-semibold">{d.addressNo === 2 ? sub.address2Label : sub.addressLabel}</span>}
                    <span className="ml-2 whitespace-nowrap rounded-full bg-crate px-2 py-0.5 text-xs font-semibold text-ink-soft">{d.status === "SKIPPED" ? "Moved" : d.status === "FORFEITED" ? "Forfeited" : d.status === "HELD" ? "Skip requested" : d.order ? STATUS_LABELS[d.order.status] ?? d.order.status : "Not started"}</span>
                  </p>
                  {open && (
                    <div className="flex flex-wrap gap-2 sm:col-start-2">
                      <form action={adminSwapPlanDay} className="flex gap-2">
                        <input type="hidden" name="subscriptionId" value={sub.id} />
                        <input type="hidden" name="dayId" value={d.id} />
                        <select name="productId" defaultValue={d.productId ?? ""} className="field min-h-10 py-1.5 text-sm" aria-label={`Bowl for ${formatDateLong(d.date)}`}>
                          {(optionsByCap.get(d.tier) ?? []).map((o) => (
                            <option key={o.id} value={o.id} disabled={!o.ok}>{o.name}{o.tier === "PREMIUM" ? " · premium" : ""}{o.soldOut ? " (sold out)" : ""}</option>
                          ))}
                        </select>
                        <SubmitButton className="btn btn-ghost min-h-10 px-3 text-sm">Swap</SubmitButton>
                      </form>
                      <details className="w-full">
                        <summary className="cursor-pointer py-1 text-sm font-semibold text-basil">Skip / move this day</summary>
                        <div className="mt-2 rounded-xl bg-crate p-3">
                          <DecisionForm mode="now" subscriptionId={sub.id} dayId={d.id} suggestedEnd={carry ? formatDateLong(carry) : null} />
                        </div>
                      </details>
                    </div>
                  )}
                  {d.status === "HELD" && (
                    <Link href="/admin/requests" className="text-sm font-semibold text-carrot sm:col-start-2">Skip requested — decide in Requests →</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-6">
          {(sub.status === "ACTIVE" || sub.status === "PAUSED") && (
            <Card title={sub.status === "PAUSED" ? "Paused" : "Pause"}>
              <form action={pauseAction} className="space-y-2 text-sm">
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <input type="hidden" name="action" value={sub.status === "PAUSED" ? "resume" : "pause"} />
                <label className="label" htmlFor="pause-date">{sub.status === "PAUSED" ? "Resume deliveries from" : "Pause from"}</label>
                <input id="pause-date" name="date" type="date" required min={addDays(today, 1)} defaultValue={addDays(today, 1)} className="field" />
                {sub.status === "ACTIVE" && <input name="reason" required minLength={3} placeholder="Reason (e.g. travelling)" className="field" />}
                <SubmitButton className="btn btn-ghost w-full">{sub.status === "PAUSED" ? "Resume plan" : "Pause plan"}</SubmitButton>
                <p className="text-xs text-ink-soft">{sub.status === "PAUSED" ? "Held deliveries go back on the calendar from this date, on the customer's delivery days." : "All deliveries from this date are held off the kitchen sheet until you resume."}</p>
              </form>
            </Card>
          )}
          {admin && sub.customerId && (sub.status === "COMPLETED" || sub.status === "ACTIVE" || st.key === "COMPLETED") && (
            <Link href={`/admin/subscriptions/new?customer=${sub.customerId}&renew=${sub.id}`} className={`btn w-full ${sub.renewalStatus === "DUE" || st.key === "COMPLETED" ? "btn-primary" : "btn-ghost"}`}>
              {sub.renewalStatus === "RENEWED" ? "Renewed — create another plan" : "Renew this plan"}
            </Link>
          )}
          <Card title="Money">
            <p className="text-sm">
              Total {formatINR(sub.total)} · received {formatINR(money.net)}
              {money.toVerify ? ` · ${formatINR(money.toVerify)} to verify` : ""}
              {money.due ? <b className="text-tomato"> · due {formatINR(money.due)}</b> : ""}
            </p>
            {admin && (
              <div className="mt-2 text-sm">
                {invoice ? (
                  <Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-basil underline">Invoice {invoice.number} →</Link>
                ) : (
                  <form action={reissueInvoiceAction} className="inline">
                    <input type="hidden" name="subscriptionId" value={sub.id} />
                    <input type="hidden" name="returnTo" value={`/admin/plans/${sub.id}`} />
                    <SubmitButton className="btn btn-ghost min-h-9 px-3 text-xs">Issue invoice</SubmitButton>
                  </form>
                )}
              </div>
            )}
            <div className="mt-3"><PaymentsList rows={money.rows} returnTo={`/admin/plans/${sub.id}`} canEdit={admin} /></div>
            {admin && sub.customerId && sub.status !== "CANCELLED" && (
              <details className="mt-3 rounded-2xl bg-crate p-3" open={money.due > 0}>
                <summary className="cursor-pointer text-sm font-semibold">Record a payment</summary>
                <div className="mt-3"><PaymentForm customerId={sub.customerId} subscriptionId={sub.id} suggested={money.due} returnTo={`/admin/plans/${sub.id}`} /></div>
              </details>
            )}
          </Card>
          <Card title="Customer">
            {sub.customerId && <Link href={`/admin/customers/${sub.customerId}`} className="mb-2 inline-block text-sm font-semibold text-basil">Open customer profile →</Link>}
            <p className="font-semibold">{sub.customerName}</p>
            <p className="text-sm"><a className="text-basil underline" href={`tel:${sub.phone}`}>{sub.phone}</a> · {sub.email}</p>
            {[{ label: sub.address2 ? sub.addressLabel : null, a: sub.address }, ...(sub.address2 ? [{ label: sub.address2Label, a: sub.address2 }] : [])].map(({ label, a }, i) => (
              <div key={i} className="mt-2 text-sm">
                {label && <p className="font-semibold">{label}</p>}
                <p className="text-ink-soft">{addressLine(a)}</p>
                {a.instructions && <p className="mt-1 rounded bg-mango/20 px-2 py-1">Note: {a.instructions}</p>}
              </div>
            ))}
          </Card>
          <Card title="Plan">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Plan</dt><dd className="font-semibold">{sub.planName} · {sub.daysTotal} days</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd className="font-semibold">{sub.slotName}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Days</dt><dd className="font-semibold">{parseWeekdays(sub.weekdays).map((d) => WEEKDAY_NAMES[d]).join(", ")}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Source</dt><dd className="font-semibold">{sub.source === "ADMIN" ? "Created by the team" : "Website"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Per day</dt><dd className="font-semibold">{sub.quantity} bowl{sub.quantity === 1 ? "" : "s"}{sub.large ? " · large" : ""}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Bowls</dt><dd>{formatINR(sub.subtotal)}</dd></div>
              {sub.discount > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Discount</dt><dd>−{formatINR(sub.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd>{sub.deliveryFee ? formatINR(sub.deliveryFee) : "Free"}</dd></div>
              {sub.tax > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Tax</dt><dd>{formatINR(sub.tax)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd>{formatINR(sub.total)}</dd></div>
            </dl>
            {sub.paymentOrderId && <Link href={`/admin/orders/${sub.paymentOrderId}`} className="mt-3 inline-block text-sm font-semibold text-basil">Payment order →</Link>}
          </Card>
          {me.role === "ADMIN" && sub.status !== "CANCELLED" && (
            <Card title="Cancel plan">
              <form action={cancelPlan} className="space-y-3">
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <input name="reason" placeholder="Reason (optional)" className="field" />
                <SubmitButton className="btn btn-ghost w-full text-tomato" confirm="Cancel this plan? All its future days are removed from the kitchen sheet. Refunds are done by hand.">Cancel plan</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
      {reqs.length > 0 && (
        <Card title="Skips, reschedules and pauses" className="mt-6">
          <ul className="divide-y divide-line text-sm">
            {reqs.map((r) => (
              <li key={r.id} className="py-2">
                <b>{r.type.charAt(0) + r.type.slice(1).toLowerCase()}</b> {r.originalDate ? formatDateLong(r.originalDate) : ""}
                {r.finalDate && r.finalDate !== r.originalDate ? ` → ${formatDateLong(r.finalDate)}` : ""} · {r.status === "PENDING" ? <span className="font-semibold text-carrot">waiting for decision</span> : OUTCOME_LABELS[r.outcome ?? ""] ?? r.outcome}
                {r.endDateBefore && r.endDateAfter && r.endDateBefore !== r.endDateAfter ? <span className="text-ink-soft"> · end {formatDateLong(r.endDateBefore)} → {formatDateLong(r.endDateAfter)}</span> : null}
                <span className="block text-xs text-ink-soft">{r.reason ? `“${r.reason}” · ` : ""}by {r.requestedBy}{r.decidedBy ? ` · decided by ${r.decidedBy}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="History" className="mt-6">
        <History rows={history} />
      </Card>
    </>
  );
}
