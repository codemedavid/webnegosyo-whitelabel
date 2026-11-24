# Sales numbers that add up (Koko Coffee, 2026-11-24)

Branch `fix/koko-sales-reconcile` (worktree `../whitelabel-koko-reports`, from origin/main 40536b73).

## What the owner saw

Sales, payment methods and order types "don't balance". Store `koko-coffee-company` (platform backend).

## What was checked (live, platform DB, as the owner's own session, read-only)

- The report engine itself reconciles to the centavo on every day 2026-11-10 → 11-24:
  Σ order types = Σ channels = net sales, and Σ payment methods = net + delivery fees − still to collect.
- November 1–24 as the Sales screen gets it:
  - Net sales ₱25,110 = Dine In ₱15,785 + Pick Up ₱6,895 + Delivery ₱2,430
  - Money received ₱25,175 = Cash ₱20,725 + GCash ₱2,840 + **"Paid, method not picked" ₱1,610**
  - Difference: + ₱140 delivery fees − ₱75 still unpaid (web order, delivered, never marked paid)
- Other screens show a THIRD figure for the same month: ₱25,250 (Σ order totals, delivery fees and the unpaid ₱75 included).

## Root causes

1. **Pay-later orders are marked paid with no method and no payment row.** When a register "pay later"
   order is completed, `markPaidAfterHandover` (`webnegosyo-app/lib/order-status-change.ts`) writes
   `payment_status = paid` and nothing else. The orders-list Complete button and the pickup scan do it
   without asking; the order screen asks, but its "Already paid — mark delivered" option does the same.
   Koko: 7 orders / ₱1,610 this month (all by one cashier, 0.3 s after "completed" in Store Activity).
   Cash + GCash can never add up to sales, and the drawer can't be checked.
   Platform-wide, last 30 days: 72 such POS orders, ≈ ₱26,000, 8 stores (shak-owl, lig-a, mauros-cafe, …).
2. **"Sales" has four formulas.** Reports + app Sales screen + order types = net sales (no delivery/service
   fees). App Home "Revenue · Today", Growth, Daily report takings and the customer dashboard = Σ order
   totals (`summarizeDashboardStats`, `computeTrends`, `customer-order-facts`). Web admin dashboard "Sales" =
   Σ totals of "completed" orders only (`src/lib/dashboard/overview.ts`). CLAUDE.md: one definition only.
3. **Lists cut at 4 rows with no remainder** (`shareRows`, `MIX_ROWS = 4` in `SalesOverview.tsx`). A store
   with 5+ payment methods or order types sees rows that can't add up. Not Koko today; latent.

## Fix

### A. Money is recorded when an order is handed over (app, JS only → OTA)
- Completing an order that still owes money and has no method opens the collect sheet (method + amount,
  cash change) from the order list, the order screen and the scan. "Already paid — mark delivered" becomes
  "Paid another way": pick the method, and a payment row is written for the balance.
- `markPaidAfterHandover` is removed; the only path to `paid` without a ledger row stays the online
  verified-transfer route (the order carries its method there).
- A paid order with no method and no payment row shows "How was this paid?" on the order screen → records
  the method. Koko's owner can fix their 7 orders themselves (no data repair by us).
- Tests: pure planner (`order-status-change.ts` / `order-payment-prompt.ts`) never returns "mark paid" for a
  method-less unpaid order; a guardrail test lists every `paymentStatus: "paid"` write site.

### B. One sales number everywhere (web + app)
- App Home hero, Growth and Daily report takings read net sales from `POST /api/reports/query` on platform
  stores, labelled "Net sales". Convex stores unchanged.
- Web dashboard "Sales" tile (platform) reads `report_sales_summary` net sales.
- Customer dashboard split uses the sales model's per-order net (`orderFigures`), not order totals.
- Guardrail: registry test of every surface that prints a sales figure and the source it must read;
  `tests/live/sales-model-live.test.ts` gains: Σ payments = net + delivery + service − unpaid + overpaid,
  Σ order types = Σ channels = net, Home today = Sales today.

### C. Cards always add up
- Order types / Money received / channels show "Everything else" when there are more rows than fit.

### Optional D. Database backstop (needs owner OK)
- Refuse an `authenticated` write of `payment_status = paid` on a POS order with no method and a ledger
  short of the total (42501). Old app builds swallow the error, so the order reads "still to collect"
  (true) instead of "method not picked". Blast radius to prove first: web admin mark-paid, offline replay,
  bill split, register tender ordering (status before payment row).

## Proof before "done"
- Jest (app + web), `npm run verify`, SQL parity untouched.
- Live read-only reconciliation on Koko + one other store.
- Simulator on `sample-demo`: pay-later order → Complete from the list → method asked → Sales shows it under Cash.
- Web dashboard + /admin/reports screenshot on `sample-demo`: same net sales.
