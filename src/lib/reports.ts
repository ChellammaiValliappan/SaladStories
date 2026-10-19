import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, orders } from "@/db";
import { formatINR } from "./money";
import { addressLine, emailConfigured, ownerContacts, sendEmail, sendOwnerWhatsApp, sendTelegram, sendTelegramDocument } from "./notify";
import { getSettings } from "./settings";
import { addDays, formatDateLong, istParts } from "./time";

const rupees = (p: number) => (p / 100).toFixed(2);
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://saladstories.netlify.app").replace(/\/$/, "");
const dayStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+05:30`);

/** CSV cell: quote everything and neutralise spreadsheet formulas (=, +, -, @). */
function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Orders placed between two IST dates (inclusive) as CSV; no dates = every order. */
export async function ordersCsv(from?: string, to?: string) {
  const where = from && to ? and(gte(orders.createdAt, dayStart(from)), lte(orders.createdAt, dayEnd(to))) : undefined;
  const rows = await db.query.orders.findMany({ where, with: { items: true }, orderBy: asc(orders.createdAt) });
  const header = [
    "Order number", "Placed at (IST)", "Delivery date", "Customer", "Phone", "Email", "Address", "PIN code", "Delivery slot",
    "Items", "Subtotal (₹)", "Discount (₹)", "Coupon", "Delivery fee (₹)", "Tax (₹)", "Total (₹)",
    "Payment status", "Payment method", "Payment reference", "Order status",
  ];
  const lines = rows.map((o) =>
    [
      o.orderNumber,
      new Date(o.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      o.deliveryDate, o.customerName, o.phone, o.email, addressLine(o.address), o.pincode, o.slotLabel,
      o.items.map((i) => `${i.quantity} x ${i.name}${i.summary ? ` (${i.summary})` : ""}`).join("; "),
      rupees(o.subtotal), rupees(o.discount), o.couponCode ?? "", rupees(o.deliveryFee), rupees(o.tax), rupees(o.total),
      o.paymentStatus, o.paymentMethod ?? "", o.razorpayPaymentId ?? o.upiRef ?? "", o.status,
    ].map(cell).join(","),
  );
  // BOM so Excel reads ₹ and Tamil names correctly
  return { csv: "﻿" + [header.map(cell).join(","), ...lines].join("\r\n"), count: rows.length, rows };
}

/** Plain-text end-of-day summary for one IST date. */
export async function dailySummaryText(date = istParts().dateStr) {
  const placed = await db.query.orders.findMany({
    where: and(gte(orders.createdAt, dayStart(date)), lte(orders.createdAt, dayEnd(date))),
  });
  const paid = placed.filter((o) => o.paymentStatus === "PAID");
  const unpaid = placed.filter((o) => o.status === "PENDING_PAYMENT" && o.paymentStatus === "CREATED");
  const toCheck = await db.query.orders.findMany({ where: eq(orders.paymentStatus, "VERIFYING") });

  const tomorrow = addDays(date, 1);
  const upcoming = await db.query.orders.findMany({
    where: and(eq(orders.deliveryDate, tomorrow), inArray(orders.status, ["PAID", "PREPARING"])),
    with: { items: true },
  });
  const dishes = new Map<string, number>();
  for (const o of upcoming) for (const i of o.items) dishes.set(i.name, (dishes.get(i.name) ?? 0) + i.quantity);
  const dishLines = [...dishes.entries()].sort((a, b) => b[1] - a[1]).map(([n, q]) => `  • ${q} × ${n}`);

  const revenue = paid.reduce((s, o) => s + o.total, 0);
  return [
    `📊 Salad Stories — ${formatDateLong(date)}`,
    "",
    `Paid orders: ${paid.length}`,
    `Sales: ${formatINR(revenue)}`,
    `Left unpaid: ${unpaid.length}`,
    toCheck.length
      ? `💰 Payments to check: ${toCheck.length} (${formatINR(toCheck.reduce((s, o) => s + o.total, 0))}) → ${siteUrl()}/admin/orders?status=verify`
      : "💰 Payments to check: none",
    "",
    `Tomorrow (${formatDateLong(tomorrow)}): ${upcoming.length} order${upcoming.length === 1 ? "" : "s"} to deliver`,
    ...dishLines,
    upcoming.length ? `Kitchen sheet → ${siteUrl()}/admin/kitchen?date=${tomorrow}` : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
}

const pre = (t: string) =>
  `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`;

export type SendResult = { telegram: boolean; email: boolean; whatsapp?: boolean };

export async function sendDailySummary(date = istParts().dateStr): Promise<SendResult> {
  const text = await dailySummaryText(date);
  const to = await ownerContacts();
  const [telegram, email, whatsapp] = await Promise.all([
    sendTelegram(to.chatId, text),
    sendEmail(to.email, `Salad Stories daily summary — ${formatDateLong(date)}`, text, pre(text)),
    sendOwnerWhatsApp(text),
  ]);
  return { telegram, email, whatsapp };
}

/** Every order ever placed, as a CSV file, to the owner's email and Telegram. */
export async function sendOrdersBackup(): Promise<SendResult & { count: number }> {
  const today = istParts().dateStr;
  const { csv, count, rows } = await ordersCsv();
  const paid = rows.filter((o) => o.paymentStatus === "PAID");
  const filename = `salad-stories-all-orders-${today}.csv`;
  const caption = `🗂 Weekly backup: all ${count} orders (${paid.length} paid, ${formatINR(paid.reduce((s, o) => s + o.total, 0))}). Open in Excel or Google Sheets.`;
  const to = await ownerContacts();
  const [telegram, email] = await Promise.all([
    sendTelegramDocument(to.chatId, filename, csv, caption),
    sendEmail(to.email, `Salad Stories orders backup — ${formatDateLong(today)}`, caption, pre(caption), [
      { filename, content: csv, contentType: "text/csv; charset=utf-8" },
    ]),
  ]);
  return { telegram, email, count };
}

/** What's set up, for the admin settings page. */
export async function alertChannels() {
  const to = await ownerContacts();
  const settings = await getSettings();
  const waNumber = (process.env.OWNER_WHATSAPP_NUMBER || settings.whatsapp).replace(/\D/g, "");
  return {
    whatsappKey: !!process.env.CALLMEBOT_APIKEY,
    whatsappNumber: waNumber,
    telegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
    telegramChat: !!to.chatId,
    email: emailConfigured() && !!to.email,
    ownerEmail: to.email,
  };
}
