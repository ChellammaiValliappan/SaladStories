import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db, deliveryAreas, deliverySlots } from "@/db";
import { formatTime } from "@/lib/time";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Frequently asked questions" };
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const [areas, slots, settings] = await Promise.all([
    db.select().from(deliveryAreas).where(eq(deliveryAreas.isActive, true)).orderBy(asc(deliveryAreas.sortOrder)),
    db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder)),
    getSettings(),
  ]);
  const faqs = [
    { q: "Where do you deliver?", a: `We currently deliver to ${areas.map((a) => `${a.name} (${a.pincodes})`).join(", ")}. Enter your PIN code at the top of the page to check.` },
    { q: "When do you deliver?", a: slots.length ? `Our delivery slots are ${slots.map((s) => `${s.name.toLowerCase()} (${formatTime(s.startTime)}–${formatTime(s.endTime)})`).join(", ")}. You choose your slot at checkout.` : "You choose a delivery slot at checkout." },
    { q: "Do I need an account to order?", a: "No. You can check out as a guest. An account lets you save addresses, reorder quickly and see all your orders in one place." },
    {
      q: "How do I pay?",
      a: settings.paymentMode === "RAZORPAY"
        ? "All orders are paid online through Razorpay — UPI (including Google Pay), credit and debit cards, net banking and wallets, depending on what's enabled."
        : "Pay with Google Pay. After you place your order, tap Pay with Google Pay (or scan the QR code), then enter the 12-digit UPI transaction ID shown in Google Pay. We confirm your order as soon as we see the payment.",
    },
    { q: "Can I customize my bowl?", a: "Yes. On each bowl's page you can change the portion size, add extra protein or toppings, pick a dressing and leave out ingredients you don't want. The price updates as you choose." },
    { q: "Which bowls are vegetarian?", a: "Every bowl carries the standard green (veg) or brown (non-veg) symbol. Bowls containing egg are labelled “Contains egg”." },
    { q: "Do you list nutrition information?", a: "We show nutrition figures only after they've been verified for our recipes. Until then, the bowl page says the figures are being verified." },
    { q: "Does the Hair Fall Control Bowl treat hair loss?", a: "No. It's a nutrient-focused bowl made with ingredients commonly associated with a balanced diet. It is a food, not a medicine, and doesn't prevent, treat or reverse hair loss." },
    { q: "How do coupons work?", a: "Enter the code in your cart or at checkout. Only one coupon can be used per order unless an offer says otherwise. The coupon counts as used once your payment is confirmed." },
    { q: "How can I track my order?", a: "After paying you'll get a link to your order page by email. It shows when your order is confirmed, being prepared, out for delivery and delivered." },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="text-5xl font-[800] text-basil-deep">Questions, answered</h1>
      <div className="mt-8 divide-y divide-line rounded-3xl border border-line bg-white">
        {faqs.map((f) => (
          <details key={f.q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
              {f.q}
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-basil-soft text-basil transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <p className="mt-3 text-ink-soft">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
