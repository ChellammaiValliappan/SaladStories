import { EXPENSE_METHODS, EXPENSE_METHOD_LABELS } from "@/lib/biz/expenses";
import { BillInput } from "./BillInput";

type Expense = { date: string; categoryId: string | null; description: string; vendor: string; amount: number; method: string; reference: string; notes: string };

/** Fields shared by "Add expense" and the expense edit page. */
export function ExpenseFields({ e, categories, vendors, today, bill }: { e?: Expense | null; categories: { id: string; name: string }[]; vendors: string[]; today: string; bill?: { href: string; name: string; type: string } | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="ex-amount">Amount (₹)</label>
        <input id="ex-amount" name="amount" inputMode="decimal" required defaultValue={e ? (e.amount / 100).toFixed(2) : ""} placeholder="0.00" className="field text-lg font-bold" />
      </div>
      <div>
        <label className="label" htmlFor="ex-date">Date</label>
        <input id="ex-date" name="date" type="date" required max={today} defaultValue={e?.date ?? today} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="ex-cat">Category</label>
        <select id="ex-cat" name="categoryId" required defaultValue={e?.categoryId ?? ""} className="field">
          <option value="" disabled>Choose…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="ex-method">Paid by</label>
        <select id="ex-method" name="method" defaultValue={e?.method ?? "UPI"} className="field">
          {EXPENSE_METHODS.map((m) => <option key={m} value={m}>{EXPENSE_METHOD_LABELS[m]}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ex-desc">What was it for</label>
        <input id="ex-desc" name="description" required minLength={2} maxLength={200} defaultValue={e?.description ?? ""} placeholder="e.g. Lettuce, cucumber and tomatoes for the week" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="ex-vendor">Shop / vendor</label>
        <input id="ex-vendor" name="vendor" list="ex-vendors" maxLength={120} defaultValue={e?.vendor ?? ""} placeholder="e.g. Koyambedu market" className="field" />
        <datalist id="ex-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor="ex-ref">UPI / bill reference (optional)</label>
        <input id="ex-ref" name="reference" maxLength={80} defaultValue={e?.reference ?? ""} className="field" />
      </div>
      <div className="sm:col-span-2">
        <BillInput current={bill} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ex-notes">Notes (optional)</label>
        <input id="ex-notes" name="notes" maxLength={500} defaultValue={e?.notes ?? ""} className="field" />
      </div>
    </div>
  );
}
