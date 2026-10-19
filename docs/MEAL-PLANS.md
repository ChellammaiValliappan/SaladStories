# Meal plans

Plans deliver **Monday to Friday** (each plan's delivery days are editable in **Admin → Meal plans**).

| Plan | Days | Default discount | Delivery |
|---|---|---|---|
| Trial | 3 weekdays | 0% | Free |
| Weekly | 5 weekdays (Mon–Fri) | 5% | Free |
| Monthly | 20 weekdays | 10% | Free |
| Pick your days | 2–30 weekdays the customer taps | 0% | Free |

## Customer flow
1. **Meal plans** (top menu, home page band, or `/plans`) → choose a plan → sign in (an account is needed to manage days later).
2. **When:** delivery time (Lunch / Afternoon / Dinner) and start date — or, for *Pick your days*, tap weekdays on a 60-day calendar (weekends, holidays and fully booked days are greyed out). Bowls per day (1–3) and *Large portions*.
3. **Bowls:** *Mix it up*, *All [bowl]*, or pick a bowl for each day. The total updates live from the server: bowls, plan discount, delivery, GST.
4. **Deliver to:** contact, address, kitchen note.
   - **Hybrid workers:** tick *Deliver some days to a second address*, name the two addresses (e.g. **Office** / **Home**) and choose an address for each weekday (default Mon–Wed address 1, Thu–Fri address 2). Each day in the list shows "To Office" / "To Home".
   - **Addresses are fixed once the plan is paid.**
5. Accept the refund policy → **Pay with Google Pay** (same pay page and 12-digit UTR as normal orders).
6. Owner confirms the payment → plan becomes **Active**. Each delivery day becomes its own kitchen order (tagged *Plan*) with that day's address.
7. **My account → My plans → open a plan:** up to **24 hours before each delivery** (e.g. Wednesday's 12:30 lunch until Tuesday 12:30):
   - **Swap** to any bowl up to the price paid for that day.
   - **Skip day** → one extra day is added after the plan's last day, on the next delivery weekday, going to whichever address that weekday uses. Inside 24 hours a day can't be skipped or moved.

## Owner flow
- **Admin → Meal plans:** active plans, waiting for payment, plan bowls tomorrow; list with days left. Open a plan to see both addresses and which day goes where, swap/skip any day the kitchen hasn't started (the team isn't limited by the 24-hour rule), or **Cancel plan** (future days removed from the kitchen sheet; any refund by hand).
- Plan days appear on the **Kitchen sheet**, **Orders** and the nightly summary like normal orders, each with its own address, and move through Preparing → Out for delivery → Delivered.
- **Sales are counted once** — on the plan's payment order. Plan days show "Plan" / ₹0.
- Edit names, days, delivery days (Mon–Sun checkboxes), discount %, delivery fee per day and visibility, or add a plan, at the bottom of Admin → Meal plans. Changes apply to new plans only.

## Rules worth knowing
- A plan's first day must be more than 24 hours away (so it usually starts the day after tomorrow if bought after the slot's start time).
- Plans can start up to 30 days ahead. Dates skip weekends, holidays and fully booked slots.
- If a paid plan ever fails to activate, it activates itself the next time it's opened and in the nightly 10 pm job.
- Code: `src/lib/plans.ts` (dates, pricing, buy, activate, swap, skip, cancel), `src/lib/plans-core.ts` (pure rules: 24-hour cut-off, weekday → address, unit tested in `tests/plans.test.ts`).
