import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvoiceByToken } from "@/lib/biz/invoices";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { upiUri } from "@/lib/upi";
import { InvoiceView } from "@/components/biz/InvoiceView";
import { PrintButton } from "@/components/biz/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

/** The customer's private invoice link (shared by WhatsApp or email). */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getInvoiceByToken(token);
  if (!found || found.inv.status === "VOID") notFound();
  const { inv, money, related } = found;
  const s = await getSettings();
  const payLink =
    inv.kind === "INVOICE" && money.due > 0 && s.upiId
      ? upiUri({ upiId: s.upiId, payeeName: s.upiName || s.businessName, amount: money.due, orderNumber: inv.number, merchantCode: s.upiMerchantCode, qrExtras: s.upiQrExtras })
      : null;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <a href={`/invoice/${token}/pdf`} className="btn btn-primary">Download PDF</a>
        <PrintButton />
      </div>
      {payLink && (
        <div className="mb-4 rounded-2xl bg-mango/25 p-4 print:hidden">
          <p className="font-bold">Balance due: {formatINR(money.due)}</p>
          <p className="text-sm">Pay by UPI from your phone, then message us the 12-digit UPI reference so we can confirm it.</p>
          <a href={payLink} className="btn btn-primary mt-2">Pay {formatINR(money.due)} by UPI</a>
        </div>
      )}
      <InvoiceView inv={inv} pays={money.payments} related={related} due={money.due} credited={money.credited} receiptHref={(p) => `/invoice/${token}/receipt/${p.id}`} />
    </main>
  );
}
