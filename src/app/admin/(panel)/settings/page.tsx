import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { connectTelegram, saveSettings, sendBackupNow, sendSummaryNow, sendTestAlert } from "../../actions";
import { alertChannels } from "@/lib/reports";
import { Card, Check, Field, PageHead } from "@/components/admin/ui";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { PasswordForm } from "@/components/PasswordForm";
import { PAYMENT_METHODS, parseMethods } from "@/lib/payment-methods";
import { razorpayConfigured } from "@/lib/razorpay";
import { QrUpload } from "@/components/admin/QrUpload";

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
      <AlertsCard />
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
            <Field label="Account holder name" name="upiName" defaultValue={s.upiName} hint="Must match the name on the UPI account exactly — filled in from your QR." />
          </div>
          <fieldset className="mt-4">
            <legend className="label">What kind of UPI ID is this?</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-2xl border-[1.5px] border-line p-4 text-sm has-[:checked]:border-basil has-[:checked]:bg-basil-soft">
                <input type="radio" name="upiIdType" value="BUSINESS" defaultChecked={s.upiIdType === "BUSINESS"} className="mt-0.5 h-5 w-5 accent-[#1f6b3a]" />
                <span><b className="block">Business / merchant UPI ID (recommended)</b>From PhonePe Business, Paytm for Business, Google Pay for Business or your bank's merchant QR. Works with Google Pay, amount filled in automatically. Free for UPI.</span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-2xl border-[1.5px] border-line p-4 text-sm has-[:checked]:border-basil has-[:checked]:bg-basil-soft">
                <input type="radio" name="upiIdType" value="PERSONAL" defaultChecked={s.upiIdType !== "BUSINESS"} className="mt-0.5 h-5 w-5 accent-[#1f6b3a]" />
                <span><b className="block">Personal UPI ID</b>Your own Google Pay account. Paste your Google Pay QR text below so payments are accepted. Personal accounts can have monthly receiving limits.</span>
              </label>
            </div>
          </fieldset>
          {s.paymentMode !== "RAZORPAY" && Object.keys(s.upiQrExtras ?? {}).length === 0 && s.upiIdType !== "BUSINESS" && (
            <p className="mt-3 rounded-xl bg-mango/25 p-3 text-sm font-semibold">
              Paste the text of your own Google Pay QR below. Google Pay checks that the payment request matches your real QR (exact name and its hidden fields); typed-in details are often refused with &ldquo;bank limit exceeded&rdquo;.
            </p>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_12rem]">
            <div>
              <label className="label" htmlFor="upiQrText">Best: your Google Pay QR</label>
              <input id="upiQrText" name="upiQrText" className="field" placeholder="upi://pay?pa=…&pn=…" />
              <QrUpload targetId="upiQrText" />
              <a href="/admin/upi-test" className="mt-2 inline-block text-sm font-semibold text-basil underline">Test which Google Pay links work →</a>
              <p className="mt-1 text-xs text-ink-soft">
                In Google Pay tap your photo → <b>your QR code</b> → take a screenshot, then upload it here (or paste the QR text). Works for personal and business QRs.
                {Object.keys(s.upiQrExtras ?? {}).length > 0 && " ✓ QR details saved."}
              </p>
            </div>
            <Field label="Merchant code (mc)" name="upiMerchantCode" defaultValue={s.upiMerchantCode} placeholder="e.g. 5814" hint="Optional — 4 digits from your QR." />
          </div>
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
        <details className="rounded-2xl border border-line bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">Telegram chat ID (filled in for you by “Connect Telegram”)</summary>
          <Field label="Telegram chat ID" name="telegramChatId" defaultValue={s.telegramChatId} placeholder="e.g. 123456789" className="mt-3" />
        </details>
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

async function botUsername() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { result?: { username?: string } };
    return data.result?.username ?? null;
  } catch {
    return null;
  }
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-basil text-white" : "bg-crate text-ink-soft"}`}>{done ? "✓" : "•"}</span>
      <span className={done ? "text-ink-soft" : ""}>{children}</span>
    </li>
  );
}

