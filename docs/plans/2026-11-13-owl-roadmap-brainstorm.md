# Owl roadmap: brainstorm (2026-11-13)

Status: BRAINSTORM, needs owner picks. Round 1 (`2026-11-13-owl-any-date-and-activity-log.md`) is approved.

Rule that shapes everything: **any number Owl says comes from a tool** (SYSTEM_PROMPT). Forecasts are therefore computed by deterministic, tested code. The model only explains them, never invents them.

## What Owl can already do (origin/main)

| Area | Can do today | Can't do today |
|---|---|---|
| Sales | dashboard KPIs for today/7/30/90d, best hours/weekdays, menu performance, pairs | any date, profit, per-branch, a forecast |
| Inventory | low/out + stock value, recent movements, one ingredient (on hand, makeable), dish recipe + cost, propose stock change / new ingredient | run-out dates, what to buy, waste/variance, cost creep |
| People | per-staff totals (24h/7d/30d) | the log of who did what, shifts, drawer over/short |
| Money | — | profit, expenses, bills due, cash/shift, unpaid orders, discounts given |
| Customers | overview, best customers, loyalty, SMS, vouchers | one customer's history, Messenger questions |
| Proactive | nothing (Owl only answers) | morning brief, alerts |

## Data already on the platform

Assessed on the platform database 2026-11-13.

- Orders history: 24 stores have ≥100 orders in the last 8 weeks, 15 have ≥400, and 11 have a full 8 weeks. Convex stores are also readable through `readTenantSales`.
- Inventory: 29 stores have ingredients, and 13 moved stock in the last 14 days (`stock_movements` at frozen cost, recipes, reorder levels, transfers, stocktakes).
- Money:
  - `expenses`, `expense_bills` (payables) and `expense_receipts`. 18 stores logged expenses in 30 days.
  - `suppliers`.
  - `cash_drawers`, `staff_shifts`, `shift_counts` and `shift_expectations` (over/short).
  - `business_day_closes`.
  - The profit model in `src/lib/reports/profit-model.ts`.
- Who did what: `store_activity`, about 3.5k rows per day platform-wide, nearly all with a named person.
- Kitchen speed: `order_status_events` (placed → confirmed → ready → completed, with the actor).
- Customers: Messenger chat log (`messenger_messages`, 30 days) and storefront visits.

## Ideas, grouped by the owner's question

### A. "What happened?" (Round 1, approved) + order lookup
- A1. Any date or range everywhere (`when.ts`).
- A2. Sales for any date, with an hourly breakdown for a single day.
- A3. `get_activity_log`: who punched what.
- A4. Staff scoreboard for any date.
- A5. **NEW, small, suggest adding to Round 1:** `get_order` — "order #42 yesterday": items, total, payment, who rang it up / confirmed / voided, timeline, with the customer masked.

### B. "What will happen?" — the forecast engine (`src/lib/forecast/`, pure)
- B1. **Sales forecast** for today's remaining hours, tomorrow, the weekend, this week and month-end. Method:
  - Median of the same weekday over the last 6–8 weeks.
  - A recent-trend factor capped at ±25%.
  - A payday effect (15th / 30th–31st) and holiday effect, each used only if the store's OWN history shows it. A static PH holiday list flags the date either way.
  - Output: a low–likely–high range from past errors, plus an honest note of how far off it was on the last 4 weeks ("usually within ±12%").
  - Fewer than 4 weeks of history: Owl says it can't forecast yet.
- B2. **Dish forecast → prep list:** "how many Sisig for Saturday lunch", per dish per meal period.
- B3. **Month pacing:** "will I hit ₱300k this month?" Optionally the owner sets a monthly target (one new column, owner-only).
- B4. **Staffing hint:** busy-hour forecast against who is on shift ("Saturday 6–8pm usually needs 3, you have 2"). This needs shift schedules, and only past shifts exist now, so it is limited.
- B5. **Live pace:** "am I behind today?" compares sales so far with the same point on recent same weekdays.

### C. Inventory, looking forward
- C1. **Run-out dates:** "when will I run out of rice?" = on hand ÷ forecast use. Forecast use = dish forecast × recipe; with no recipe, the average of recent `sale` movements.
- C2. **Buy list:** "what do I buy for the weekend?" = forecast use over the next N days − on hand, rounded up, grouped by supplier.
  - Shown as a list the owner can copy/share.
  - Optional later: a two-phase "record this delivery" when it arrives (propose_stock_adjustment exists).
