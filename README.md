# Salad Stories — online salad ordering & delivery

A mobile-first ordering website for **Salad Stories**, Chennai: customers browse the menu, customize their bowl, pay with Razorpay and track delivery; the owner runs everything from an admin dashboard.

Built from the *Salad Stories Master BRD* (sections 1–10).

| | |
|---|---|
| **Stack** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL |
| **Payments** | Google Pay / UPI to the shop's UPI ID with owner confirmation (no fees), or Razorpay Checkout with webhooks |
| **Notifications** | Email (any SMTP), free Telegram bot alerts, optional WhatsApp Cloud API |
| **Hosting** | Netlify Free (app) + Neon Free (PostgreSQL) — ₹0/month to start |

## What's included

**Customer site** — home page, menu with veg/non-veg filters, product pages with a live-priced customizer, cart (saved on the device, and on the account when signed in), PIN-code delivery check, 7-step checkout with delivery slots and coupons, Razorpay payment, order confirmation and tracking, optional accounts (profile, saved addresses, order history, reorder), About, Contact, FAQ, and delivery/refund/privacy/terms pages.

**Admin dashboard** (`/admin`) — a self-updating launch checklist, today's numbers and slot capacity, order queue with one-tap status updates (customer gets an email), refunds through Razorpay, menu editor with customization options and photo upload, coupons, delivery areas / slots / holidays, customers, payments, sales reports, reviews, menu categories, payment-method switches, team members (admin or staff access) and store settings. Everything a business owner changes day to day is in the admin, so it never needs a code change or redeploy.

**Built-in safeguards** — prices, discounts, fees and tax are always recalculated on the server; double-clicks can't create duplicate orders; limited coupons are reserved atomically; an order is marked Paid only after Razorpay's signature *and* payment status are verified (with the webhook as a backup); sold-out items and full slots can't be ordered; nutrition is hidden until the owner marks it verified; no fake reviews.

## Run it on your computer

You need [Node.js 20+](https://nodejs.org). No database install is needed for local testing — an embedded PostgreSQL (PGlite) is created in the `.pglite` folder.

```bash
git clone https://github.com/ChellammaiValliappan/SaladStories.git
cd SaladStories
npm install
cp .env.example .env          # then set ADMIN_PASSWORD (and AUTH_SECRET)
npm run setup                 # creates tables + starter menu, areas, slots, test coupons, admin
npm run dev
```

Open http://localhost:3000 for the shop and http://localhost:3000/admin for the dashboard (sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

Stop the server with Ctrl+C. If the local database ever gets into a bad state, delete the `.pglite` folder and run `npm run setup` again.

Without Razorpay keys, checkout shows a **payment simulator** so you can try the whole flow. It never appears in production.

## Going live

Follow **[docs/SETUP.md](docs/SETUP.md)** — free-plan setup for Neon, Netlify, Razorpay, Gmail, Telegram and Cloudinary using `chellskct@gmail.com`, plus a table of where to change everything in the admin.

How customers and the owner move through the site, including what happens when something goes wrong, is in **[docs/FLOWS.md](docs/FLOWS.md)**.

## Before launch — the owner must check

- [ ] **Prices** — the seeded prices (₹149–₹249) are placeholders. Set real prices in Admin → Menu.
- [ ] **Nutrition** — enter verified figures and tick "verified", or leave them hidden.
- [ ] **Customization options** — keep only what the kitchen can make.
- [ ] **Photos** — replace the illustrated bowls with real food photography.
- [ ] **Contact details** — phone, WhatsApp, address, social links in Admin → Settings.
- [ ] **Tax** — confirm the GST rate (default 5%, added on top) with your accountant.
- [ ] **Policies** — have the refund, delivery, privacy and terms pages reviewed.
- [ ] **Test coupons** — WELCOME10, HEALTH50 and FREEDELIVERY are examples; edit or delete them.
- [ ] **Razorpay** — switch from test keys to live keys after KYC.

## Project layout

```
src/
  app/(store)/        customer pages (home, menu, cart, checkout, order, account, policies)
  app/admin/          admin login, dashboard pages and server actions
  app/api/            cart quote, checkout, payments, webhooks, delivery, auth
  components/         UI (customizer, cart, checkout, admin forms)
  db/                 database schema (Drizzle) and connection
  lib/                pricing, coupons, delivery slots, orders, Razorpay, notifications
drizzle/              SQL migrations
scripts/              migrate, seed, bowl illustration generator
tests/                unit tests for pricing, coupons and customization
docs/                 setup guide and user flows
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the site locally |
| `npm run setup` | Create/update tables and add starter data |
| `npm test` | Run the pricing / coupon / customization tests |
| `npm run build` | Production build (type-checks everything) |
| `npm run db:generate` | Create a new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (runs automatically on every Netlify deploy) |
