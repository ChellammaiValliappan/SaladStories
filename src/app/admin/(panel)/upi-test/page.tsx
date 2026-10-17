import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead } from "@/components/admin/ui";

export const metadata = { title: "Google Pay test" };

/**
 * Diagnostic: four ₹1 payment requests built slightly differently, so the owner
 * can see which one Google Pay accepts for their UPI ID.
 */
export default async function UpiTestPage() {
  await requireAdmin();
  const s = await getSettings();
  const base: Record<string, string> = { pa: s.upiId, pn: s.upiName, ...(s.upiQrExtras ?? {}) };
  const enc = (f: Record<string, string>) => new URLSearchParams(f).toString().replace(/\+/g, "%20");
  const variants = [
    { id: "A", label: "Exactly your Google Pay QR (no amount)", fields: { ...base } },
    { id: "B", label: "Your QR + amount ₹1", fields: { ...base, am: "1.00", cu: "INR" } },
    { id: "C", label: "Your QR + amount ₹1 + note", fields: { ...base, am: "1.00", cu: "INR", tn: "Salad Stories test" } },
    { id: "D", label: "Your QR + amount ₹1 + note + reference (shop style)", fields: { ...base, am: "1.00", cu: "INR", tn: "Salad Stories test", tr: `TEST${Date.now()}` } },
  ];
  const rows = await Promise.all(
    variants.map(async (v) => {
      const uri = `upi://pay?${enc(v.fields)}`;
      return { ...v, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 360 }) };
    }),
  );

  return (
    <>
      <PageHead title="Google Pay test" />
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        From <b>another person&rsquo;s phone</b>, scan each QR with Google Pay and try to pay ₹1 (you can stop before entering the PIN if you only want to see whether an error appears).
        Note which letters work. Each one also has a tap-to-pay link for testing on a phone. Payments go to <b>{s.upiId || "— no UPI ID set —"}</b>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-white p-4">
            <p className="font-display text-3xl font-[800]">{r.id}</p>
            <p className="mb-3 text-sm font-semibold">{r.label}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.qr} alt={`Test QR ${r.id}`} width={180} height={180} className="mx-auto" />
            <a href={r.uri} className="btn btn-ghost mt-3 min-h-10 w-full text-sm">Open in UPI app</a>
            <p className="mt-2 break-all text-[11px] text-ink-soft">{r.uri}</p>
          </div>
        ))}
      </div>
    </>
  );
}
