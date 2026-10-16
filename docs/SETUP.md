# Going live — setup guide

Do these in order. Use **chellskct@gmail.com** for every account, and choose **"Continue with GitHub"** wherever it's offered so everything is linked to your GitHub account and the `SaladStories` repository.

| # | Service | Why | Cost to start |
|---|---|---|---|
| 1 | GitHub | Holds the code; every push redeploys the site | Free |
| 2 | Neon (or Supabase) | PostgreSQL database for menu, orders, customers | Free tier |
| 3 | Vercel | Hosts the website | Free (Hobby) — use Pro if the business grows |
| 4 | Razorpay | Online payments (UPI, cards, net banking, wallets) | Per-transaction fee |
| 5 | Email (SMTP) | Order confirmations and owner alerts | Free with Gmail / Brevo |
| 6 | WhatsApp Cloud API | Instant order alerts on the owner's phone | Free tier, then per-message |
| 7 | Cloudinary | Upload food photos from the admin | Free tier |
| 8 | Domain | `saladstories.in` or similar | ~₹800/year |

---

## 1. GitHub

The repository is `https://github.com/ChellammaiValliappan/SaladStories` (branch `main`).

- **CI is already set up** (`.github/workflows/ci.yml`): every push runs the tests and a production build. See results under the repo's **Actions** tab.
- **Dependabot** (`.github/dependabot.yml`) opens weekly pull requests for security updates.
- Recommended: *Settings → Branches → Add rule* for `main` → "Require status checks to pass" → select **test-and-build**.
- Never commit the `.env` file — it's already in `.gitignore`.

## 2. Database — Neon

1. Go to https://neon.tech → **Sign up with GitHub**.
2. Create a project named `salad-stories`, region **AWS Asia Pacific (Singapore)** (closest to Chennai).
3. Copy the **connection string** (starts with `postgresql://`, ends with `?sslmode=require`). This is your `DATABASE_URL`.

*(Supabase works the same way: Project → Settings → Database → Connection string → "Transaction pooler".)*

Load the starter data once, from your computer:

```bash
DATABASE_URL="postgresql://…" ADMIN_EMAIL="chellskct@gmail.com" ADMIN_PASSWORD="a-strong-password" npm run setup
```

## 3. Hosting — Vercel

1. Go to https://vercel.com → **Continue with GitHub** (as chellskct@gmail.com).
2. **Add New → Project → Import** `ChellammaiValliappan/SaladStories`. Framework is detected as Next.js.
3. Under **Environment Variables** add:

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` (or the `*.vercel.app` URL at first) |
| `AUTH_SECRET` | a random 32+ character string — run `openssl rand -base64 32` |
| `ADMIN_EMAIL` | `chellskct@gmail.com` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | from step 4 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `OWNER_EMAIL` | from step 5 |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `OWNER_WHATSAPP_NUMBER` | from step 6 |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` | from step 7 |

4. Click **Deploy**. Database migrations run automatically on every deploy (`vercel-build` script).
5. From now on, every push to `main` on GitHub deploys the site automatically; pull requests get preview links.

Sign in at `https://your-site/admin`, then go to **Settings** and change your password.

## 4. Payments — Razorpay

1. Sign up at https://dashboard.razorpay.com with chellskct@gmail.com and complete **KYC** (business PAN, bank account, GST if registered, website URL). Live payments open only after KYC is approved.
2. Razorpay reviews your website — make sure the Contact, Refund, Privacy, Terms and Delivery pages are live with real contact details first.
3. **Test mode first:** *Account & Settings → API Keys → Generate Test Key*. Put the Key ID and Secret in Vercel.
4. **Webhook:** *Account & Settings → Webhooks → Add new webhook*
   - URL: `https://your-domain/api/webhooks/razorpay`
   - Secret: any strong random string → also set it as `RAZORPAY_WEBHOOK_SECRET`
   - Events: **payment.captured**, **payment.failed**, **order.paid**
5. **Auto-capture:** *Account & Settings → Payment Capture* → automatic capture (the site also captures authorized payments itself as a fallback).
6. **Payment methods:** UPI (incl. Google Pay), cards, net banking and wallets are usually on by default. **Meal cards** (Pluxee/Sodexo and others) must be requested from Razorpay support and are only shown if they enable them for your account — don't advertise them until confirmed.
7. Test a full order with Razorpay's test cards/UPI IDs, then generate **Live keys** and replace the test keys in Vercel → Redeploy.

## 5. Email notifications

The site emails the customer a confirmation, emails the owner each new paid order, and emails customers when status changes.

**Easiest: Gmail**
1. Turn on 2-Step Verification for chellskct@gmail.com.
2. Google Account → Security → **App passwords** → create one named "Salad Stories".
3. Set: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=chellskct@gmail.com`, `SMTP_PASS=<app password>`, `EMAIL_FROM="Salad Stories <chellskct@gmail.com>"`, `OWNER_EMAIL=chellskct@gmail.com`.

Gmail allows about 500 emails a day. When you get your own domain, switch to **Brevo**, **Zoho Mail** or **Resend** SMTP so emails come from `orders@your-domain` — only the SMTP values change.

## 6. WhatsApp order alerts (Meta WhatsApp Cloud API)

1. https://developers.facebook.com → log in → **Create app → Business → WhatsApp**.
2. Add a phone number that is **not** already used in the WhatsApp app (a new SIM works), and verify it.
3. Create a **System User** in Meta Business Settings with a **permanent access token** (`whatsapp_business_messaging` permission) → `WHATSAPP_TOKEN`.
4. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
5. Set `OWNER_WHATSAPP_NUMBER` to the owner's number with country code, no `+` (e.g. `919876543210`).
6. Free-form messages only reach numbers that messaged the business in the last 24 hours. For reliable alerts, create a **Utility template** (e.g. name `new_order`, body `New order: {{1}}`), wait for approval, then set `WHATSAPP_OWNER_TEMPLATE=new_order` (and `WHATSAPP_TEMPLATE_LANG=en` if needed).

Even without this step, every order page in the admin has a **WhatsApp** button that opens a chat with the customer, and the site footer has a "Chat on WhatsApp" button (set the number in Admin → Settings).

## 7. Food photos — Cloudinary

1. https://cloudinary.com → sign up with chellskct@gmail.com.
2. *Settings → Upload → Add upload preset* → Signing mode **Unsigned**, folder `salad-stories`.
3. Set `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` in Vercel.

Now **Upload a photo** in Admin → Menu → (item) works. Square photos, at least 1000 × 1000 px, shot from above, look best.

## 8. Domain

1. Buy a domain (GoDaddy, Hostinger, Namecheap…).
2. Vercel → Project → **Settings → Domains → Add** → follow the DNS instructions.
3. Update `NEXT_PUBLIC_SITE_URL` and the Razorpay webhook URL to the new domain.

## 9. Nice to have

- **Vercel Analytics** (Project → Analytics → Enable) for visitor numbers, no cookie banner needed.
- **Google Search Console** — add the domain so the site shows up in Google.
- **Google Business Profile** — list Salad Stories with the website link; ask happy customers for reviews there, then add them in Admin → Reviews.
- **Uptime alerts** — UptimeRobot (free) pinging the home page.
- **Mobile OTP login** — needs an SMS provider (MSG91 or Firebase Auth) with DLT registration in India; the account system is ready to add it.

## Environment variables reference

See `.env.example` for the full list with comments. Required in production: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, and the three Razorpay values. Everything else is optional — features switch on when their keys are present.
