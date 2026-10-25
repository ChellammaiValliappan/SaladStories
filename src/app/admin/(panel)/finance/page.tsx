import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { financeSummary, periodFor } from "@/lib/biz/finance";
import { METHOD_LABELS } from "@/lib/biz/payments";
import { formatINR } from "@/lib/money";
import { formatDateLong } from "@/lib/time";
import { Card, PageHead } from "@/components/admin/ui";
import { MoneyChart } from "@/components/admin/biz/MoneyChart";

export const metadata = { title: "Finance" };

const PERIODS = [
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "fy", label: "This FY" },
];
const EXPORTS = [
  { type: "finance", label: "Full finance workbook" },
  { type: "payments", label: "Payments & refunds" },
  { type: "invoices", label: "Invoices & credit notes" },
  { type: "expenses", label: "Expenses" },
  { type: "plans", label: "Meal plans" },
  { type: "orders", label: "Orders" },
  { type: "customers", label: "Customers (all)" },
];

function Tile({ label, value, sub, href, tone }: { label: string; value: string; sub?: string; href?: string; tone?: "bad" }) {
  const inner = (
    <>
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl font-[800] sm:text-3xl ${tone === "bad" ? "text-tomato" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="min-w-0 rounded-2xl border border-line bg-white p-4 hover:border-basil">{inner}</Link>
  ) : (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-4">{inner}</div>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const period = periodFor(sp.p, sp.from, sp.to);
  const f = await financeSummary(period.from, period.to);
  const range = new URLSearchParams({ from: period.from, to: period.to });
  return (
    <>
      <PageHead title="Finance" />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <Link key={p.id} href={`/admin/finance?p=${p.id}`} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${period.key === p.id ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>{p.label}</Link>
        ))}
      </div>
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <input type="hidden" name="p" value="custom" />
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={period.from} className="field min-h-10 py-1.5" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={period.to} className="field min-h-10 py-1.5" /></div>
        <button className="btn btn-ghost min-h-10">Show</button>
        <p className="w-full text-sm text-ink-soft">{period.label}: {formatDateLong(period.from)} – {formatDateLong(period.to)}</p>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sales" value={formatINR(f.sales.net)} sub={`${f.sales.invoices} invoices${f.sales.credited ? ` · ${formatINR(f.sales.credited)} credited` : ""}`} href="/admin/invoices" />
        <Tile label="Money received" value={formatINR(f.collections.net)} sub={`${f.collections.payments} payments${f.collections.refunded ? ` · ${formatINR(f.collections.refunded)} refunded` : ""}`} href={`/admin/payments?${range}`} />
        <Tile label="Expenses" value={formatINR(f.expenses.total)} sub={`${f.expenses.byCategory.reduce((t, c) => t + c.count, 0)} entries`} href={`/admin/expenses?p=custom&${range}`} />
        <Tile label="Profit (estimate)" value={formatINR(f.profit)} sub="Sales before tax − expenses" tone={f.profit < 0 ? "bad" : undefined} />
        <Tile label="Cash flow" value={formatINR(f.cashFlow)} sub="Received − expenses" tone={f.cashFlow < 0 ? "bad" : undefined} />
        <Tile label="Still to collect" value={formatINR(f.outstanding.amount)} sub={`${f.outstanding.invoices} unpaid invoices · as of today`} href="/admin/invoices?f=unpaid" />
        <Tile label="Paid in advance" value={formatINR(f.advances.amount)} sub={`${f.advances.daysOwed} plan deliveries still owed`} href="/admin/schedule" />
        <Tile label="Tax in sales" value={formatINR(f.sales.tax)} sub="On invoices in this period" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card title="Money in and out"><MoneyChart daily={f.daily} /></Card>
        <Card title="Meal plans">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink-soft">Active now</dt><dd className="text-2xl font-bold">{f.subscribers.active}</dd></div>
            <div><dt className="text-ink-soft">Subscribers</dt><dd className="text-2xl font-bold">{f.subscribers.customers}</dd></div>
            <div><dt className="text-ink-soft">Started</dt><dd className="text-xl font-bold">{f.subscribers.started}</dd></div>
            <div><dt className="text-ink-soft">Completed</dt><dd className="text-xl font-bold">{f.subscribers.completed}</dd></div>
            <div><dt className="text-ink-soft">Renewed</dt><dd className="text-xl font-bold">{f.subscribers.renewed}</dd></div>
            <div><dt className="text-ink-soft">Renewal rate</dt><dd className="text-xl font-bold">{f.subscribers.renewalRate == null ? "—" : `${f.subscribers.renewalRate}%`}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-soft">{f.subscribers.waiting} waiting for payment · {f.subscribers.paused} paused · {f.subscribers.cancelled} cancelled in this period. Started, completed and renewed count this period.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Received by method">
          {f.collections.byMethod.length === 0 ? <p className="text-sm text-ink-soft">Nothing received yet.</p> : (
            <ul className="space-y-1.5 text-sm">{f.collections.byMethod.map((m) => <li key={m.method} className="flex justify-between gap-2"><span>{METHOD_LABELS[m.method] ?? m.method}</span><b>{formatINR(m.total)}</b></li>)}</ul>
          )}
        </Card>
        <Card title="Expenses by category">
          {f.expenses.byCategory.length === 0 ? <p className="text-sm text-ink-soft">No expenses recorded. <Link href="/admin/expenses?add=1" className="font-semibold text-basil underline">Add one</Link></p> : (
            <ul className="space-y-2 text-sm">
              {f.expenses.byCategory.map((c) => (
                <li key={c.name}>
                  <div className="flex justify-between gap-2"><span>{c.name}</span><b>{formatINR(c.total)}</b></div>
                  <div className="mt-1 h-1.5 rounded-full bg-crate"><div className="h-1.5 rounded-full bg-carrot" style={{ width: `${Math.max(2, Math.round((c.total / Math.max(1, f.expenses.total)) * 100))}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Download">
          <p className="mb-3 text-xs text-ink-soft">For your accountant or Google Sheets. Uses the period above (customers: everyone).</p>
          <ul className="divide-y divide-line text-sm">
            {EXPORTS.map((x) => (
              <li key={x.type} className="flex items-center justify-between gap-2 py-1.5">
                <span>{x.label}</span>
                <span className="flex gap-3 font-semibold">
                  <a href={`/api/admin/export?type=${x.type}&format=xlsx&${range}`} className="text-basil underline">Excel</a>
                  <a href={`/api/admin/export?type=${x.type}&format=csv&${range}`} className="text-basil underline">CSV</a>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-6 text-xs text-ink-soft">
        Sales count when invoiced; money received counts on the day it arrived. The profit figure is an estimate (it doesn&apos;t account for stock on hand or advance payments) — use it as a guide, and your accountant&apos;s figures for tax filing.
      </p>
    </>
  );
}
