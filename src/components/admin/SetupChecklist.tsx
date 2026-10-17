import Link from "next/link";
import { and, eq, inArray, like } from "drizzle-orm";
import { Check, Circle } from "lucide-react";
import { coupons, db, products } from "@/db";
import { getSettings } from "@/lib/settings";
import { razorpayConfigured } from "@/lib/razorpay";
import { UPI_ID_RE } from "@/lib/upi";

/** "What's left before launch" — each item ticks itself off when done. */
export async function SetupChecklist() {
  const s = await getSettings();
  const [illustrated, unverified, testCoupons] = await Promise.all([
    db.select({ id: products.id }).from(products).where(and(eq(products.status, "PUBLISHED"), like(products.image, "/images/bowls/%"))),
    db.select({ id: products.id }).from(products).where(and(eq(products.status, "PUBLISHED"), eq(products.nutritionVerified, false))),
    db.select({ id: coupons.id }).from(coupons).where(and(eq(coupons.isActive, true), inArray(coupons.code, ["WELCOME10", "HEALTH50", "FREEDELIVERY"]))),
  ]);
  const live = process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_");
  type Item = { done: boolean; label: string; href?: string; hint?: string; optional?: boolean };
  const upi = s.paymentMode !== "RAZORPAY";
  const paymentItems: Item[] = upi
    ? [{ done: UPI_ID_RE.test(s.upiId) && (s.upiIdType === "BUSINESS" || Object.keys(s.upiQrExtras ?? {}).length > 0), label: "Paste your Google Pay QR text in Settings", href: "/admin/settings", hint: "Google Pay accepts payment links built from your real QR." }]
    : [
        { done: razorpayConfigured(), label: "Connect Razorpay (test keys are fine to start)", href: "/admin/settings", hint: "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your hosting settings." },
        { done: !!process.env.RAZORPAY_WEBHOOK_SECRET, label: "Add the Razorpay webhook", hint: "So orders are confirmed even if a customer closes the payment window." },
      ];
  const items: Item[] = [
    ...paymentItems,
    { done: !!(process.env.SMTP_HOST && process.env.SMTP_USER), label: "Turn on order emails", hint: "Gmail app password works — see docs/SETUP.md." },
    { done: !!(process.env.TELEGRAM_BOT_TOKEN && (s.telegramChatId || process.env.TELEGRAM_CHAT_ID)) || !!process.env.WHATSAPP_TOKEN, label: "Get order alerts on your phone (Telegram is free)", href: "/admin/settings" },
    { done: !!(s.phone || s.whatsapp), label: "Add your phone / WhatsApp number", href: "/admin/settings" },
    { done: illustrated.length === 0, label: `Upload real photos (${illustrated.length} item${illustrated.length === 1 ? "" : "s"} still use drawings)`, href: "/admin/products" },
    { done: unverified.length === 0, label: `Enter verified nutrition (${unverified.length} item${unverified.length === 1 ? "" : "s"} hidden)`, href: "/admin/products", optional: true },
    { done: testCoupons.length === 0, label: "Review the sample coupons (WELCOME10, HEALTH50, FREEDELIVERY)", href: "/admin/coupons" },
    ...(upi ? [] : [{ done: !!live, label: "Switch Razorpay to live keys after KYC", hint: "Replace rzp_test_ keys with rzp_live_ keys in your hosting settings." }]),
  ];
  const left = items.filter((i) => !i.done);
  if (left.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">Before you launch</h2>
      <p className="mb-3 text-sm text-ink-soft">{items.length - left.length} of {items.length} done. This list disappears when everything is ticked.</p>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((i) => (
          <li key={i.label} className="flex gap-2.5 text-sm">
            {i.done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-basil" strokeWidth={3} /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-crate-deep" />}
            <span className={i.done ? "text-ink-soft line-through" : ""}>
              {i.href && !i.done ? <Link href={i.href} className="font-semibold text-basil hover:underline">{i.label}</Link> : <span className="font-semibold">{i.label}</span>}
              {i.optional && !i.done && <span className="text-ink-soft"> (optional)</span>}
              {i.hint && !i.done && <span className="block text-xs text-ink-soft">{i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
