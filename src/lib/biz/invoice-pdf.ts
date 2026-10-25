import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { invoices, payments } from "@/db";
import { formatDateLong } from "../time";
import { INVOICE_STATUS_LABELS, taxSplit } from "./invoices";
import { METHOD_LABELS } from "./payments";

type Inv = typeof invoices.$inferSelect;
type Pay = typeof payments.$inferSelect;

const GREEN = rgb(0.12, 0.42, 0.23);
const INK = rgb(0.13, 0.13, 0.13);
const SOFT = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.85, 0.85, 0.82);

/** The built-in PDF fonts only cover Western characters; ₹ becomes "Rs." and anything else unsupported is dropped. */
const clean = (s: string) => s.replace(/₹\s?/g, "Rs. ").replace(/[^\n\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "");
export const rs = (p: number) => `Rs. ${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

class Writer {
  y: number;
  page: PDFPage;
  constructor(public doc: PDFDocument, public f: PDFFont, public b: PDFFont) {
    this.page = doc.addPage([595.28, 841.89]); // A4
    this.y = 800;
  }
  ensure(h: number) {
    if (this.y - h < 50) {
      this.page = this.doc.addPage([595.28, 841.89]);
      this.y = 800;
    }
  }
  text(t: string, x: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.b : this.f;
    const s = clean(t);
    const w = font.widthOfTextAtSize(s, size);
    this.page.drawText(s, { x: opts.right ? x - w : x, y: this.y, size, font, color: opts.color ?? INK });
  }
  para(t: string, x: number, width: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 10;
    for (const l of wrap(t, opts.bold ? this.b : this.f, size, width)) {
      this.ensure(size + 4);
      this.text(l, x, opts);
      this.y -= size + 4;
    }
  }
  rule(gap = 8) {
    this.page.drawLine({ start: { x: 45, y: this.y }, end: { x: 550, y: this.y }, thickness: 0.7, color: LINE });
    this.y -= gap;
  }
}

/** Invoice or credit note as an A4 PDF. */
export async function invoicePdf(inv: Inv, pays: Pay[] = [], related?: Inv | null, money?: { due: number; credited: number }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${inv.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice"} ${inv.number}`);
  doc.setAuthor(inv.business.name);
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));

  const title = inv.kind === "CREDIT_NOTE" ? "CREDIT NOTE" : inv.gstInvoice ? "TAX INVOICE" : "INVOICE";
  w.text(inv.business.name, 45, { size: 18, bold: true, color: GREEN });
  w.text(title, 550, { size: 14, bold: true, right: true });
  w.y -= 16;
  const top = w.y;
  w.para([inv.business.address, inv.business.phone && `Phone ${inv.business.phone}`, inv.business.email, inv.business.gstin && `GSTIN ${inv.business.gstin}`].filter(Boolean).join("\n"), 45, 280, { size: 9, color: SOFT });
  const leftEnd = w.y;
  w.y = top;
  w.text(`No. ${inv.number}`, 550, { size: 10, bold: true, right: true });
  w.y -= 13;
  w.text(`Date ${formatDateLong(inv.issueDate)}`, 550, { size: 9, right: true, color: SOFT });
  w.y -= 12;
  if (related) {
    w.text(`Against invoice ${related.number}`, 550, { size: 9, right: true, color: SOFT });
    w.y -= 12;
  }
  if (inv.status === "VOID") {
    w.text("CANCELLED", 550, { size: 11, bold: true, right: true, color: rgb(0.8, 0.1, 0.1) });
    w.y -= 12;
  } else if (inv.kind === "INVOICE") {
    w.text(`Status: ${INVOICE_STATUS_LABELS[inv.status] ?? inv.status}`, 550, { size: 9, right: true, color: SOFT });
    w.y -= 12;
  }
  w.y = Math.min(w.y, leftEnd) - 10;
  w.rule(16);

  w.text("BILL TO", 45, { size: 8, bold: true, color: SOFT });
  w.y -= 13;
  w.text(inv.customer.name, 45, { size: 11, bold: true });
  w.y -= 13;
  w.para([inv.customer.address, inv.customer.phone && `Phone ${inv.customer.phone}`, inv.customer.email, inv.customer.gstin && `GSTIN ${inv.customer.gstin}`].filter(Boolean).join("\n"), 45, 320, { size: 9, color: SOFT });
  w.y -= 8;

  // Lines
  w.ensure(40);
  w.page.drawRectangle({ x: 45, y: w.y - 5, width: 505, height: 18, color: rgb(0.94, 0.96, 0.93) });
  w.text("Description", 50, { size: 9, bold: true });
  w.text("Qty", 390, { size: 9, bold: true, right: true });
  w.text("Rate", 465, { size: 9, bold: true, right: true });
  w.text("Amount", 545, { size: 9, bold: true, right: true });
  w.y -= 20;
  for (const l of inv.lines) {
    const desc = wrap(l.description, w.f, 9.5, 300);
    w.ensure(desc.length * 13 + 6);
    const y0 = w.y;
    w.text(String(l.qty), 390, { size: 9.5, right: true });
    w.text(rs(l.rate), 465, { size: 9.5, right: true });
    w.text(rs(l.amount), 545, { size: 9.5, right: true });
    for (const d of desc) {
      w.text(d, 50, { size: 9.5 });
      w.y -= 13;
    }
    if (w.y === y0) w.y -= 13;
    w.y -= 3;
  }
  w.rule(14);

  // Totals
  const row = (label: string, value: string, bold = false) => {
    w.ensure(16);
    w.text(label, 465, { size: bold ? 11 : 9.5, bold, right: true, color: bold ? INK : SOFT });
    w.text(value, 545, { size: bold ? 11 : 9.5, bold, right: true });
    w.y -= bold ? 18 : 14;
  };
  row("Subtotal", rs(inv.subtotal));
  if (inv.discount) row("Discount", `- ${rs(inv.discount)}`);
  if (inv.deliveryFee) row("Delivery", rs(inv.deliveryFee));
  const split = taxSplit(inv);
  if (split.length) for (const t of split) row(t.label, rs(t.amount));
  else if (inv.tax) row(`${inv.taxLabel}${inv.taxPercent ? ` ${inv.taxPercent}%` : ""}`, rs(inv.tax));
  row(inv.kind === "CREDIT_NOTE" ? "Total credited" : "Total", rs(inv.total), true);

  // Payments
  const received = pays.filter((p) => p.status === "RECEIVED");
  if (inv.kind === "INVOICE" && received.length) {
    w.y -= 6;
    w.text("PAYMENTS", 45, { size: 8, bold: true, color: SOFT });
    w.y -= 14;
    for (const p of received) {
      w.ensure(14);
      w.text(`${p.receiptNo} · ${formatDateLong(p.paidAt.toISOString().slice(0, 10))} · ${METHOD_LABELS[p.method] ?? p.method}${p.reference ? ` ${p.reference}` : ""}${p.type === "REFUND" ? " (refund)" : ""}`, 50, { size: 9 });
      w.text(`${p.type === "REFUND" ? "- " : ""}${rs(p.amount)}`, 545, { size: 9, right: true });
      w.y -= 13;
    }
    const net = received.reduce((t, p) => t + (p.type === "REFUND" ? -p.amount : p.amount), 0);
    w.y -= 2;
    if (money?.credited) row("Credit notes", `- ${rs(money.credited)}`);
    row("Balance due", rs(money ? money.due : Math.max(0, inv.total - net)), true);
  }

  if (inv.notes) {
    w.y -= 4;
    w.para(inv.notes, 45, 505, { size: 9, color: SOFT });
  }
  if (inv.voidReason) w.para(`Cancelled: ${inv.voidReason}`, 45, 505, { size: 9, color: rgb(0.8, 0.1, 0.1) });
  w.y -= 10;
  w.para(inv.gstInvoice ? "This is a computer-generated invoice." : "This is a computer-generated invoice. Not a GST tax invoice.", 45, 505, { size: 8, color: SOFT });
  return doc.save();
}

