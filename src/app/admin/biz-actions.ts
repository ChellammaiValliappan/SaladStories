"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import type { Actor } from "@/lib/biz/audit";
import { BizError, createCustomer, setCustomerManualStatus, updateCustomer } from "@/lib/biz/customers";
import { failPayment, recordPayment, recordRefund, reversePayment, verifyPayment } from "@/lib/biz/payments";
import { createAdminSubscription, startBeforePayment, type AdminSubscriptionInput } from "@/lib/biz/subscriptions";
import { istParts } from "@/lib/time";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const rupeesToPaise = (v: string) => Math.round(Number(v.replace(/[,₹\s]/g, "")) * 100);
const actorOf = (u: { id: string; name: string }): Actor => ({ id: u.id, name: u.name });

/** Back to a page with a message, or with the error text. */
function back(path: string, q: string): never {
  revalidatePath("/admin", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}
const fail = (path: string, e: unknown): never => {
  if (e instanceof BizError) back(path, `err=${encodeURIComponent(e.message)}`);
  if (e && typeof e === "object" && "issues" in e) back(path, `err=${encodeURIComponent((e as { issues: { message: string }[] }).issues[0]?.message ?? "Please check the form.")}`);
  throw e;
};

function customerFromForm(form: FormData) {
  return {
    name: str(form, "name"),
    phone: str(form, "phone"),
    whatsapp: str(form, "whatsapp"),
    email: str(form, "email"),
    address: {
      house: str(form, "house"),
      building: str(form, "building"),
      street: str(form, "street"),
      area: str(form, "area"),
      city: str(form, "city") || "Chennai",
      state: "Tamil Nadu",
      pincode: str(form, "pincode"),
      landmark: str(form, "landmark"),
      instructions: str(form, "deliveryNote"),
    },
    preferredSlotId: str(form, "preferredSlotId") || null,
    foodPreferences: str(form, "foodPreferences"),
    instructions: str(form, "instructions"),
    notes: str(form, "notes"),
  };
}

export async function saveCustomer(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const from = id ? `/admin/customers/${id}` : "/admin/customers/new";
  let savedId = id;
  try {
    const c = id ? await updateCustomer(id, customerFromForm(form), actorOf(me)) : await createCustomer(customerFromForm(form), actorOf(me));
    savedId = c.id;
  } catch (e) {
    fail(from, e);
  }
  // New customer → straight on to creating their plan.
  if (!id && str(form, "next") === "subscription") redirect(`/admin/subscriptions/new?customer=${savedId}`);
  back(`/admin/customers/${savedId}`, "msg=saved");
}

export async function setCustomerStatus(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const v = str(form, "status");
  await setCustomerManualStatus(id, v === "PAUSED" || v === "CANCELLED" ? v : null, str(form, "reason"), actorOf(me));
  back(`/admin/customers/${id}`, "msg=saved");
}

export async function recordPaymentAction(form: FormData) {
  const me = await requireAdmin();
  const returnTo = str(form, "returnTo") || "/admin/payments";
  try {
    const p = await recordPayment(
      {
        customerId: str(form, "customerId"),
        subscriptionId: str(form, "subscriptionId") || null,
        orderId: str(form, "orderId") || null,
        amount: rupeesToPaise(str(form, "amount")),
        method: str(form, "method") as never,
        reference: str(form, "reference") || null,
        paidAt: str(form, "paidAt") || istParts().dateStr,
        status: str(form, "status") === "PENDING_VERIFICATION" ? "PENDING_VERIFICATION" : "RECEIVED",
        note: str(form, "note"),
      },
      actorOf(me),
    );
    back(returnTo, `msg=${encodeURIComponent(`Payment ${p.receiptNo} recorded.`)}`);
  } catch (e) {
    fail(returnTo, e);
  }
}

export async function paymentStatusAction(form: FormData) {
  const me = await requireAdmin();
  const returnTo = str(form, "returnTo") || "/admin/payments";
  const id = str(form, "paymentId");
  const action = str(form, "action");
  try {
    if (action === "verify") await verifyPayment(id, actorOf(me));
    else if (action === "fail") await failPayment(id, str(form, "reason") || "Not found in the account", actorOf(me));
    else if (action === "reverse") await reversePayment(id, str(form, "reason"), actorOf(me));
  } catch (e) {
    fail(returnTo, e);
  }
  back(returnTo, `msg=${encodeURIComponent(action === "verify" ? "Payment marked as received." : action === "fail" ? "Payment marked as not received." : "Payment reversed.")}`);
}

export async function refundAction(form: FormData) {
  const me = await requireAdmin();
  const returnTo = str(form, "returnTo") || "/admin/payments";
  try {
    await recordRefund(
      {
        customerId: str(form, "customerId"),
        subscriptionId: str(form, "subscriptionId") || null,
        orderId: str(form, "orderId") || null,
        amount: rupeesToPaise(str(form, "amount")),
        method: str(form, "method") || "UPI",
        reference: str(form, "reference") || null,
        reason: str(form, "reason"),
      },
      actorOf(me),
    );
  } catch (e) {
    fail(returnTo, e);
  }
  back(returnTo, `msg=${encodeURIComponent("Refund recorded.")}`);
}

export async function createSubscriptionAction(input: AdminSubscriptionInput): Promise<{ error?: string; id?: string }> {
  const me = await requireAdmin();
  try {
    const sub = await createAdminSubscription(input, actorOf(me));
    revalidatePath("/admin", "layout");
    return { id: sub.id };
  } catch (e) {
    if (e instanceof BizError) return { error: e.message };
    if (e && typeof e === "object" && "issues" in e) return { error: (e as { issues: { message: string }[] }).issues[0]?.message };
    console.error("[create subscription]", e);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function startEarlyAction(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "subscriptionId");
  try {
    await startBeforePayment(id, str(form, "reason"), actorOf(me));
  } catch (e) {
    fail(`/admin/plans/${id}`, e);
  }
  back(`/admin/plans/${id}`, `msg=${encodeURIComponent("Plan started. Its days are now on the kitchen sheet.")}`);
}

// ---------- Skip / reschedule / pause ----------

export async function decideRequestAction(form: FormData) {
  const me = await requireStaff();
  const returnTo = str(form, "returnTo") || "/admin/requests";
  const { decideRequest } = await import("@/lib/biz/requests");
  try {
    const r = await decideRequest(
      str(form, "requestId"),
      { outcome: str(form, "outcome") as never, date: str(form, "date") || null, note: str(form, "note"), allowDuplicate: form.get("allowDuplicate") === "on" },
      actorOf(me),
    );
    back(returnTo, `msg=${encodeURIComponent(r.finalDate ? `Done — delivery on ${r.finalDate}.` : "Done — the day is forfeited.")}`);
  } catch (e) {
    fail(returnTo, e);
  }
}

export async function skipNowAction(form: FormData) {
  const me = await requireStaff();
  const sid = str(form, "subscriptionId");
  const returnTo = `/admin/plans/${sid}`;
  const { skipNow } = await import("@/lib/biz/requests");
  try {
    await skipNow(
      { subscriptionId: sid, dayId: str(form, "dayId"), reason: str(form, "reason"), outcome: str(form, "outcome") as never, date: str(form, "date") || null, allowDuplicate: form.get("allowDuplicate") === "on" },
      actorOf(me),
    );
  } catch (e) {
    fail(returnTo, e);
  }
  back(returnTo, `msg=${encodeURIComponent("Day updated. The change and reason are in the history.")}`);
}

export async function pauseAction(form: FormData) {
  const me = await requireStaff();
  const sid = str(form, "subscriptionId");
  const { pausePlan, resumePlan } = await import("@/lib/biz/requests");
  try {
    if (str(form, "action") === "resume") {
      const dates = await resumePlan(sid, str(form, "date"), actorOf(me));
      back(`/admin/plans/${sid}`, `msg=${encodeURIComponent(`Resumed — ${dates.length} deliveries back on the calendar.`)}`);
    }
    const n = await pausePlan(sid, str(form, "date"), str(form, "reason"), actorOf(me));
    back(`/admin/plans/${sid}`, `msg=${encodeURIComponent(`Paused — ${n} deliveries held off the kitchen sheet.`)}`);
  } catch (e) {
    fail(`/admin/plans/${sid}`, e);
  }
}

// ---------- Notifications ----------

export async function markReadAction(form: FormData) {
  await requireStaff();
  const { markRead } = await import("@/lib/biz/outbox");
  const id = str(form, "id");
  await markRead(id ? [id] : "all");
  revalidatePath("/admin", "layout");
  redirect(str(form, "returnTo") || "/admin/notifications");
}

export async function retryNotificationAction(form: FormData) {
  await requireAdmin();
  const { retryOne } = await import("@/lib/biz/outbox");
  await retryOne(str(form, "id"));
  back("/admin/notifications", "msg=Tried again.");
}

/** "Send tomorrow's list now" — runs the same job as 8 pm (sends only once per date). */
export async function runDailyNowAction(form: FormData) {
  await requireAdmin();
  const { runJob, sendTomorrowList } = await import("@/lib/biz/jobs");
  const date = str(form, "date");
  const r = await runJob(`daily-orders:${date}`, "daily-orders", () => sendTomorrowList(date));
  back("/admin/notifications", `msg=${encodeURIComponent(r.ran ? (r.error ? `Failed: ${r.error}` : "Sent.") : "Already sent for that date.")}`);
}

export async function saveBizSettings(form: FormData) {
  const me = await requireAdmin();
  const { db, storeSettings } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const { audit } = await import("@/lib/biz/audit");
  const time = str(form, "dailyListTime");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) back("/admin/settings", "err=Enter the time as HH:MM, e.g. 20:00");
  const patch = {
    dailyListTime: time,
    renewalReminderDays: Math.min(7, Math.max(1, Number(str(form, "renewalReminderDays")) || 1)),
    customerMessaging: form.get("customerMessaging") === "on",
  };
  await db.update(storeSettings).set(patch).where(eq(storeSettings.id, 1));
  await audit(db, "settings", "1", "alert settings changed", { after: patch, actor: actorOf(me) });
  back("/admin/settings", "msg=saved");
}

// ---------- Billing (M3) ----------

export async function voidInvoiceAction(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const { voidInvoice } = await import("@/lib/biz/invoices");
  try {
    await voidInvoice(id, str(form, "reason"), actorOf(me));
  } catch (e) {
    fail(`/admin/invoices/${id}`, e);
  }
  back(`/admin/invoices/${id}`, `msg=${encodeURIComponent("Invoice cancelled. It stays in the list, marked cancelled.")}`);
}

export async function reissueInvoiceAction(form: FormData) {
  const me = await requireAdmin();
  const returnTo = str(form, "returnTo") || "/admin/invoices";
  const { reissue } = await import("@/lib/biz/invoices");
  let id = "";
  try {
    id = (await reissue({ subscriptionId: str(form, "subscriptionId") || null, orderId: str(form, "orderId") || null }, actorOf(me))).id;
  } catch (e) {
    fail(returnTo, e);
  }
  back(`/admin/invoices/${id}`, `msg=${encodeURIComponent("Invoice issued.")}`);
}

export async function issueMissingInvoicesAction() {
  const me = await requireAdmin();
  const { issueMissingInvoices } = await import("@/lib/biz/invoices");
  const r = await issueMissingInvoices(actorOf(me));
  back("/admin/invoices", `msg=${encodeURIComponent(`Checked: ${r.plans} plans, ${r.orders} orders and ${r.creditNotes} refunds needed paperwork.`)}`);
}

export async function emailInvoiceAction(form: FormData) {
  const me = await requireAdmin();
  const id = str(form, "id");
  const { getInvoice, invoiceUrl } = await import("@/lib/biz/invoices");
  const { invoicePdf } = await import("@/lib/biz/invoice-pdf");
  const { sendEmail } = await import("@/lib/notify");
  const { audit } = await import("@/lib/biz/audit");
  const { db } = await import("@/db");
  const found = await getInvoice(id);
  if (!found) back("/admin/invoices", "err=Invoice not found.");
  const { inv, money, related } = found!;
  const to = str(form, "to") || inv.customer.email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) back(`/admin/invoices/${id}`, `err=${encodeURIComponent("Add the customer's email address first.")}`);
  const pdf = Buffer.from(await invoicePdf(inv, money.payments, related, money));
  const label = inv.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice";
  const url = await invoiceUrl(inv.publicToken);
  const text = `Hi ${inv.customer.name.split(" ")[0]},\n\nPlease find your ${inv.business.name} ${label.toLowerCase()} ${inv.number} attached.${money.due && inv.kind === "INVOICE" ? `\nBalance due: ₹${(money.due / 100).toFixed(2)}.` : ""}\n\nView it online: ${url}\n\nThank you!`;
  const ok = await sendEmail(to, `${label} ${inv.number} from ${inv.business.name}`, text, `<p>${text.replace(/\n/g, "<br>")}</p>`, [{ filename: `${inv.number.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }]);
  if (!ok) back(`/admin/invoices/${id}`, `err=${encodeURIComponent("Email isn't set up yet (or the mail server refused). Use the WhatsApp button or download the PDF instead.")}`);
  await audit(db, "invoice", id, "emailed", { after: { to }, actor: actorOf(me) });
  back(`/admin/invoices/${id}`, `msg=${encodeURIComponent(`Sent to ${to}.`)}`);
}

export async function saveBillingSettings(form: FormData) {
  const me = await requireAdmin();
  const { db, storeSettings } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const { audit } = await import("@/lib/biz/audit");
  const gstRegistered = form.get("gstRegistered") === "on";
  const gstin = str(form, "gstin").toUpperCase();
  if (gstRegistered && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) back("/admin/settings", `err=${encodeURIComponent("Enter your 15-character GSTIN, e.g. 33ABCDE1234F1Z5.")}`);
  const patch = {
    legalName: str(form, "legalName").slice(0, 120),
    gstRegistered,
    gstin: gstRegistered ? gstin : "",
    businessState: str(form, "businessState") || "Tamil Nadu",
    invoicePrefix: (str(form, "invoicePrefix") || "SS").replace(/[^A-Za-z0-9-]/g, "").slice(0, 8) || "SS",
    invoiceTerms: str(form, "invoiceTerms").slice(0, 500),
  };
  await db.update(storeSettings).set(patch).where(eq(storeSettings.id, 1));
  await audit(db, "settings", "1", "billing settings changed", { after: patch, actor: actorOf(me) });
  back("/admin/settings", "msg=saved");
}
