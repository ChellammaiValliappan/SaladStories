import "server-only";
import { and, asc, gte, inArray, isNull, lte } from "drizzle-orm";
import { customers, db, expenses, invoices, orders, payments, subscriptions } from "@/db";
import { addressLine } from "../notify";
import { EXPENSE_METHOD_LABELS } from "./expenses";
import { financeSummary } from "./finance";
import { INVOICE_STATUS_LABELS } from "./invoices";
import { METHOD_LABELS } from "./payments";

/** A table to export: column headers + rows. Money columns are numbers in rupees. */
export type Sheet = { name: string; columns: { header: string; money?: boolean; width?: number }[]; rows: (string | number | null)[][] };
export const EXPORT_TYPES = ["payments", "invoices", "expenses", "customers", "plans", "orders", "finance"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

const rs = (p: number) => Math.round(p) / 100;
const ist = (d: Date | string | null) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");
const start = (d: string) => new Date(`${d}T00:00:00+05:30`);
const end = (d: string) => new Date(`${d}T23:59:59.999+05:30`);

async function paymentsSheet(from: string, to: string): Promise<Sheet> {
  const rows = await db.select().from(payments).where(and(gte(payments.paidAt, start(from)), lte(payments.paidAt, end(to)))).orderBy(asc(payments.paidAt));
  const names = await nameMap(rows.map((r) => r.customerId));
  const invs = await numberMap(rows.map((r) => r.invoiceId));
  return {
    name: "Payments",
    columns: [{ header: "Receipt" }, { header: "Date (IST)", width: 20 }, { header: "Customer", width: 22 }, { header: "Type" }, { header: "Amount (₹)", money: true }, { header: "Method" }, { header: "Reference", width: 16 }, { header: "Status" }, { header: "Invoice", width: 16 }, { header: "Recorded by" }, { header: "Checked by" }, { header: "Note", width: 30 }],
    rows: rows.map((p) => [p.receiptNo, ist(p.paidAt), names.get(p.customerId ?? "") ?? "", p.type === "REFUND" ? "Refund" : "Payment", rs(p.type === "REFUND" ? -p.amount : p.amount), METHOD_LABELS[p.method] ?? p.method, p.reference ?? "", p.status, invs.get(p.invoiceId ?? "") ?? "", p.recordedBy, p.verifiedBy ?? "", p.note]),
  };
}

async function invoicesSheet(from: string, to: string): Promise<Sheet> {
  const rows = await db.select().from(invoices).where(and(gte(invoices.issueDate, from), lte(invoices.issueDate, to))).orderBy(asc(invoices.issueDate), asc(invoices.number));
  const related = await numberMap(rows.map((r) => r.relatedInvoiceId));
  return {
    name: "Invoices",
    columns: [{ header: "Number", width: 16 }, { header: "Type" }, { header: "Date" }, { header: "Customer", width: 22 }, { header: "Phone" }, { header: "Against", width: 16 }, { header: "Description", width: 40 }, { header: "Subtotal (₹)", money: true }, { header: "Discount (₹)", money: true }, { header: "Delivery (₹)", money: true }, { header: "Tax (₹)", money: true }, { header: "Total (₹)", money: true }, { header: "Status" }, { header: "GSTIN on invoice" }],
    rows: rows.map((i) => {
      const sign = i.kind === "CREDIT_NOTE" ? -1 : 1;
      return [i.number, i.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice", i.issueDate, i.customer.name, i.customer.phone, related.get(i.relatedInvoiceId ?? "") ?? "", i.lines.map((l) => l.description).join("; "), rs(sign * i.subtotal), rs(i.discount), rs(i.deliveryFee), rs(sign * i.tax), rs(sign * i.total), i.status === "VOID" ? "Cancelled" : i.kind === "CREDIT_NOTE" ? "Issued" : INVOICE_STATUS_LABELS[i.status], i.business.gstin ?? ""];
    }),
  };
}

async function expensesSheet(from: string, to: string): Promise<Sheet> {
  const rows = await db.query.expenses.findMany({ where: and(gte(expenses.date, from), lte(expenses.date, to), isNull(expenses.deletedAt)), with: { category: true }, orderBy: [asc(expenses.date), asc(expenses.code)] });
  return {
    name: "Expenses",
    columns: [{ header: "Code" }, { header: "Date" }, { header: "Category", width: 22 }, { header: "Description", width: 36 }, { header: "Shop / vendor", width: 20 }, { header: "Amount (₹)", money: true }, { header: "Paid by" }, { header: "Reference" }, { header: "Bill attached" }, { header: "Added by" }, { header: "Notes", width: 30 }],
    rows: rows.map((e) => [e.code, e.date, e.category?.name ?? "", e.description, e.vendor, rs(e.amount), EXPENSE_METHOD_LABELS[e.method] ?? e.method, e.reference, e.attachmentKey ? "Yes" : "No", e.createdBy, e.notes]),
  };
}

async function customersSheet(): Promise<Sheet> {
  const rows = await db.select().from(customers).orderBy(asc(customers.code));
  return {
    name: "Customers",
    columns: [{ header: "Code" }, { header: "Name", width: 22 }, { header: "Phone" }, { header: "WhatsApp" }, { header: "Email", width: 24 }, { header: "Address", width: 40 }, { header: "Food preferences", width: 24 }, { header: "Notes", width: 30 }, { header: "Added (IST)", width: 20 }],
    rows: rows.map((c) => [c.code, c.name, c.phone, c.whatsapp, c.email, c.address?.house ? addressLine(c.address as never) : "", c.foodPreferences, c.notes, ist(c.createdAt)]),
  };
}

async function plansSheet(from: string, to: string): Promise<Sheet> {
  const rows = await db.select().from(subscriptions).where(and(gte(subscriptions.createdAt, start(from)), lte(subscriptions.createdAt, end(to)))).orderBy(asc(subscriptions.createdAt));
  return {
    name: "Plans",
    columns: [{ header: "Plan no.", width: 14 }, { header: "Customer", width: 22 }, { header: "Phone" }, { header: "Plan" }, { header: "Days" }, { header: "Bowls / day" }, { header: "Start" }, { header: "End" }, { header: "Total (₹)", money: true }, { header: "Status" }, { header: "Renewal" }, { header: "From" }, { header: "Created (IST)", width: 20 }],
    rows: rows.map((s) => [s.number, s.customerName, s.phone, s.planName, s.daysTotal, s.quantity, s.startDate, s.actualEndDate ?? s.endDate, rs(s.total), s.status, s.renewalStatus, s.source === "ADMIN" ? "Admin" : "Website", ist(s.createdAt)]),
  };
}

async function ordersSheet(from: string, to: string): Promise<Sheet> {
  const rows = await db.query.orders.findMany({ where: and(gte(orders.createdAt, start(from)), lte(orders.createdAt, end(to)), inArray(orders.kind, ["ORDER", "PLAN"])), with: { items: true }, orderBy: asc(orders.createdAt) });
  return {
    name: "Orders",
    columns: [{ header: "Order", width: 18 }, { header: "Placed (IST)", width: 20 }, { header: "Delivery" }, { header: "Customer", width: 22 }, { header: "Phone" }, { header: "Items", width: 40 }, { header: "Subtotal (₹)", money: true }, { header: "Discount (₹)", money: true }, { header: "Delivery (₹)", money: true }, { header: "Tax (₹)", money: true }, { header: "Total (₹)", money: true }, { header: "Payment" }, { header: "Status" }],
    rows: rows.map((o) => [o.orderNumber, ist(o.createdAt), o.deliveryDate, o.customerName, o.phone, o.items.map((i) => `${i.quantity} x ${i.name}`).join("; "), rs(o.subtotal), rs(o.discount), rs(o.deliveryFee), rs(o.tax), rs(o.total), o.paymentStatus, o.status]),
  };
}

async function financeSheets(from: string, to: string): Promise<Sheet[]> {
  const f = await financeSummary(from, to);
  const summary: Sheet = {
    name: "Summary",
    columns: [{ header: "Measure", width: 38 }, { header: "Value", width: 16 }, { header: "Notes", width: 50 }],
    rows: [
      ["Period", `${from} to ${to}`, ""],
      ["Sales invoiced (₹)", rs(f.sales.invoiced), `${f.sales.invoices} invoices`],
      ["Credit notes (₹)", rs(-f.sales.credited), `${f.sales.creditNotes} credit notes`],
      ["Net sales (₹)", rs(f.sales.net), "Invoiced minus credit notes"],
      ["Tax in net sales (₹)", rs(f.sales.tax), ""],
      ["Net sales before tax (₹)", rs(f.sales.exTax), ""],
      ["Money received (₹)", rs(f.collections.received), `${f.collections.payments} payments`],
      ["Refunds paid (₹)", rs(-f.collections.refunded), ""],
      ["Net collections (₹)", rs(f.collections.net), ""],
      ["Expenses (₹)", rs(-f.expenses.total), ""],
      ["Operating profit, estimate (₹)", rs(f.profit), "Net sales before tax minus expenses"],
      ["Cash flow (₹)", rs(f.cashFlow), "Net collections minus expenses"],
      ["Still to collect, all time (₹)", rs(f.outstanding.amount), `${f.outstanding.invoices} invoices not fully paid`],
      ["Paid in advance, not yet delivered (₹)", rs(f.advances.amount), `${f.advances.daysOwed} plan deliveries owed`],
      ["Active plans", f.subscribers.active, `${f.subscribers.customers} customers`],
      ["Plans started in period", f.subscribers.started, ""],
      ["Plans completed in period", f.subscribers.completed, ""],
      ["Renewals in period", f.subscribers.renewed, f.subscribers.renewalRate == null ? "" : `${f.subscribers.renewalRate}% of completed`],
    ],
  };
  const daily: Sheet = {
    name: "By day",
    columns: [{ header: "Date" }, { header: "Collected (₹)", money: true }, { header: "Expenses (₹)", money: true }, { header: "Net (₹)", money: true }],
    rows: f.daily.map((d) => [d.date, rs(d.collected), rs(d.spent), rs(d.collected - d.spent)]),
  };
  const cats: Sheet = { name: "Expenses by category", columns: [{ header: "Category", width: 30 }, { header: "Entries" }, { header: "Total (₹)", money: true }], rows: f.expenses.byCategory.map((c) => [c.name, c.count, rs(c.total)]) };
  return [summary, daily, cats, await invoicesSheet(from, to), await paymentsSheet(from, to), await expensesSheet(from, to)];
}

export async function exportSheets(type: ExportType, from: string, to: string): Promise<Sheet[]> {
  switch (type) {
    case "payments": return [await paymentsSheet(from, to)];
    case "invoices": return [await invoicesSheet(from, to)];
    case "expenses": return [await expensesSheet(from, to)];
    case "customers": return [await customersSheet()];
    case "plans": return [await plansSheet(from, to)];
    case "orders": return [await ordersSheet(from, to)];
    case "finance": return financeSheets(from, to);
  }
}

/** CSV cell: quote everything and neutralise spreadsheet formulas. */
function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(sheets: Sheet[]) {
  const parts = sheets.map((s) => [sheets.length > 1 ? cell(s.name) : null, s.columns.map((c) => cell(c.header)).join(","), ...s.rows.map((r) => r.map(cell).join(","))].filter((x) => x !== null).join("\r\n"));
  return "﻿" + parts.join("\r\n\r\n");
}

export async function toXlsx(sheets: Sheet[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Salad Stories";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 2), style: c.money ? { numFmt: "#,##0.00" } : {} }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1EFD9" } };
    // Text that looks like a formula is stored as plain text.
    for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v)));
    if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function nameMap(ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return new Map<string, string>();
  const rows = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function numberMap(ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return new Map<string, string>();
  const rows = await db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(inArray(invoices.id, list));
  return new Map(rows.map((r) => [r.id, r.number]));
}

