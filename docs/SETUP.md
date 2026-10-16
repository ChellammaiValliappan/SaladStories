# Going live — setup guide (free-plan edition)

Everything below starts on a **free plan**. Use **chellskct@gmail.com** for every account and choose **"Continue with GitHub"** wherever it's offered, so each service is linked to your GitHub account and the `SaladStories` repo.

## What it costs

| Service | Used for | Plan | Monthly cost |
|---|---|---|---|
| GitHub | Code, automatic checks | Free | ₹0 |
| **Netlify** | Hosting the website | Free (300 credits/month, commercial use allowed) | ₹0 |
| **Neon** | PostgreSQL database | Free (1 GB storage, 100 compute-hours) | ₹0 |
| Razorpay | Online payments | No monthly fee | ~2% per successful payment |
| Gmail SMTP | Order emails | Free (≈500 emails/day) | ₹0 |
| Telegram bot | Order alerts on your phone | Free | ₹0 |
| Cloudinary | Food photos | Free tier | ₹0 |
| Domain | `saladstories.in` etc. | Optional — `yourname.netlify.app` is free | ~₹800/year |

**Expected total: ₹0/month + Razorpay's fee on each order.**

> **Why not Vercel?** Vercel's free Hobby plan is for personal, non-commercial sites only. A shop taking payments would need Vercel Pro (~$20/month). The code still works on Vercel if you ever upgrade.

### Keeping it free
- **Menu, prices, nutrition, photos, coupons, slots, staff and payment methods are all changed in `/admin`** — they live in the database, so they **don't need a redeploy** and don't use Netlify credits.
- Netlify spends credits on deploys (≈15 each), bandwidth and server time. The included `netlify.toml` skips preview builds and skips deploys when only docs change. A small local shop should stay well inside 300 credits; Netlify emails you at 50%, 75% and 100%.
- Photos are served by Cloudinary, not Netlify, which saves bandwidth credits.
- Neon's database sleeps after 5 minutes idle and wakes in under a second on the next visit — fine for this site.
- When the business grows: Netlify Pro or Vercel Pro (~$19–20/month) and Neon Launch — no code changes needed.

---

## Step 1 — Database (Neon) · 5 minutes

1. Open https://neon.com → **Sign up** → **Continue with GitHub**.
2. Create a project: name `salad-stories`, Postgres version default, region **AWS Asia Pacific (Singapore)**.
3. On the project dashboard click **Connect** → turn on **Connection pooling** → copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-…-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   Keep it private — this is your `DATABASE_URL`.

## Step 2 — Website (Netlify) · 10 minutes

