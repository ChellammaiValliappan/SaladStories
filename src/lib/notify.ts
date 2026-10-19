import "server-only";
import nodemailer from "nodemailer";
import { formatINR } from "./money";
import type { AddressData } from "@/db";
import { getSettings } from "./settings";
import { db, orderEvents } from "@/db";
import { pushToTeam } from "./push";

type OrderForNotify = {
  orderNumber: string;
  trackingToken: string;
  customerName: string;
  phone: string;
  email: string;
  address: AddressData;
  slotLabel: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  couponCode: string | null;
  status: string;
  id?: string;
  upiRef?: string | null;
  items: { name: string; quantity: number; summary: string; lineTotal: number }[];
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Waiting for payment",
  PAID: "Order received",
  PREPARING: "Being prepared",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_SUBMITTED: "Payment reported",
  ALERT_FAILED: "WhatsApp alert not delivered",
  REFUNDED: "Refunded",
};

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const trackingUrl = (o: { orderNumber: string; trackingToken: string }) =>
  `${siteUrl()}/order/${o.orderNumber}?t=${o.trackingToken}`;

export function addressLine(a: AddressData) {
  return [a.house, a.building, a.street, a.area, a.landmark && `near ${a.landmark}`, a.city, a.pincode]
    .filter(Boolean)
    .join(", ");
}

function itemsText(o: OrderForNotify) {
  return o.items
    .map((i) => `• ${i.quantity} × ${i.name}${i.summary ? ` (${i.summary})` : ""} — ${formatINR(i.lineTotal)}`)
    .join("\n");
}

// ---------------- Email ----------------

function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export const emailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

type Attachment = { filename: string; content: string; contentType?: string };

