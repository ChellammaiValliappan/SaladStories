import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, expenses as expensesTable } from "@/db";
import { requireStaff } from "@/lib/auth";
import { EXPENSE_METHOD_LABELS, getExpense, listCategories } from "@/lib/biz/expenses";
import { historyFor } from "@/lib/biz/history";
import { formatINR } from "@/lib/money";
import { formatDateLong, istParts } from "@/lib/time";
import { Card, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { History } from "@/components/admin/biz/History";
import { ExpenseFields } from "@/components/admin/biz/ExpenseFields";
import { removeExpenseAction, saveExpenseAction } from "../../../biz-actions";

export const metadata = { title: "Expense" };

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireStaff();
  const admin = me.role === "ADMIN";
  const { id } = await params;
  const sp = await searchParams;
  const e = await getExpense(id);
  if (!e) notFound();
  const [cats, history, vendorRows] = await Promise.all([
    listCategories(true),
    historyFor([{ entity: "expense", ids: [e.id] }]),
    db.execute<{ vendor: string }>(sql`select vendor from ${expensesTable} where vendor <> '' group by vendor order by max(created_at) desc limit 30`),
  ]);
  const vendors = (("rows" in vendorRows ? vendorRows.rows : vendorRows) as { vendor: string }[]).map((v) => v.vendor);
  const bill = e.attachmentKey ? { href: `/api/admin/files/${e.attachmentKey}`, name: e.attachmentName ?? "Bill", type: e.attachmentType ?? "" } : null;
  return (
    <>
      <PageHead title={`${e.code} · ${formatINR(e.amount)}`} back={{ href: "/admin/expenses", label: "Expenses" }} />
      <Flash msg={sp.msg} err={sp.err} />
      {e.deletedAt && (
        <div className="mb-5 rounded-2xl bg-tomato/10 p-4 text-sm">
          <p className="font-semibold text-tomato">Removed by {e.deletedBy} — not counted in totals.</p>
          {e.deleteReason && <p>Reason: {e.deleteReason}</p>}
          {admin && (
            <form action={removeExpenseAction} className="mt-2">
              <input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="restore" />
              <SubmitButton className="btn btn-ghost min-h-10">Restore</SubmitButton>
            </form>
          )}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title={admin && !e.deletedAt ? "Edit" : "Details"}>
          {admin && !e.deletedAt ? (
            <form action={saveExpenseAction} className="space-y-4">
              <input type="hidden" name="id" value={e.id} />
              <ExpenseFields e={e} categories={cats.filter((c) => c.isActive || c.id === e.categoryId)} vendors={vendors} today={istParts().dateStr} bill={bill} />
              <SubmitButton className="btn btn-primary" pendingText="Saving…">Save changes</SubmitButton>
            </form>
          ) : (
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-ink-soft">Date: </dt><dd className="inline">{formatDateLong(e.date)}</dd></div>
              <div><dt className="inline text-ink-soft">Category: </dt><dd className="inline">{e.category?.name}</dd></div>
              <div><dt className="inline text-ink-soft">For: </dt><dd className="inline">{e.description}</dd></div>
              {e.vendor && <div><dt className="inline text-ink-soft">Shop: </dt><dd className="inline">{e.vendor}</dd></div>}
              <div><dt className="inline text-ink-soft">Paid by: </dt><dd className="inline">{EXPENSE_METHOD_LABELS[e.method] ?? e.method}{e.reference ? ` · ${e.reference}` : ""}</dd></div>
              {bill && <div><a href={bill.href} target="_blank" rel="noopener" className="font-semibold text-basil underline">View bill</a></div>}
            </dl>
          )}
        </Card>
        <aside className="space-y-6">
          {bill && bill.type.startsWith("image/") && (
            <Card title="Bill">
              <a href={bill.href} target="_blank" rel="noopener"><img src={bill.href} alt={`Bill for ${e.description}`} className="max-h-96 w-full rounded-xl object-contain" /></a>
            </Card>
          )}
          <p className="text-xs text-ink-soft">Added by {e.createdBy} · {new Date(e.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
          {admin && !e.deletedAt && (
            <Card title="Remove">
              <form action={removeExpenseAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={e.id} />
                <input name="reason" required minLength={3} placeholder="Reason (e.g. entered twice)" className="field" />
                <SubmitButton className="btn btn-ghost w-full text-tomato" confirm="Remove this expense from totals? It stays in the history and can be restored.">Remove expense</SubmitButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
      <Card title="History" className="mt-6"><History rows={history} /></Card>
    </>
  );
}
