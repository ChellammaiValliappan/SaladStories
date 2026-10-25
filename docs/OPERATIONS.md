# Running and developing the business module

This covers the Subscription, Order & Billing module (customers, meal plans, payments, daily operations, invoices, expenses, finance). The owner's no-code setup is in [SETUP.md](SETUP.md); the design is in [BUSINESS-MODULE.md](BUSINESS-MODULE.md).

## Run it on a computer

Requirements: Node.js 22, Git.

```bash
git clone https://github.com/ChellammaiValliappan/SaladStories.git
cd SaladStories
git checkout develop
npm install
cp .env.example .env        # optional: without DATABASE_URL a local database (PGlite) is used
npm run setup               # creates tables (migrations) and starter data
npm run dev                 # http://localhost:3000 — admin at /admin
```

The first admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. For a staff login: `npx tsx scripts/make-staff.ts staff@example.com Password123`.

Only one process may open the local database at a time: stop `npm run dev` before running the integration tests.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Netlify (production) | Neon pooled connection string |
| `AUTH_SECRET` | Netlify (production) | Signs logins; also signs scheduler calls unless `CRON_SECRET` is set |
| `TEST_DATABASE_URL`, `TEST_AUTH_SECRET` | Netlify, **branch-deploy context only** | Make the `develop` deploy a test site (own Neon branch, no outside messages) |
| `NEXT_PUBLIC_SITE_URL` | Netlify | Links in emails and alerts |
| `VAPID_*` | Netlify | Phone notifications (free) |
| `TELEGRAM_BOT_TOKEN` | Netlify | Telegram alerts and backups (free) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Netlify | Email (Gmail app password works, free) |
| `CALLMEBOT_APIKEY`, `OWNER_WHATSAPP_NUMBER` | Netlify | WhatsApp alerts to the owner (free, delivery not confirmed) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Netlify | Official WhatsApp Business API (paid per conversation) — the only way to message customers on WhatsApp automatically |
| `RAZORPAY_*` | Netlify | Automatic card/UPI payments (optional, ~2% fee) |

Secrets are entered only in Netlify, never committed.

## Database migrations

Migrations live in `drizzle/` and run automatically at the start of every Netlify build (`npm run db:migrate`), against the production database for `main` and the test database for `develop`.

- Change `src/db/schema.ts`, then `npm run db:generate -- --name what_changed`, review the SQL, and add any data backfill to the end of the file.
- `npm run db:migrate` applies them locally.
- Before a production release, rehearse on the test site (it migrates first), and make a Neon backup branch of `main`.

| Migration | Adds |
|---|---|
| 0009 | customers, payments ledger, counters, audit log; plan prices and premium tiers; backfill from existing orders |
| 0010 | skip/reschedule/pause requests, notification outbox, job runs, alert settings |
| 0011 | one live delivery per plan per day (held/forfeited days don't block a date) |
| 0012 | invoices and credit notes, billing settings |
| 0013 | expenses, expense categories (12 starter), stored files |

## Tests

```bash
npm test                    # 33 unit tests: pricing, plan rules, ledger maths, counting
npm run test:integration    # M1–M4 suites against the local database (113 checks)
npm run test:acceptance     # the 12 acceptance scenarios end to end (39 checks)
# Role checks over HTTP (needs a running site and logins):
ROLES_URL=http://localhost:3000 ROLES_ADMIN_EMAIL=… ROLES_ADMIN_PASSWORD=… \
ROLES_STAFF_EMAIL=… ROLES_STAFF_PASSWORD=… npm run test:roles
```

### The 12 acceptance scenarios (`tests/integration/acceptance.ts`)

1. **Customers** — auto codes, duplicate phone refused in any format, search.
2. **Plans** — Trial/Weekly/Monthly (22 delivery days) on the customer's own weekdays; fixed price.
3. **Payments** — no activation before payment; part payments tracked; unverified UPI doesn't start a plan; duplicate UTR refused; full payment starts it.
4. **Counting** — Day N of M, remaining deliveries.
5. **Daily list** — 8 pm tomorrow's list in the owner's format; separate attention alert; sent once; not before the set time.
6. **Skips** — 24-hour customer cut-off; request holds the day; owner carries forward / forfeits; counts and end date stay right; audited.
7. **Pause/resume** — held days come back from the resume date.
8. **Renewal** — reminder before the last delivery; completion after all deliveries; renewal linked to the old plan.
9. **Billing** — invoice numbering, paid status from the ledger, refund → credit note, PDF; started-before-payment plan shows unpaid.
10. **GST** — tax invoices with GSTIN when registered; old invoices unchanged.
11. **Finance** — expenses flow into totals; cash flow; Excel export.
12. **Security** — customers can't touch other plans; early start needs a reason; audit trail; India time; never two live invoices per plan; plus HTTP role checks (logged out, staff, admin).

## Releasing

1. Work on `develop` → push → test on `https://develop--saladstories.netlify.app` (free).
2. Run the tests locally.
3. In Neon, create a backup branch of `main` (e.g. `backup-before-<release>-<date>`).
4. Merge `develop` into `main` and push. Netlify builds production (15 credits), migrating the live database first. If credits are used up, the build shows **Skipped**: wait for the monthly reset or upgrade.
5. Check the live admin: dashboard loads, a plan page opens, Finance loads.

## Operating

- **Every evening:** the 8 pm list arrives (Alerts bell, phone, Telegram/email/WhatsApp as set up). Act on **Needs attention**.
- **When a customer pays:** Payments → To verify → *Money received* (or record cash/bank on the plan). The plan starts automatically when fully paid; the invoice updates.
- **Skip requests:** Skip requests page — move, add to the end, forfeit or keep. The customer's plan updates immediately.
- **Expenses:** add them as you spend (photo of the bill). Finance shows the month at a glance; download the workbook for your accountant.
- **If something didn't send:** Alerts → the channel chip shows *failed* → Retry. *Not set up* means that channel has no credentials yet.
- **Automatic jobs:** Alerts → Automatic jobs shows each run (done / failed with the error). A failed job retries on the next 15-minute tick.

## What's functional and what needs credentials

Fully working without any paid service:
customers, meal plans (website and admin), payments ledger with UPI verification, skip/reschedule/pause, renewals and completion, scheduler, in-app alerts and phone notifications, invoices/receipts/credit notes with PDFs and private customer links, GST invoices, expenses with bill photos, finance dashboard, Excel/CSV exports, audit history, weekly backups.

Needs the owner's free credentials (entered in Netlify):
- **Email** (invoices by email, renewal emails to customers, backups by email): Gmail app password → `SMTP_*`.
- **Telegram** alerts/backups: bot token → `TELEGRAM_BOT_TOKEN`, then Connect in Settings.
- **WhatsApp to the owner**: CallMeBot key → `CALLMEBOT_APIKEY` (free; delivery can't be confirmed).

Needs a paid service:
- **WhatsApp messages to customers** automatically: Meta WhatsApp Business (Cloud) API — per-conversation charges. Until then, invoices and reminders go to customers through one-tap *Send on WhatsApp* links from your phone.
- **Razorpay** for automatic online payments (~2% per payment).
- **Netlify Personal** ($9/month) only if 300 free credits a month aren't enough.