/** Returns true when the email was handed to the mail server. */
export async function sendEmail(to: string, subject: string, text: string, html: string, attachments?: Attachment[]) {
  const t = mailer();
  if (!t || !to) {
    console.info(`[email skipped — SMTP not configured] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    await t.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text, html, attachments });
    return true;
  } catch (err) {
    console.error("[email failed]", err);
    return false;
  }
}

/** Where owner alerts and reports go. */
export async function ownerContacts() {
  const settings = await getSettings();
  return {
    email: process.env.OWNER_EMAIL || settings.email,
    chatId: process.env.TELEGRAM_CHAT_ID || settings.telegramChatId,
  };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function emailHtml(title: string, body: string, o: OrderForNotify) {
  const rows = o.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${i.quantity} × <b>${esc(i.name)}</b>${i.summary ? `<br><span style="color:#5b6b5f;font-size:13px">${esc(i.summary)}</span>` : ""}</td><td align="right" style="padding:6px 0">${formatINR(i.lineTotal)}</td></tr>`,
    )
    .join("");
  const money = (label: string, v: number, neg = false) =>
    v ? `<tr><td style="color:#5b6b5f">${label}</td><td align="right">${neg ? "−" : ""}${formatINR(v)}</td></tr>` : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#18301f">
  <div style="background:#1d6b3a;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0"><h2 style="margin:0">Salad Stories</h2></div>
  <div style="border:1px solid #e3dccb;border-top:0;padding:24px;border-radius:0 0 16px 16px">
  <h3 style="margin-top:0">${esc(title)}</h3><p>${body}</p>
  <p><b>Order ${o.orderNumber}</b><br>Delivery: ${esc(o.slotLabel)}<br>${esc(addressLine(o.address))}</p>
  <table width="100%" style="border-collapse:collapse;font-size:14px">${rows}
  <tr><td colspan="2"><hr style="border:0;border-top:1px solid #e3dccb"></td></tr>
  ${money("Subtotal", o.subtotal)}${money(`Discount${o.couponCode ? ` (${o.couponCode})` : ""}`, o.discount, true)}
  ${money("Delivery", o.deliveryFee)}${money("Tax", o.tax)}
  <tr><td><b>Total paid</b></td><td align="right"><b>${formatINR(o.total)}</b></td></tr></table>
  <p><a href="${trackingUrl(o)}" style="display:inline-block;background:#1d6b3a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Track your order</a></p>
  </div></div>`;
}

// ---------------- WhatsApp (Meta Cloud API) ----------------

async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const digits = to.replace(/\D/g, "");
  if (!token || !phoneId || !digits) {
    console.info(`[whatsapp skipped — not configured] to=${digits}`);
    return;
  }
  const template = process.env.WHATSAPP_OWNER_TEMPLATE;
  // Free-form text only reaches numbers that messaged the business in the last 24h.
  // For guaranteed delivery create an approved template and set WHATSAPP_OWNER_TEMPLATE
  // (one body variable: {{1}} = the order summary).
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: digits,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: body.replace(/\n+/g, " | ").slice(0, 1000) }] }],
        },
      }
    : { messaging_product: "whatsapp", to: digits, type: "text", text: { body } };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("[whatsapp failed]", res.status, await res.text());
  } catch (err) {
    console.error("[whatsapp failed]", err);
  }
}

/**
 * Owner alerts on WhatsApp. Free route: CallMeBot (https://www.callmebot.com) sends
 * text messages to your own number once you've sent it the activation message —
 * set CALLMEBOT_APIKEY. Otherwise falls back to the paid Meta Cloud API if set up.
 */
export async function sendOwnerWhatsApp(text: string) {
  const key = process.env.CALLMEBOT_APIKEY;
  const settings = await getSettings();
  const phone = (process.env.OWNER_WHATSAPP_NUMBER || settings.whatsapp).replace(/\D/g, "");
  if (!phone) return false;
  if (!key) {
    if (!process.env.WHATSAPP_TOKEN) return false;
    await sendWhatsAppText(phone, text);
    return true;
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent("+" + phone)}&text=${encodeURIComponent(text.slice(0, 1500))}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    const ok = res.ok && !/error|invalid|not (allowed|activated)/i.test(body.slice(0, 500));
    if (!ok) console.error("[whatsapp/callmebot failed]", res.status, body.slice(0, 300));
    return ok;
  } catch (err) {
    console.error("[whatsapp/callmebot failed]", err);
    return false;
  }
}

// ---------------- Telegram (free) ----------------

/** Returns true when Telegram accepted the message. */
export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("[telegram failed]", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[telegram failed]", err);
    return false;
  }
}

/** Sends a file (e.g. the orders backup CSV) to the owner's Telegram. */
export async function sendTelegramDocument(chatId: string, filename: string, content: string, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1000));
    form.append("document", new Blob([content], { type: "text/csv" }), filename);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
    if (!res.ok) console.error("[telegram file failed]", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[telegram file failed]", err);
    return false;
  }
}

// ---------------- Owner alerts ----------------

const orderLink = (o: OrderForNotify) => (o.id ? `${siteUrl()}/admin/orders/${o.id}` : `${siteUrl()}/admin/orders`);

/**
 * WhatsApp goes through a third party (CallMeBot), so it gets a short message with
 * no customer details. Phone notifications come from the site itself. If WhatsApp
 * fails, the order is flagged in the admin so nothing is missed.
 */
async function alertOwner(o: OrderForNotify, kind: "order" | "payment") {
  const amount = formatINR(o.total);
  const short =
    kind === "order"
      ? `🥗 New order ${o.orderNumber} · ${amount} · ${o.slotLabel}\nOpen: ${orderLink(o)}`
      : `💰 Payment to check: ${o.orderNumber} · ${amount}\nOpen: ${orderLink(o)}`;
  const [whatsapp] = await Promise.all([
    sendOwnerWhatsApp(short),
    pushToTeam({
      title: kind === "order" ? `New order · ${amount}` : `Payment to check · ${amount}`,
      body: `${o.orderNumber} · ${o.slotLabel}${kind === "payment" ? " · tap to confirm" : ""}`,
      url: o.id ? `/admin/orders/${o.id}` : "/admin/orders",
      tag: `${kind}-${o.orderNumber}`,
    }).catch((err) => {
      console.error("[push failed]", err);
      return 0;
    }),
  ]);
  if (!whatsapp && process.env.CALLMEBOT_APIKEY && o.id) {
    await db
      .insert(orderEvents)
      .values({ orderId: o.id, status: "ALERT_FAILED", note: `WhatsApp alert for this ${kind === "order" ? "order" : "payment"} didn't go through` })
      .catch(() => {});
  }
}

// ---------------- Public API ----------------

