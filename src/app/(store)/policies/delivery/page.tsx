import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db, deliveryAreas, deliverySlots } from "@/db";
import { ContentPage } from "@/components/ContentPage";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { formatTime } from "@/lib/time";

export const metadata: Metadata = { title: "Delivery policy" };
export const dynamic = "force-dynamic";

export default async function DeliveryPolicy() {
  const [s, areas, slots] = await Promise.all([
    getSettings(),
    db.select().from(deliveryAreas).where(eq(deliveryAreas.isActive, true)).orderBy(asc(deliveryAreas.sortOrder)),
    db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true)).orderBy(asc(deliverySlots.sortOrder)),
  ]);
  return (
    <ContentPage title="Delivery policy">
      <h2>Where we deliver</h2>
      <ul>{areas.map((a) => <li key={a.id}>{a.name} — PIN {a.pincodes}{a.fee != null ? ` (delivery fee ${formatINR(a.fee)})` : ""}</li>)}</ul>
      <p>We check your PIN code at checkout. If we don't deliver to you yet, you can leave your number and we'll let you know when we do.</p>
      <h2>Delivery slots</h2>
      <ul>{slots.map((x) => <li key={x.id}>{x.name}: {formatTime(x.startTime)} – {formatTime(x.endTime)}. Order at least {Math.round(x.cutoffMinutes / 6) / 10} hours before the slot starts.</li>)}</ul>
      <p>Each slot takes a limited number of orders so every bowl reaches you fresh. Full or closed slots can't be selected.</p>
      <h2>Delivery charges</h2>
      <p>
        The standard delivery fee is {formatINR(s.flatDeliveryFee)}
        {s.freeDeliveryAbove ? `, and delivery is free on orders of ${formatINR(s.freeDeliveryAbove)} or more` : ""}.
        {s.minOrderValue ? ` The minimum order value is ${formatINR(s.minOrderValue)}.` : ""} You'll always see the exact fee before you pay.
      </p>
      <h2>If you're not available</h2>
      <p>Our delivery partner will call the mobile number on your order. If we can't reach you within 10 minutes of arriving, the order may be marked as delivered or returned, and a refund may not be possible because food is perishable.</p>
      <h2>Delays</h2>
      <p>Weather, traffic or other events outside our control can occasionally delay deliveries. We'll message you if your order is running late.</p>
    </ContentPage>
  );
}