1. Open https://app.netlify.com/signup → **Sign up with GitHub** (as the GitHub account that owns the repo).
2. **Add new project → Import an existing project → GitHub** → allow access to `ChellammaiValliappan/SaladStories`.
3. Netlify reads `netlify.toml`, so leave the build settings as they are. Pick a site name, e.g. `saladstories` → your address becomes `https://saladstories.netlify.app`.
4. Before deploying, open **Add environment variables** (or later: *Site configuration → Environment variables*) and add:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon string from Step 1 |
| `AUTH_SECRET` | a long random string (e.g. from https://www.random.org/strings/ — 40 characters) |
| `NEXT_PUBLIC_SITE_URL` | `https://saladstories.netlify.app` (your site address, no trailing slash) |
| `ADMIN_EMAIL` | `chellskct@gmail.com` |
| `ADMIN_PASSWORD` | a strong password for your first admin login |
| `OWNER_EMAIL` | `chellskct@gmail.com` |

5. Click **Deploy**. The first deploy creates the database tables, adds the starter menu, delivery areas, slots and test coupons, and creates your admin account. (Later deploys never overwrite your changes.)
6. Open `https://saladstories.netlify.app/admin`, sign in, and go to **Settings → Your admin password** to change it. You can then delete `ADMIN_PASSWORD` from Netlify.

From now on every push to `main` on GitHub redeploys the site automatically.

## Step 3 — Payments (Razorpay) · 15 minutes + KYC wait

1. Sign up at https://dashboard.razorpay.com with chellskct@gmail.com.
2. **Test mode first:** *Account & Settings → API Keys → Generate Test Key*. Add to Netlify:
   `RAZORPAY_KEY_ID` = `rzp_test_…`, `RAZORPAY_KEY_SECRET` = the secret.
3. **Webhook:** *Account & Settings → Webhooks → Add new webhook*
   - URL: `https://saladstories.netlify.app/api/webhooks/razorpay`
   - Secret: make up a strong string → add it to Netlify as `RAZORPAY_WEBHOOK_SECRET`
   - Events: **payment.captured**, **payment.failed**, **order.paid**
4. *Account & Settings → Payment Capture* → **Automatic**.
5. Netlify → **Deploys → Trigger deploy** (environment variable changes need one deploy). Place a test order with Razorpay's test UPI/card details.
6. **Choose payment methods** any time in **Admin → Settings → Payment methods at checkout** (UPI, cards, net banking, wallets, EMI, pay later). A method must also be switched on in your Razorpay account. **Meal cards** (Pluxee/Sodexo etc.) need a request to Razorpay support; once they enable them they appear under cards/wallets automatically.
7. **Go live:** complete **KYC** (PAN, bank account, business details; Razorpay checks that your Contact, Refund, Privacy, Terms and Delivery pages are live). Then generate **Live keys**, replace the two key values in Netlify, add a webhook for live mode the same way, and trigger a deploy.

## Step 4 — Order emails (Gmail, free) · 5 minutes

1. Turn on **2-Step Verification** for chellskct@gmail.com.
2. https://myaccount.google.com/apppasswords → create an app password named "Salad Stories".
3. Add to Netlify: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=chellskct@gmail.com`, `SMTP_PASS=<the 16-letter app password>`, `EMAIL_FROM=Salad Stories <chellskct@gmail.com>` → trigger a deploy.

Customers get a confirmation and status updates; you get a copy of every paid order.

## Step 5 — Order alerts on your phone (Telegram, free) · 5 minutes

1. In Telegram, message **@BotFather** → `/newbot` → name it "Salad Stories Orders" → copy the token.
2. Add it to Netlify as `TELEGRAM_BOT_TOKEN` → trigger a deploy.
3. Send "hi" to your new bot, then message **@userinfobot** to see your chat ID.
4. Paste the chat ID in **Admin → Settings → Free order alerts on Telegram**. Every paid order now pings your phone with the items, slot and address.

*WhatsApp alerts are also supported (see `.env.example`), but Meta's WhatsApp Cloud API charges for business-initiated messages and needs a separate number, so Telegram is the free choice. Customers can still reach you on WhatsApp from the site — add your number in Settings.*

## Step 6 — Food photos (Cloudinary, free) · 5 minutes

1. https://cloudinary.com → sign up with chellskct@gmail.com.
2. *Settings → Upload → Add upload preset* → Signing mode **Unsigned**, folder `salad-stories` → save.
3. Add to Netlify: `CLOUDINARY_CLOUD_NAME` (on the dashboard) and `CLOUDINARY_UPLOAD_PRESET` → trigger a deploy.

Now **Admin → Menu → Edit → Upload a photo** works. Square photos shot from above (1000 × 1000 px or more) look best.

## Step 7 — Your own domain (optional)

Buy a domain → Netlify *Domain management → Add a domain* → follow the DNS steps (free HTTPS is automatic) → update `NEXT_PUBLIC_SITE_URL` and the Razorpay webhook URL.

---

## Day-to-day maintenance (no coding)

| I want to… | Where |
|---|---|
| Change a price, description or photo | Admin → Menu → Edit |
| Add or remove a bowl | Admin → Menu → Add a menu item / Delete |
| Add nutrition info | Admin → Menu → Edit → Nutrition → tick "verified" |
| Change customization (sizes, add-ons, extras) | Admin → Menu → Edit → Customization options |
| Mark something sold out today | Admin → Menu → Mark sold out (staff can do this too) |
| Add a menu category | Admin → Menu → Menu categories |
| Add kitchen/delivery staff or another admin | Admin → Team |
| Turn UPI / cards / wallets / EMI on or off | Admin → Settings → Payment methods |
| Change delivery fee, minimum order, GST | Admin → Settings → Charges |
| Add a delivery area or PIN code | Admin → Delivery |
| Change slot times or how many orders per slot | Admin → Delivery → Delivery slots |
| Close for a holiday | Admin → Delivery → Holidays |
| Pause all orders | Admin → Settings → Pause all orders |
| Create an offer | Admin → Coupons |
| Refund a customer | Admin → Orders → open order → Refund (admins only) |

The dashboard shows a **Before you launch** checklist that ticks itself off as you finish these steps.

## Environment variables reference

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection string |
| `AUTH_SECRET` | Yes | Long random string; changing it signs everyone out |
| `NEXT_PUBLIC_SITE_URL` | Yes | Used in email links |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First deploy | Creates the first admin if none exists |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | For payments | Test keys start with `rzp_test_` |
| `SMTP_*`, `EMAIL_FROM`, `OWNER_EMAIL` | Optional | Order emails |
| `TELEGRAM_BOT_TOKEN` | Optional | Free phone alerts; chat ID is set in Admin → Settings |
| `WHATSAPP_*`, `OWNER_WHATSAPP_NUMBER` | Optional | Paid WhatsApp alerts |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` | Optional | Photo uploads |

Never commit these values to GitHub — enter them only in Netlify.
