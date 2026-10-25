import Link from "next/link";
import { sql } from "drizzle-orm";
import { db, expenses as expensesTable } from "@/db";
import { requireStaff } from "@/lib/auth";
import { EXPENSE_METHOD_LABELS, listCategories, listExpenses } from "@/lib/biz/expenses";
import { periodFor } from "@/lib/biz/finance";
import { formatINR } from "@/lib/money";
import { formatDateLong, istParts } from "@/lib/time";
import { Card, Empty, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ExpenseFields } from "@/components/admin/biz/ExpenseFields";
import { categoryAction, saveExpenseAction } from "../../biz-actions";

export const metadata = { title: "Expenses" };

const PERIODS = [
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "7d", label: "7 days" },
  { id: "fy", label: "This FY" },
];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; cat?: string; q?: string; removed?: string; add?: string; cats?: string; msg?: string; err?: string }> }) {
  const me = await requireStaff();
  const admin = me.role === "ADMIN";
  const sp = await searchParams;
  const period = periodFor(sp.p, sp.from, sp.to);
  const [cats, allCats, list, vendorRows] = await Promise.all([
    listCategories(),
    admin ? listCategories(true) : Promise.resolve([]),
    listExpenses({ from: period.from, to: period.to, categoryId: sp.cat, q: sp.q, removed: sp.removed === "1" }),
    db.execute<{ vendor: string }>(sql`select vendor from ${expensesTable} where vendor <> '' group by vendor order by max(created_at) desc limit 30`),
  ]);
  const vendors = (("rows" in vendorRows ? vendorRows.rows : vendorRows) as { vendor: string }[]).map((v) => v.vendor);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { p: period.key, from: period.key === "custom" ? period.from : undefined, to: period.key === "custom" ? period.to : undefined, cat: sp.cat, q: sp.q, removed: sp.removed, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/expenses?${p}`;
  };
  const exportQs = new URLSearchParams({ type: "expenses", from: period.from, to: period.to });
  return (
    <>
      <PageHead title="Expenses">
        {admin && <a href={`/api/admin/export?${exportQs}&format=xlsx`} className="btn btn-ghost min-h-11 text-sm">Excel</a>}
        {admin && <a href={`/api/admin/export?${exportQs}&format=csv`} className="btn btn-ghost min-h-11 text-sm">CSV</a>}
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />

      <details className="mb-6 rounded-3xl border-2 border-basil bg-white p-4 sm:p-5" open={sp.add === "1" || list.rows.length === 0}>
        <summary className="cursor-pointer text-lg font-bold text-basil-deep">+ Add expense</summary>
        <form action={saveExpenseAction} className="mt-4 space-y-4">
          <ExpenseFields categories={cats} vendors={vendors} today={istParts().dateStr} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn btn-primary" pendingText="Saving…">Save expense</SubmitButton>
            <button name="next" value="another" className="btn btn-ghost">Save &amp; add another</button>
          </div>
        </form>
      </details>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <Link key={p.id} href={qs({ p: p.id, from: undefined, to: undefined })} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${period.key === p.id ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>{p.label}</Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="p" value="custom" />
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={period.from} className="field min-h-10 py-1.5" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={period.to} className="field min-h-10 py-1.5" /></div>
        <div>
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" name="cat" defaultValue={sp.cat ?? ""} className="field min-h-10 py-1.5">
            <option value="">All</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="min-w-40 flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} placeholder="Shop or description" className="field min-h-10 py-1.5" /></div>
        <button className="btn btn-ghost min-h-10">Show</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <p className="mb-2 text-sm font-semibold">{period.label}: {formatDateLong(period.from)} – {formatDateLong(period.to)} · <span className="text-lg">{formatINR(list.total)}</span> spent</p>
          {list.rows.length === 0 ? <Empty>No expenses in this period.</Empty> : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
              {list.rows.map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/expenses/${e.id}`} className={`flex items-center justify-between gap-3 p-3 hover:bg-paper ${e.deletedAt ? "opacity-50" : ""}`}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold [overflow-wrap:anywhere]">{e.description}{e.attachmentKey ? " 📎" : ""}</p>
                      <p className="truncate text-xs text-ink-soft">{formatDateLong(e.date)} · {e.category?.name ?? "Uncategorised"}{e.vendor ? ` · ${e.vendor}` : ""} · {EXPENSE_METHOD_LABELS[e.method] ?? e.method}{e.deletedAt ? " · removed" : ""}</p>
                    </div>
                    <p className={`shrink-0 font-bold ${e.deletedAt ? "line-through" : ""}`}>{formatINR(e.amount)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {admin && <Link href={qs({ removed: sp.removed === "1" ? undefined : "1" })} className="mt-3 inline-block text-sm font-semibold text-ink-soft underline">{sp.removed === "1" ? "Hide removed" : "Show removed"}</Link>}
        </section>
        <aside className="space-y-6">
          <Card title="By category">
            {list.byCategory.length === 0 ? <p className="text-sm text-ink-soft">Nothing yet.</p> : (
              <ul className="space-y-2 text-sm">
                {list.byCategory.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between gap-2"><span>{c.name}</span><b>{formatINR(c.total)}</b></div>
                    <div className="mt-1 h-1.5 rounded-full bg-crate"><div className="h-1.5 rounded-full bg-carrot" style={{ width: `${Math.max(2, Math.round((c.total / Math.max(1, list.total)) * 100))}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {admin && (
            <Card title="Categories">
              <details open={sp.cats === "1"}>
                <summary className="cursor-pointer text-sm font-semibold">Add or hide categories</summary>
                <form action={categoryAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="action" value="add" />
                  <input name="name" required minLength={2} maxLength={60} placeholder="New category" className="field min-h-10 py-1.5" />
                  <SubmitButton className="btn btn-ghost min-h-10">Add</SubmitButton>
                </form>
                <ul className="mt-3 divide-y divide-line text-sm">
                  {allCats.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className={c.isActive ? "" : "text-ink-soft line-through"}>{c.name}</span>
                      <form action={categoryAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="action" value={c.isActive ? "hide" : "show"} />
                        <button className="text-xs font-semibold text-basil underline">{c.isActive ? "Hide" : "Show"}</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