- C3. **Where did stock go:**
  - Stocktake variance (counted vs expected) per ingredient.
  - Waste by reason and by person.
  - Oversells on block stores.
- C4. **Cost creep** (needs `costs`): ingredients whose received price rose, dishes whose food-cost % crossed a line, and "raise Sisig to ₱X to get back to 30%". A price change goes through propose_menu_item_change, which already exists.
- C5. **Dead stock:** stocked items with no use in 14+ days, and their ₱ value.

### D. "Am I making money?"
- D1. **Profit for any period:** sales − dish cost − expenses, from the existing profit model. Needs the `costs` + `reports` keys.
- D2. **Expenses:** "how much on gas this month", top categories, bills due this week (`expense_bills`).
- D3. **Receipt photo → expense draft** (two-phase, like menu photos): the owner snaps a receipt, Owl files an expense proposal, Confirm saves it. Reuses the photo plumbing.
- D4. **Cash & shifts:** "was the drawer short yesterday?", over/short per cashier, pay-outs, remittances disputed, day not closed yet.
- D5. **Money given away:** discounts, vouchers, Senior/PWD and comps by person and reason; refunds; cancels after payment.
- D6. **Unpaid / balance due:** open bills and pay-later orders not settled.

### E. Owl speaks first (proactive)
- E1. **Morning brief** (push at opening time, opens Owl):
  - Yesterday in 3 lines.
  - Today's forecast.
  - Things running out.
  - "Needs a look" (flagged activity).
- E2. **Alerts**, worded by the same engines, at most N per day, each one switchable:
  - Sales well under forecast by mid-afternoon.
  - Unusual voids or discounts by one person.
  - A best seller suddenly at zero (sold out by mistake?).
  - A price set below cost.
  - The drawer short.
- E3. **Monday report card:** last week vs the week before, one win, one problem, one move.
- Infrastructure: a cron, a new `merchant_notifications` kind, the push route that already exists, and per-store opt-in. Biggest build after B.

### F. Customers & Messenger
- F1. **One customer:** "how often does Maria order, what does she get, any reward waiting?" Masked, and needs `customers`.
- F2. **What people ask on Messenger:** groups the questions the bot couldn't answer (chat log, 30 days), then proposes an auto-reply (a new two-phase `propose_messenger_rule`).
- F3. **Loyalty liability:** rewards earned but not claimed, and which ones expire soon.

### G. Operations
- G1. **Kitchen speed:** average time placed → ready by hour and by dish, late orders, slowest stretch of the day.
- G2. **Branch vs branch** on any metric, for store-wide accounts.
- G3. **Delivery:** Lalamove bookings, what delivery cost you vs what was charged, failed bookings.
- G4. **"What's sold out right now"** + bring it back (the propose tool exists).

## Recommended order

1. **Round 1** (approved) + A5 order lookup.
2. **Round 2: Forecast + inventory forward** (B1, B2, B5, C1, C2, C5). One engine feeds both; this is the "AI forecast" asked for.
3. **Round 3: Money** (D1, D2, D4, D5, D6, then D3 receipts, C3, C4).
4. **Round 4: Proactive** (E1 brief, then E2 alerts, E3). These reuse rounds 2–3, so they come after.
5. **Round 5: Ops & customers** (G1, F2, F1, G2, F3, G3).

Each round: its own plan file with the scope, the tests (pure engines + golden routing questions in EN/Taglish), live checks on the platform as the real role, a browser walk on sample-demo, and the app mirrors (`presentation.ts`, `links.ts`), shipped by OTA.

## Guardrails for every new tool
- Read through the caller's session client wherever RLS covers the data. Access is the matching staff key: `reports` / `costs` / `inventory` / `customers` / `activity_view`.
- Route orders through `resolveOrderBackend`. A Convex store gets the same answer or an honest "not available for this store".
- Bounded reads: ≤93 days, paged past 1000 rows, timed fetch.
- No ids, phones or emails reach the model. Writes stay two-phase with the owner's Confirm.
- A forecast always shows its range and its track record. Under 4 weeks of history, Owl says it can't forecast yet.
