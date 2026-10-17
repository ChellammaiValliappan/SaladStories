import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { db, deliveryAreas } from "@/db";
import { getSettings, whatsappLink } from "@/lib/settings";
import { Logo } from "./Logo";

export async function Footer() {
  const [s, areas] = await Promise.all([
    getSettings(),
    db.select().from(deliveryAreas).where(eq(deliveryAreas.isActive, true)).orderBy(asc(deliveryAreas.sortOrder)),
  ]);
  const wa = whatsappLink(s.whatsapp, "Hi Salad Stories! I'd like to know more.");
  const socials = [
    { href: s.instagram, label: "Instagram" },
    { href: s.facebook, label: "Facebook" },
    { href: s.youtube, label: "YouTube" },
  ].filter((x) => x.href);

  return (
    <footer className="mt-16 bg-basil-deep text-white/85">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo light />
          <p className="max-w-xs text-sm text-white/70">Protein-focused salads and bowls, made fresh in Chennai and delivered to your door.</p>
          {wa && (
            <a href={wa} target="_blank" rel="noopener" className="btn btn-sprout min-h-11 text-sm">
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Get in touch</h2>
          <ul className="space-y-2.5 text-sm">
            {s.phone && (
              <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-sprout" /><a href={`tel:${s.phone}`} className="hover:text-white">{s.phone}</a></li>
            )}
            {s.email && (
              <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-sprout" /><a href={`mailto:${s.email}`} className="break-all hover:text-white">{s.email}</a></li>
            )}
            {s.address && <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-sprout" />{s.address}</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">We deliver to</h2>
          <ul className="space-y-1.5 text-sm">
            {areas.map((a) => (
              <li key={a.id}>{a.name} <span className="text-white/50">{a.pincodes}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Good to know</h2>
          <ul className="space-y-1.5 text-sm">
            <li><Link href="/faq" className="hover:text-white">FAQs</Link></li>
            <li><Link href="/policies/delivery" className="hover:text-white">Delivery policy</Link></li>
            <li><Link href="/policies/refund" className="hover:text-white">Cancellation & refunds</Link></li>
            <li><Link href="/policies/privacy" className="hover:text-white">Privacy policy</Link></li>
            <li><Link href="/policies/terms" className="hover:text-white">Terms & conditions</Link></li>
          </ul>
          {socials.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {socials.map((x) => (
                <a key={x.label} href={x.href} target="_blank" rel="noopener" className="rounded-full border border-white/25 px-3 py-1.5 text-sm hover:border-white">
                  {x.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} {s.businessName}. {s.paymentMode === "RAZORPAY" ? "Payments secured by Razorpay." : "Pay easily with Google Pay (UPI)."}
      </div>
    </footer>
  );
}
