import type { Metadata } from "next";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { getSettings, whatsappLink } from "@/lib/settings";

export const metadata: Metadata = { title: "Contact us" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const s = await getSettings();
  const wa = whatsappLink(s.whatsapp, "Hi Salad Stories!");
  const options = [
    wa && { href: wa, icon: MessageCircle, title: "WhatsApp", text: "Fastest way to reach us about an order.", cta: "Chat on WhatsApp", ext: true },
    s.phone && { href: `tel:${s.phone}`, icon: Phone, title: "Call", text: s.phone, cta: "Call us" },
    s.email && { href: `mailto:${s.email}`, icon: Mail, title: "Email", text: s.email, cta: "Send an email" },
  ].filter(Boolean) as { href: string; icon: typeof Mail; title: string; text: string; cta: string; ext?: boolean }[];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10">
      <h1 className="text-5xl font-[800] text-basil-deep">Contact us</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-soft">Questions about an order, bulk orders for your office, or delivery to a new area? We'd love to hear from you.</p>
      {options.length === 0 ? (
        <p className="mt-8 rounded-3xl bg-crate p-6">Contact details will appear here soon.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {options.map((o) => (
            <a key={o.title} href={o.href} target={o.ext ? "_blank" : undefined} rel={o.ext ? "noopener" : undefined} className="panel flex flex-col gap-2 p-6 hover:border-basil">
              <o.icon className="h-7 w-7 text-basil" />
              <h2 className="text-xl font-bold">{o.title}</h2>
              <p className="break-all text-ink-soft">{o.text}</p>
              <span className="mt-auto pt-2 font-semibold text-basil">{o.cta}</span>
            </a>
          ))}
        </div>
      )}
      {s.address && <p className="mt-8 text-ink-soft"><span className="font-semibold text-ink">Kitchen:</span> {s.address}</p>}
    </div>
  );
}