export async function notifyNewOrder(o: OrderForNotify) {
  const settings = await getSettings();
  const ownerEmail = process.env.OWNER_EMAIL || settings.email;
  const summary = `🥗 New paid order ${o.orderNumber}
${o.customerName} · ${o.phone}
${o.slotLabel}
${addressLine(o.address)}

${itemsText(o)}

Total: ${formatINR(o.total)}${o.couponCode ? ` (coupon ${o.couponCode})` : ""}`;

  await Promise.all([
    sendEmail(
      ownerEmail,
      `New order ${o.orderNumber} — ${formatINR(o.total)}`,
      summary,
      emailHtml("New paid order", esc(`${o.customerName} (${o.phone}, ${o.email})`), o),
    ),
    alertOwner(o, "order"),
    sendTelegram(process.env.TELEGRAM_CHAT_ID || settings.telegramChatId, `${summary}\n\nOpen: ${orderLink(o)}`),
    sendEmail(
      o.email,
      `Your Salad Stories order ${o.orderNumber} is confirmed`,
      `Hi ${o.customerName}, thanks for your order!\n\n${itemsText(o)}\n\nTotal paid: ${formatINR(o.total)}\nDelivery: ${o.slotLabel}\nTrack it: ${trackingUrl(o)}`,
      emailHtml(`Thanks, ${o.customerName.split(" ")[0]}!`, "Your payment is confirmed and our kitchen has your order.", o),
    ),
  ]);
}

export async function notifyStatusChange(o: OrderForNotify) {
  const label = STATUS_LABELS[o.status] ?? o.status;
  await sendEmail(
    o.email,
    `Order ${o.orderNumber}: ${label}`,
    `Hi ${o.customerName}, your order ${o.orderNumber} is now: ${label}.\nTrack it: ${trackingUrl(o)}`,
    emailHtml(`Your order is ${label.toLowerCase()}`, `Here's the latest on order ${o.orderNumber}.`, o),
  );
}

/** UPI mode: the customer says they paid — ask the owner to check GPay. */
export async function notifyPaymentToVerify(o: OrderForNotify) {
  const settings = await getSettings();
  const ownerEmail = process.env.OWNER_EMAIL || settings.email;
  const link = o.id ? `${siteUrl()}/admin/orders/${o.id}` : `${siteUrl()}/admin/orders?status=verify`;
  const text = `💰 Check payment for ${o.orderNumber}
${formatINR(o.total)} from ${o.customerName} (${o.phone})
UPI transaction ID: ${o.upiRef ?? "—"}
${o.slotLabel}

${itemsText(o)}

Open your Google Pay / bank app, find this payment, then confirm it:
${link}`;
  await Promise.all([
    sendEmail(ownerEmail, `Check payment: ${o.orderNumber} — ${formatINR(o.total)}`, text,
      emailHtml("Payment to check", `${esc(o.customerName)} says they paid ${formatINR(o.total)} by UPI. Transaction ID: <b>${esc(o.upiRef ?? "—")}</b>. Check your Google Pay or bank app, then confirm it in the admin: <a href="${link}">${link}</a>`, o)),
    sendTelegram(process.env.TELEGRAM_CHAT_ID || settings.telegramChatId, text),
    alertOwner(o, "payment"),
    sendEmail(o.email, `We've got your order ${o.orderNumber} — confirming payment`,
      `Hi ${o.customerName}, thanks! We're checking your UPI payment (transaction ID ${o.upiRef ?? "—"}) and will confirm your order shortly.\nTrack it: ${trackingUrl(o)}`,
      emailHtml(`Thanks, ${o.customerName.split(" ")[0]}!`, "We're checking your Google Pay payment and will confirm your order shortly.", o)),
  ]);
}

/** UPI mode: the owner couldn't find the payment. */
export async function notifyPaymentRejected(o: OrderForNotify, reason?: string) {
  await sendEmail(
    o.email,
    `Payment not found for order ${o.orderNumber}`,
    `Hi ${o.customerName}, we couldn't find your UPI payment for order ${o.orderNumber}${reason ? ` (${reason})` : ""}. If money left your account, reply to this email with a screenshot. Otherwise you can pay again here: ${trackingUrl(o)}`,
    emailHtml("We couldn't find your payment", `${reason ? `${esc(reason)}. ` : ""}If money left your account, reply with a screenshot of the Google Pay payment. Otherwise you can pay again from your order page.`, o),
  );
}