/** Payment receipt (RCPT-0001) as an A4 PDF. */
export async function receiptPdf(p: Pay, ctx: { business: { name: string; address: string; phone: string; gstin?: string }; customerName: string; invoiceNumber?: string | null; forWhat: string }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${p.receiptNo}`);
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  w.text(ctx.business.name, 45, { size: 18, bold: true, color: GREEN });
  w.text(p.type === "REFUND" ? "REFUND RECEIPT" : "PAYMENT RECEIPT", 550, { size: 14, bold: true, right: true });
  w.y -= 16;
  w.para([ctx.business.address, ctx.business.phone && `Phone ${ctx.business.phone}`, ctx.business.gstin && `GSTIN ${ctx.business.gstin}`].filter(Boolean).join("\n"), 45, 300, { size: 9, color: SOFT });
  w.y -= 6;
  w.rule(18);
  const kv = (k: string, v: string) => {
    w.text(k, 45, { size: 10, color: SOFT });
    w.text(v, 200, { size: 10, bold: true });
    w.y -= 18;
  };
  kv("Receipt no.", p.receiptNo);
  kv("Date", formatDateLong(p.paidAt.toISOString().slice(0, 10)));
  kv(p.type === "REFUND" ? "Paid to" : "Received from", ctx.customerName);
  kv("Amount", rs(p.amount));
  kv("Method", `${METHOD_LABELS[p.method] ?? p.method}${p.reference ? ` · ${p.reference}` : ""}`);
  kv("For", ctx.forWhat);
  if (ctx.invoiceNumber) kv("Invoice", ctx.invoiceNumber);
  if (p.status !== "RECEIVED") kv("Status", p.status === "PENDING_VERIFICATION" ? "Waiting to be checked" : p.status.toLowerCase());
  if (p.note) {
    w.y -= 4;
    w.para(p.note, 45, 505, { size: 9, color: SOFT });
  }
  w.y -= 14;
  w.para("This is a computer-generated receipt.", 45, 505, { size: 8, color: SOFT });
  return doc.save();
}
