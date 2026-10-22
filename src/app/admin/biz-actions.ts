"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
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
