import { Fragment } from "react";
import type { invoices, payments } from "@/db";
import { formatINR } from "@/lib/money";
import { formatDateLong } from "@/lib/time";
import { INVOICE_STATUS_LABELS, taxSplit } from "@/lib/biz/invoices";
import { METHOD_LABELS } from "@/lib/biz/payments";

type Inv = typeof invoices.$inferSelect;
type Pay = typeof payments.$inferSelect;

/** The invoice as a page (screen and print). */
export function InvoiceView({ inv, pays, related, due, credited = 0, receiptHref }: { inv: Inv; pays: Pay[]; related?: Inv | null; due: number; credited?: number; receiptHref?: (p: Pay) => string }) {
  const credit = inv.kind === "CREDIT_NOTE";
  const split = taxSplit(inv);
  const received = pays.filter((p) => p.status === "RECEIVED");
  return (
    <article className="min-w-0 rounded-3xl border border-line bg-white p-4 text-sm sm:p-8 print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="font-display text-2xl font-[800] text-basil-deep">{inv.business.name}</p>
          <p className="whitespace-pre-line text-ink-soft">{[inv.business.address, inv.business.phone && `Phone ${inv.business.phone}`, inv.business.email, inv.business.gstin && `GSTIN ${inv.business.gstin}`].filter(Boolean).join("\n")}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tracking-wide">{credit ? "CREDIT NOTE" : inv.gstInvoice ? "TAX INVOICE" : "INVOICE"}</p>
          <p className="font-semibold">{inv.number}</p>
          <p className="text-ink-soft">{formatDateLong(inv.issueDate)}</p>
          {related && <p className="text-ink-soft">Against {related.number}</p>}
          {inv.status === "VOID" ? (
            <p className="mt-1 font-bold text-tomato">CANCELLED</p>
          ) : !credit ? (
            <p className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${inv.status === "PAID" ? "bg-basil-soft text-basil-deep" : "bg-mango/30"}`}>{INVOICE_STATUS_LABELS[inv.status]}</p>
          ) : null}
        </div>
      </header>

      <section className="py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Bill to</p>
        <p className="font-bold">{inv.customer.name}</p>
        <p className="whitespace-pre-line text-ink-soft">{[inv.customer.address, inv.customer.phone, inv.customer.email].filter(Boolean).join("\n")}</p>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] sm:text-sm">
          <thead>
            <tr className="bg-basil-soft/60 text-left">
              <th className="p-2 font-semibold">Description</th>
              <th className="whitespace-nowrap p-2 text-right font-semibold">Qty</th>
              <th className="whitespace-nowrap p-2 text-right font-semibold">Rate</th>
              <th className="whitespace-nowrap p-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="p-2">{l.description}</td>
                <td className="whitespace-nowrap p-2 text-right">{l.qty}</td>
                <td className="whitespace-nowrap p-2 text-right">{formatINR(l.rate)}</td>
                <td className="whitespace-nowrap p-2 text-right">{formatINR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        <dt className="text-ink-soft">Subtotal</dt><dd className="text-right">{formatINR(inv.subtotal)}</dd>
        {inv.discount > 0 && <><dt className="text-ink-soft">Discount</dt><dd className="text-right">− {formatINR(inv.discount)}</dd></>}
        {inv.deliveryFee > 0 && <><dt className="text-ink-soft">Delivery</dt><dd className="text-right">{formatINR(inv.deliveryFee)}</dd></>}
        {split.length
          ? split.map((t) => <Fragment key={t.label}><dt className="text-ink-soft">{t.label}</dt><dd className="text-right">{formatINR(t.amount)}</dd></Fragment>)
          : inv.tax > 0 && <><dt className="text-ink-soft">{inv.taxLabel}{inv.taxPercent ? ` ${inv.taxPercent}%` : ""}</dt><dd className="text-right">{formatINR(inv.tax)}</dd></>}
        <dt className="border-t border-line pt-1 font-bold">{credit ? "Total credited" : "Total"}</dt>
        <dd className="border-t border-line pt-1 text-right font-bold">{formatINR(inv.total)}</dd>
        {!credit && credited > 0 && <><dt className="text-ink-soft">Credit notes</dt><dd className="text-right">− {formatINR(credited)}</dd></>}
        {!credit && inv.status !== "VOID" && (
          <>
            <dt className="font-bold">Balance due</dt>
            <dd className={`text-right font-bold ${due ? "text-tomato" : "text-basil"}`}>{formatINR(due)}</dd>
          </>
        )}
      </dl>

      {!credit && received.length > 0 && (
        <section className="mt-5">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Payments</p>
          <ul className="divide-y divide-line">
            {received.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {p.receiptNo} · {formatDateLong(p.paidAt.toISOString().slice(0, 10))} · {METHOD_LABELS[p.method] ?? p.method}
                  {p.reference ? ` ${p.reference}` : ""}
                  {p.type === "REFUND" ? " (refund)" : ""}
                </span>
                <span className="flex items-center gap-3">
                  <b>{p.type === "REFUND" ? "− " : ""}{formatINR(p.amount)}</b>
                  {receiptHref && <a href={receiptHref(p)} className="text-xs font-semibold text-basil underline print:hidden">Receipt</a>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inv.notes && <p className="mt-4 text-ink-soft">{inv.notes}</p>}
      {inv.voidReason && <p className="mt-2 font-semibold text-tomato">Cancelled: {inv.voidReason}</p>}
      <p className="mt-6 text-xs text-ink-soft">{inv.gstInvoice ? "Computer-generated invoice." : "Computer-generated invoice. Not a GST tax invoice."}</p>
    </article>
  );
}
