import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "../../actions";
import { Card, Check, Field, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { PasswordForm } from "@/components/PasswordForm";
import { PAYMENT_METHODS, parseMethods } from "@/lib/payment-methods";
import { razorpayConfigured } from "@/lib/razorpay";

export const metadata = { title: "Settings" };
const r = (p: number | null) => (p == null ? "" : p / 100);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const disabled = s.disabledCouponTypes.split(",");
  return (
    <>
      <PageHead title="Settings" />
      <Flash msg={sp.msg} err={sp.err} />
      <form action={saveSettings} className="space-y-6">
        <Card title="Ordering">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Check label="Pause all orders" name="deliveryPaused" defaultChecked={s.deliveryPaused} hint="Customers can browse but not check out." />
              <Check label="Allow same-day orders" name="sameDayOrders" defaultChecked={s.sameDayOrders} />
            </div>
            <Field label="Message while paused" name="pausedMessage" defaultValue={s.pausedMessage} />
            <Field label="Days ahead customers can order" name="advanceDays" type="number" defaultValue={s.advanceDays} />
            <Field label="Announcement bar" name="announcement" defaultValue={s.announcement} hint="Shown at the top of every page. Leave blank to hide." />
          </div>
        </Card>
        <Card title="Charges">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Standard delivery fee (₹)" name="flatDeliveryFee" type="number" step="0.01" defaultValue={r(s.flatDeliveryFee)} />
            <Field label="Free delivery above (₹)" name="freeDeliveryAbove" type="number" step="0.01" defaultValue={r(s.freeDeliveryAbove)} hint="Blank = never free." />
            <Field label="Minimum order (₹)" name="minOrderValue" type="number" step="0.01" defaultValue={r(s.minOrderValue)} />
            <Field label="Tax name" name="taxLabel" defaultValue={s.taxLabel} />
            <Field label="Tax rate (%)" name="taxPercent" type="number" step="0.01" defaultValue={s.taxPercent} hint="Confirm the right GST rate with your accountant." />
            <div className="flex items-end pb-2"><Check label="Menu prices already include tax" name="taxInclusive" defaultChecked={s.taxInclusive} /></div>
          </div>
        </Card>
        <Card title="Payment methods at checkout">
          <p className="mb-3 text-sm text-ink-soft">
            Choose what customers see in the Razorpay window. A method also has to be active on your Razorpay account
            (Razorpay Dashboard → Account &amp; Settings → Payment methods) — for example meal cards and pay later need Razorpay to enable them first.
            {razorpayConfigured() && (process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? " You're using TEST keys — no real money moves." : " You're using LIVE keys.")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PAYMENT_METHODS.map((m) => (
              <label key={m.code} className="flex items-center gap-2.5 text-sm font-semibold">
                <input type="checkbox" name="paymentMethods" value={m.code} defaultChecked={parseMethods(s.paymentMethods).includes(m.code as never)} className="h-5 w-5 accent-[#1f6b3a]" />
                {m.label}
              </label>
            ))}
          </div>
        </Card>
        <Card title="Free order alerts on Telegram">
          <p className="mb-3 text-sm text-ink-soft">
            Get every paid order on your phone for free. In Telegram, message <b>@BotFather</b> → /newbot and put the bot token in your hosting settings as
            TELEGRAM_BOT_TOKEN. Then send any message to your new bot, message <b>@userinfobot</b> to get your chat ID, and paste it here.
            {!process.env.TELEGRAM_BOT_TOKEN && " (Bot token not set yet.)"}
          </p>
          <Field label="Telegram chat ID" name="telegramChatId" defaultValue={s.telegramChatId} placeholder="e.g. 123456789" />
        </Card>
        <Card title="Coupon types">
          <p className="mb-3 text-sm text-ink-soft">Switch a whole type of offer on or off without editing each coupon.</p>
          <div className="flex flex-wrap gap-6">
            <Check label="Percentage discounts" name="coupon_PERCENT" defaultChecked={!disabled.includes("PERCENT")} />
            <Check label="Fixed amount discounts" name="coupon_FLAT" defaultChecked={!disabled.includes("FLAT")} />
            <Check label="Free delivery" name="coupon_FREE_DELIVERY" defaultChecked={!disabled.includes("FREE_DELIVERY")} />
          </div>
        </Card>
        <Card title="Contact details (shown in the footer and Contact page)">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Business name" name="businessName" defaultValue={s.businessName} />
            <Field label="Phone" name="phone" defaultValue={s.phone} placeholder="+91 98765 43210" />
            <Field label="Email" name="email" type="email" defaultValue={s.email} />
            <Field label="WhatsApp number" name="whatsapp" defaultValue={s.whatsapp} hint="With country code, e.g. 919876543210" />
            <Field label="Kitchen address" name="address" defaultValue={s.address} className="md:col-span-2" />
            <Field label="Instagram link" name="instagram" defaultValue={s.instagram} />
            <Field label="Facebook link" name="facebook" defaultValue={s.facebook} />
            <Field label="YouTube link" name="youtube" defaultValue={s.youtube} />
          </div>
        </Card>
        <SubmitButton className="btn btn-primary min-w-40">Save settings</SubmitButton>
      </form>
      <Card title="Your admin password" className="mt-8">
        <PasswordForm />
      </Card>
    </>
  );
}
