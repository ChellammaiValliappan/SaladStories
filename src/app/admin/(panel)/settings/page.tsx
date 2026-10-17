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
        <Card title="How customers pay">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-2xl border-[1.5px] border-line p-4 has-[:checked]:border-basil has-[:checked]:bg-basil-soft">
              <input type="radio" name="paymentMode" value="UPI" defaultChecked={s.paymentMode !== "RAZORPAY"} className="mt-1 h-5 w-5 accent-[#1f6b3a]" />
              <span className="text-sm">
                <span className="block font-bold">Google Pay to my UPI ID</span>
                No fees and no gateway. Customers pay with Google Pay and enter the transaction ID; you confirm each payment in Orders → Check payment.
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-2xl border-[1.5px] border-line p-4 has-[:checked]:border-basil has-[:checked]:bg-basil-soft">
              <input type="radio" name="paymentMode" value="RAZORPAY" defaultChecked={s.paymentMode === "RAZORPAY"} className="mt-1 h-5 w-5 accent-[#1f6b3a]" />
              <span className="text-sm">
                <span className="block font-bold">Razorpay (automatic)</span>
                UPI, cards, net banking and wallets, confirmed automatically. About 2% per payment; needs Razorpay keys and KYC.
                {!razorpayConfigured() && <span className="mt-1 block font-semibold text-tomato">Razorpay keys aren't set yet.</span>}
              </span>
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Your UPI ID" name="upiId" defaultValue={s.upiId} placeholder="e.g. saladstories@okaxis" hint="Open Google Pay → tap your photo → your UPI ID is under your name. A Google Pay for Business UPI ID is best." />
            <Field label="Name shown in Google Pay" name="upiName" defaultValue={s.upiName} />
          </div>
          <fieldset className="mt-4">
            <legend className="label">What kind of UPI ID is this?</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-2xl border-[1.5px] border-line p-4 text-sm has-[:checked]:border-basil has-[:checked]:bg-basil-soft">
                <input type="radio" name="upiIdType" value="PERSONAL" defaultChecked={s.upiIdType !== "BUSINESS"} className="mt-0.5 h-5 w-5 accent-[#1f6b3a]" />
                <span><b className="block">Personal UPI ID</b>Your own Google Pay / bank UPI ID. Customers type the amount themselves (Google Pay blocks pre-filled amounts to personal IDs).</span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-2xl border-[1.5px] border-line p-4 text-sm has-[:checked]:border-basil has-[:checked]:bg-basil-soft">
                <input type="radio" name="upiIdType" value="BUSINESS" defaultChecked={s.upiIdType === "BUSINESS"} className="mt-0.5 h-5 w-5 accent-[#1f6b3a]" />
                <span><b className="block">Business / merchant UPI ID</b>From Google Pay for Business, PhonePe/Paytm for Business or your bank's merchant QR. The amount fills in automatically.</span>
              </label>
            </div>
          </fieldset>
          <details className="mt-4 rounded-xl border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold">Razorpay payment methods (only used in Razorpay mode)</summary>
            <p className="mb-3 mt-2 text-sm text-ink-soft">
              A method must also be active on your Razorpay account.
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
          </details>
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