/** Order alerts (Telegram + email), nightly summary and weekly backup. */
async function AlertsCard() {
  const [c, bot] = await Promise.all([alertChannels(), botUsername()]);
  const ready = c.telegramChat || c.email || (c.whatsappKey && !!c.whatsappNumber);
  return (
    <Card title="Order alerts & reports" className="mb-6">
      <p className="text-sm text-ink-soft">
        You get a message for every new order and every payment to check, a <b>sales summary every night at 10 pm</b>, and a <b>backup of all orders every Monday at 8 am</b> (a spreadsheet file).
      </p>

      <div className="mt-4 rounded-xl bg-crate p-4">
        <h3 className="font-bold">WhatsApp (free, to your own number)</h3>
        {c.whatsappKey && c.whatsappNumber ? (
          <p className="mt-2 text-sm">✓ Alerts go to WhatsApp <b>+{c.whatsappNumber}</b>.</p>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              Open <a className="font-semibold text-basil underline" href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">CallMeBot&apos;s WhatsApp page</a>, save their bot number in your contacts, and from <b>your</b> WhatsApp send it: <code>I allow callmebot to send me messages</code>
            </li>
            <li>It replies with an <b>API key</b>. Add it in Netlify → Environment variables as <code>CALLMEBOT_APIKEY</code>, then redeploy.</li>
            <li>
              Put your WhatsApp number (with 91) in <b>Contact details → WhatsApp number</b> below{c.whatsappNumber ? <> — currently <b>+{c.whatsappNumber}</b></> : null}.
            </li>
          </ol>
        )}
        <p className="mt-2 text-xs text-ink-soft">A free community service for personal alerts: messages can take a few seconds, and it may occasionally be slow — keep Telegram or email on as a backup.</p>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="font-bold">Telegram (free, instant)</h3>
          <ol className="mt-2 space-y-2 text-sm">
            <Step done={c.telegramToken}>
              In Telegram, open <b>@BotFather</b> → send <code>/newbot</code> → pick a name (e.g. “Salad Stories Alerts”). Copy the token it gives you into Netlify → Environment variables as <code>TELEGRAM_BOT_TOKEN</code>, then redeploy.
            </Step>
            <Step done={c.telegramChat}>
              {bot ? (
                <>Open <a className="font-semibold text-basil underline" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">@{bot}</a> and tap <b>Start</b>, then tap <b>Connect Telegram</b> below.</>
              ) : (
                <>Open your new bot, tap <b>Start</b>, then tap <b>Connect Telegram</b> below.</>
              )}
            </Step>
          </ol>
          {c.telegramToken && (
            <form action={connectTelegram} className="mt-3">
              <SubmitButton className="btn btn-primary" pendingText="Connecting…">{c.telegramChat ? "Reconnect Telegram" : "Connect Telegram"}</SubmitButton>
            </form>
          )}
        </div>

        <div>
          <h3 className="font-bold">Email (free with Gmail)</h3>
          {c.email ? (
            <p className="mt-2 text-sm">✓ Emails go to <b>{c.ownerEmail}</b>.</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>Turn on 2-Step Verification for your Google account, then open <b>myaccount.google.com/apppasswords</b> and create an app password called “Salad Stories”.</li>
              <li>
                In Netlify → Environment variables add: <code>SMTP_HOST</code> = smtp.gmail.com, <code>SMTP_PORT</code> = 465, <code>SMTP_USER</code> = your Gmail address, <code>SMTP_PASS</code> = the 16-letter app password, <code>EMAIL_FROM</code> = Salad Stories &lt;your Gmail address&gt;. Then redeploy.
              </li>
              <li>Make sure the <b>Email</b> under Contact details below is where you want alerts.</li>
            </ol>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        {ready && (
          <>
            <form action={sendTestAlert}><SubmitButton className="btn btn-ghost" pendingText="Sending…">Send a test alert</SubmitButton></form>
            <form action={sendSummaryNow}><SubmitButton className="btn btn-ghost" pendingText="Sending…">Send today’s summary now</SubmitButton></form>
            <form action={sendBackupNow}><SubmitButton className="btn btn-ghost" pendingText="Sending…">Send backup now</SubmitButton></form>
          </>
        )}
        <a href="/api/admin/orders-export?all=1" className="btn btn-ghost">Download all orders (CSV)</a>
      </div>
    </Card>
  );
}
