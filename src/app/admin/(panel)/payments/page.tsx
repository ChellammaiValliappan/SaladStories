import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { customers, db, payments } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ledgerTotals } from "@/lib/biz/core";
import { formatINR } from "@/lib/money";
import { addDays, istParts } from "@/lib/time";
import { Empty, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { PaymentsList } from "@/components/admin/biz/PaymentsList";

export const metadata = { title: "Payments" };

const FILTERS = [
  { id: "", label: "All" },
  { id: "verify", label: "To verify" },
  { id: "received", label: "Received" },
  { id: "refunds", label: "Refunds" },
  { id: "failed", label: "Not received / reversed" },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ f?: string; from?: string; to?: string; msg?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = istParts().dateStr;
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = valid(sp.from) ?? `${today.slice(0, 8)}01`;
  const to = valid(sp.to) ?? today;
  const conds: SQL[] = [gte(payments.paidAt, new Date(`${from}T00:00:00+05:30`)), lte(payments.paidAt, new Date(`${to}T23:59:59.999+05:30`))];
  if (sp.f === "verify") conds.push(eq(payments.status, "PENDING_VERIFICATION"));
  if (sp.f === "received") conds.push(and(eq(payments.status, "RECEIVED"), eq(payments.type, "PAYMENT"))!);
  if (sp.f === "refunds") conds.push(eq(payments.type, "REFUND"));
  if (sp.f === "failed") conds.push(inArray(payments.status, ["FAILED", "REVERSED"]));
  // "To verify" ignores the date range — anything waiting matters.
  const where = sp.f === "verify" ? eq(payments.status, "PENDING_VERIFICATION") : and(...conds);
  const rows = await db.select().from(payments).where(where).orderBy(desc(payments.paidAt)).limit(500);
  const custIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean) as string[])];
  const custs = custIds.length ? await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)) : [];
  const names = Object.fromEntries(custs.map((c) => [c.id, { name: c.name, href: `/admin/customers/${c.id}` }]));
  const t = ledgerTotals(rows);
  const qs = (f: string) => `/admin/payments?${new URLSearchParams({ ...(f ? { f } : {}), from, to })}`;

  return (
    <>
      <PageHead title="Payments">
        <a href="https://dashboard.razorpay.com/app/payments" target="_blank" rel="noopener" className="btn btn-ghost min-h-11 text-sm">Razorpay dashboard</a>
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <p className="mb-4 text-sm text-ink-soft">
        Every rupee in and out, in order. Money counts only once it&apos;s marked <b>received</b>. Rows are never deleted — a mistake is reversed with a reason.
        To record a payment, open the <Link href="/admin/customers" className="font-semibold text-basil underline">customer</Link> or their plan.
      </p>
      <form className="mb-3 flex flex-wrap items-end gap-2">
        {sp.f && <input type="hidden" name="f" value={sp.f} />}
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} className="field min-h-10 py-1.5" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} className="field min-h-10 py-1.5" /></div>
        <button className="btn btn-ghost min-h-10">Show</button>
        <Link href={`/admin/payments?${new URLSearchParams({ from: addDays(today, -6), to: today })}`} className="btn btn-ghost min-h-10 text-sm">Last 7 days</Link>
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link key={f.id} href={qs(f.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${(sp.f ?? "") === f.id ? "bg-basil text-white" : "bg-white ring-1 ring-line"}`}>{f.label}</Link>
        ))}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          { k: "Received", v: formatINR(t.received) },
          { k: "Refunded", v: formatINR(t.refunded) },
          { k: "Net collected", v: formatINR(t.net) },
          { k: "Waiting to verify", v: formatINR(t.toVerify) },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-line bg-white p-4"><p className="text-sm font-semibold text-ink-soft">{x.k}</p><p className="font-display text-xl font-[800]">{x.v}</p></div>
        ))}
      </div>
      {rows.length === 0 ? <Empty>No payments here.</Empty> : (
        <div className="rounded-2xl border border-line bg-white px-4">
          <PaymentsList rows={rows} returnTo={qs(sp.f ?? "")} canEdit names={names} />
        </div>
      )}
    </>
  );
}
