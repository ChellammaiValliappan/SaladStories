import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { addresses, db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { CheckoutFlow } from "@/components/CheckoutFlow";
import { razorpayConfigured, simulatorEnabled } from "@/lib/razorpay";
import { getSettings } from "@/lib/settings";
import { methodsSentence } from "@/lib/payment-methods";
import { UPI_ID_RE } from "@/lib/upi";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const upi = settings.paymentMode === "UPI";
  const saved = user
    ? await db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), asc(addresses.label))
    : [];
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-5xl font-[800] text-basil-deep">Checkout</h1>
      <CheckoutFlow
        user={user ? { name: user.name, email: user.email ?? "", phone: user.phone ?? "" } : null}
        savedAddresses={saved.map((a) => ({ id: a.id, label: a.label, fullName: a.fullName, phone: a.phone, house: a.house, building: a.building, street: a.street, area: a.area, city: a.city, state: a.state, pincode: a.pincode, landmark: a.landmark, instructions: a.instructions }))}
        paymentsReady={upi ? UPI_ID_RE.test(settings.upiId) : razorpayConfigured() || simulatorEnabled()}
        simulator={!upi && simulatorEnabled()}
        upi={upi}
        methodsText={methodsSentence(settings.paymentMethods) || "UPI"}
      />
    </div>
  );
}
