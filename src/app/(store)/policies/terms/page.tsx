import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function Terms() {
  return (
    <ContentPage title="Terms and conditions" intro="By placing an order on this website you agree to these terms.">
      <h2>Orders</h2>
      <p>An order is confirmed only after your payment succeeds and you receive an order confirmation. We may decline or cancel an order — with a full refund — if an item becomes unavailable, the address is outside our delivery area, or we suspect misuse.</p>
      <h2>Prices and charges</h2>
      <p>Prices are in Indian Rupees. Delivery fees and applicable taxes are shown before you pay. We never add charges that weren't shown to you at checkout.</p>
      <h2>Food information</h2>
      <p>We list ingredients and allergen information for each bowl. Our kitchen handles nuts, dairy, eggs, gluten and meat, so we can't guarantee any bowl is free from traces of allergens. Nutrition figures are shown only once verified and may vary slightly between servings.</p>
      <p>Our bowls are food products and are not intended to diagnose, treat, cure or prevent any disease or condition, including hair loss.</p>
      <h2>Coupons</h2>
      <p>Coupons are subject to their stated conditions, can't be exchanged for cash, and only one coupon applies per order unless stated otherwise. We may withdraw an offer at any time.</p>
      <h2>Liability</h2>
      <p>To the extent allowed by law, our liability for any order is limited to the amount you paid for it.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India, and courts in Chennai, Tamil Nadu have jurisdiction.</p>
    </ContentPage>
  );
}
