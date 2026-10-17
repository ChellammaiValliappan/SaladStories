import type { Metadata } from "next";
import { ContentPage } from "@/components/ContentPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPolicy() {
  return (
    <ContentPage title="Privacy policy" intro="This explains what personal information Salad Stories collects and how we use it.">
      <h2>What we collect</h2>
      <ul>
        <li>Your name, mobile number, email address and delivery address, so we can deliver your order and contact you about it.</li>
        <li>Your order history and saved addresses if you create an account.</li>
        <li>Payments are made in your own UPI app (such as Google Pay) or on Razorpay's secure checkout. We only keep the transaction reference — never your UPI PIN, card numbers or bank passwords.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To prepare, deliver and support your orders, and to send order confirmations and status updates.</li>
        <li>To prevent fraud and misuse of coupons.</li>
        <li>To tell you when we start delivering to your area, if you asked us to.</li>
      </ul>
      <h2>Who we share it with</h2>
      <p>We share only what's needed with the services that help us run Salad Stories: UPI / Razorpay (payments), our email and WhatsApp messaging providers, our hosting provider and our delivery staff. We don't sell your personal information.</p>
      <h2>Your choices</h2>
      <p>You can update your profile and addresses from your account, or ask us to delete your account and personal data by contacting us. We may keep order records where the law requires it, for example for tax purposes.</p>
      <h2>Cookies</h2>
      <p>We use a sign-in cookie to keep you logged in and your browser's storage to remember your cart. We don't use advertising cookies.</p>
    </ContentPage>
  );
}
