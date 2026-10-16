import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";

export const metadata: Metadata = { title: "Cancellation and refund policy" };

export default function RefundPolicy() {
  return (
    <ContentPage title="Cancellation and refund policy" intro="Because every bowl is made fresh for your slot, cancellations depend on how close it is to delivery.">
      <h2>Cancelling an order</h2>
      <ul>
        <li>You can cancel for a full refund up to 2 hours before your delivery slot starts. Message us on WhatsApp or call us with your order number.</li>
        <li>Within 2 hours of your slot, we may already be preparing your food, so we can't offer a refund for cancellations.</li>
        <li>If we have to cancel your order (for example, an ingredient runs out or we can't deliver), you'll receive a full refund.</li>
      </ul>
      <h2>Problems with your order</h2>
      <p>If something is missing, wrong or not up to standard, contact us within 2 hours of delivery with your order number and a photo. We'll replace the item or refund it.</p>
      <h2>How refunds are paid</h2>
      <p>Refunds go back to the original payment method through Razorpay. They usually reach you within 5–7 working days, depending on your bank.</p>
      <h2>Coupons</h2>
      <p>If an order that used a coupon is cancelled and refunded, the coupon may be restored at our discretion.</p>
    </ContentPage>
  );
}
