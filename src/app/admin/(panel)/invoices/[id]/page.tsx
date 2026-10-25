import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getInvoice, invoiceUrl } from "@/lib/biz/invoices";
import { historyFor } from "@/lib/biz/history";
import { formatINR } from "@/lib/money";
import { Card, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { History } from "@/components/admin/biz/History";
import { InvoiceView } from "@/components/biz/InvoiceView";
import { PrintButton } from "@/components/biz/PrintButton";
import { emailInvoiceAction, voidInvoiceAction } from "../../../biz-actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const found = await getInvoice(id);
  if (!found) notFound();
  const { inv, money, related } = found;
  const url = await invoiceUrl(inv.publicToken);
  const label = inv.kind === "CREDIT_NOTE" ? "credit note" : "invoice";
  const waText = `Hi ${inv.customer.name.split(" ")[0]}, here is your ${inv.business.name} ${label} ${inv.number}${inv.kind === "INVOICE" && money.due ? ` (balance due ${formatINR(money.due)})` : ""}: ${url}`;
  const wa = inv.customer.phone ? `https://wa.me/91${inv.customer.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(waText)}` : null;
  const history = await historyFor([{ entity: "invoice", ids: [inv.id] }]);
  const back = inv.subscriptionId ? { href: `/admin/plans/${inv.subscriptionId}`, label: "Plan" } : inv.orderId ? { href: `/admin/orders/${inv.orderId}`, label: "Order" } : { href: "/admin/invoices", label: "Invoices" };
  return (
    <>
      <div className="print:hidden">
        <PageHead title={`${inv.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice"} ${inv.number}`} back={back} />
        <Flash msg={sp.msg} err={sp.err} />
        <div className="mb-4 flex flex-wrap gap-2">
          <a href={`/api/admin/invoices/${inv.id}/pdf`} className="btn btn-primary">Download PDF</a>
          {wa && inv.status !== "VOID" && <a href={wa} target="_blank" rel="noopener" className="btn btn-ghost">Send on WhatsApp</a>}
          <PrintButton />
          {inv.customerId && <Link href={`/admin/customers/${inv.customerId}`} className="btn btn-ghost">Customer</Link>}
        </div>
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <InvoiceView inv={inv} pays={money.payments} related={related} due={money.due} credited={money.credited} receiptHref={(p) => `/api/admin/receipts/${p.id}/pdf`} />
        <aside className="space-y-6 print:hidden">
          {money.creditNotes.length > 0 && (
            <Card title="Credit notes">
              <ul className="space-y-1 text-sm">
                {money.creditNotes.map((c) => <li key={c.id}><Link href={`/admin/invoices/${c.id}`} className="font-semibold text-basil underline">{c.number}</Link> · {formatINR(c.total)}</li>)}
              </ul>
            </Card>
          )}
          {inv.status !== "VOID" && (
            <Card title="Email">
              <form action={emailInvoiceAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={inv.id} />
                <label className="label" htmlFor="to">Send the PDF to</label>
                <input id="to" name="to" type="email" defaultValue={inv.customer.email} placeholder="customer@email.com" className="field" />
                <SubmitButton className="btn btn-ghost w-full" pendingText="Sending…">Email {label}</SubmitButton>
              </form>
            </Card>
          )}
          <Card title="Customer link">
            <p className="mb-2 text-sm text-ink-soft">A private page where the customer can see and download this {label}{inv.kind === "INVOICE" ? " and pay what's due by UPI" : ""}.</p>
            <input readOnly value={url} className="field text-xs" aria-label="Customer link" />
          </Card>
          {inv.kind === "INVOICE" && inv.status !== "VOID" && (
            <Card title="Cancel invoice">
              <form action={voidInvoiceAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={inv.id} />
                <input name="reason" required minLength={3} placeholder="Reason (e.g. wrong plan)" className="field" />
                <SubmitButton className="btn btn-ghost w-full text-tomato" confirm="Cancel this invoice? Its number stays used and it stays in the list as cancelled.">Cancel invoice</SubmitButton>
                <p className="text-xs text-ink-soft">Only while nothing has been paid. Once money is received, record a refund instead — that issues a credit note.</p>
              </form>
            </Card>
          )}
        </aside>
      </div>
      <Card title="History" className="mt-6 print:hidden"><History rows={history} /></Card>
    </>
  );
}
