import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { INVOICE_STATUS_LABELS, listInvoices } from "@/lib/biz/invoices";
import { formatINR } from "@/lib/money";
import { formatDateLong } from "@/lib/time";
import { Empty, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { issueMissingInvoicesAction } from "../../biz-actions";

export const metadata = { title: "Invoices" };

const FILTERS = [
  { id: "", label: "All" },
  { id: "unpaid", label: "Not fully paid" },
  { id: "PAID", label: "Paid" },
  { id: "cn", label: "Credit notes" },
  { id: "VOID", label: "Cancelled" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; msg?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await listInvoices({ q: sp.q, kind: sp.f === "cn" ? "CREDIT_NOTE" : undefined, status: sp.f && sp.f !== "cn" ? sp.f : undefined });
  const qs = (f: string) => `/admin/invoices?${new URLSearchParams({ ...(f ? { f } : {}), ...(sp.q ? { q: sp.q } : {}) })}`;
  return (
    <>
      <PageHead title="Invoices">
        <form action={issueMissingInvoicesAction}>
          <SubmitButton className="btn btn-ghost min-h-11 text-sm" pendingText="Checking…">Issue any missing</SubmitButton>
        </form>
      </PageHead>
      <Flash msg={sp.msg} err={sp.err} />
      <p className="mb-4 text-sm text-ink-soft">
        Invoices are issued automatically: plans you create here get one straight away; website plans and orders get one when their payment arrives. A refund issues a credit note. Numbers never repeat or skip.
      </p>
      <form className="mb-3 flex gap-2">
        {sp.f && <input type="hidden" name="f" value={sp.f} />}
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={sp.q} placeholder="Invoice number, name or phone" className="field min-h-10 flex-1 py-1.5" />
        <button className="btn btn-ghost min-h-10">Search</button>
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link key={f.id} href={qs(f.id)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${(sp.f ?? "") === f.id ? "border-basil bg-basil text-white" : "border-line bg-white"}`}>{f.label}</Link>
        ))}
      </div>
      {rows.length === 0 ? <Empty>No invoices here yet.</Empty> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {rows.map((i) => (
            <li key={i.id}>
              <Link href={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-paper sm:p-4">
                <div className="min-w-0">
                  <p className="font-bold">{i.number} <span className="font-normal text-ink-soft">· {i.customer.name}</span></p>
                  <p className="truncate text-sm text-ink-soft">{formatDateLong(i.issueDate)} · {i.kind === "CREDIT_NOTE" ? "Credit note" : i.lines[0]?.description.split(" · ")[0]}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold">{i.kind === "CREDIT_NOTE" ? "− " : ""}{formatINR(i.total)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${i.status === "PAID" ? "bg-basil-soft text-basil-deep" : i.status === "VOID" ? "bg-crate text-ink-soft" : i.kind === "CREDIT_NOTE" ? "bg-crate" : "bg-mango/30"}`}>
                    {i.kind === "CREDIT_NOTE" ? "Credit note" : INVOICE_STATUS_LABELS[i.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
