# Meal plans

Plans customers can buy (editable in **Admin → Meal plans**):

| Plan | Days | Default discount | Delivery |
|---|---|---|---|
| Trial | 3 | 0% | Free |
| Weekly | 6 | 5% | Free |
| Monthly | 24 | 10% | Free |
| Pick your days | 2–30, customer taps the dates | 0% | Free |

### Customer flow
1. **Meal plans** (top menu, home page band, or `/plans`) → choose a plan → sign in (an account is needed to manage days later).
2. **When:** delivery time (Lunch / Afternoon / Dinner) and start date — or, for *Pick your days*, tap dates on a 60-day calendar (closed, holiday and fully booked days are greyed out). Bowls per day (1–3) and *Large portions*.
3. **Bowls:** *Mix it up*, *All [bowl]*, or pick a bowl for each day. The total updates live from the server: bowls, plan discount, delivery, GST, price per day.
4. **Deliver to:** contact, address, kitchen note (e.g. "mild spice, no onion") → accept the refund policy → **Pay with Google Pay** (same pay page and 12-digit UTR as normal orders).
5. Owner confirms the payment → plan becomes **Active**. Each delivery day becomes its own kitchen order tagged *Plan*.
6. **My account → My plans → open a plan:** for each day until **9 pm the evening before**:
   - **Swap** to any bowl up to the price paid for that day (pricier bowls are shown greyed with the extra cost).
   - **Skip day** → it moves to the next open day after the plan's last day, so no meal is lost.

### Owner flow
- **Admin → Meal plans:** active plans, waiting for payment, plan bowls tomorrow; list with days left. Open a plan to swap/skip any day the kitchen hasn't started (no 9 pm cut-off for the team) or **Cancel plan** (future days removed from the kitchen sheet; any refund is done by hand).
- Plan days appear on the **Kitchen sheet**, **Orders** and the nightly summary like normal orders, and move through Preparing → Out for delivery → Delivered (customer gets the usual emails).
- **Sales are counted once** — on the plan's payment order. Plan days show "Plan" / ₹0, so revenue isn't double counted.
- New plan bought → owner alert ("🗓 New plan …") on site notifications / WhatsApp / Telegram / email.
- Edit plan names, days, discount %, delivery fee per day, visibility, or add a plan (e.g. "Fortnight · 12 days") at the bottom of Admin → Meal plans. Changes apply to new plans only.

### Rules worth knowing
- Plans start tomorrow at the earliest (the day after if it's past 9 pm) and can start up to 30 days ahead.
- Dates skip days a slot doesn't run, holidays and fully booked days. Slots currently run all 7 days — untick Sunday in Admin → Delivery if closed on Sundays.
- If a paid plan ever fails to activate, it activates itself the next time it's opened and in the nightly 10 pm job.
- Code: `src/lib/plans.ts` (dates, pricing, buy, activate, swap, skip, cancel), `src/lib/plans-core.ts` (pure rules, unit tested in `tests/plans.test.ts`).
