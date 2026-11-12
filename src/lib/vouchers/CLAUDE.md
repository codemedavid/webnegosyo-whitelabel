# Per-item and per-unit discounts: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Per-item & per-unit discounts ("50% off ONE fries")

- **Engine** (`src/lib/vouchers/discount.ts`, byte-identical in the app): `vouchers.max_discounted_units` (NULL = every unit; CHECK refuses it on free delivery) limits a voucher to N units — the **cheapest** eligible units, ties in cart order, unless `DiscountContext.unitPicks` (code → line id → units) chose others; an invalid pick falls back to cheapest, never throws. Percent comes off each unit; fixed comes off EACH unit (≤ the unit); the peso cap covers the lot. `RemainingAmounts.byUnit` (centavos) makes stacked discounts work per unit, so nothing goes below zero.
- **Register**: `ManualItemDiscount` (one per line, % or ₱ off each of N units, reason + `vouchers` permission) via the sheet's "One item" tab; "Which item gets it" moves a unit-limited voucher (`session.unitPicks`). Order: vouchers → item discounts → whole-order discount, each on what is left. Senior/PWD never stacks: "higher of the two" counts all of these as the other side.
- **Checkout**: preview returns `unitLimit`/`eligibleLineIds`/`items` (the customer's own lines only); "Applies to · Change" sends picks to `createOrderAction` as `line-<index>`, sanitized (`unit-picks.ts`) and re-validated by the engine.
- **Stored**: discount lines carry `items: [{ lineKey: "line-<i>", units, amount }]` (read via `discountLineItems`); `allocationsByLine` holds every line-specific share → `order_items.discount_amount`, split bills (on that dish's next pieces), edits. Receipts/order screens/Messenger print the dish under the row ("  Fries x1"). Convex unchanged (`customerData`/`discount` are `v.any()`).
- **Old registers**: `/api/vouchers/{lookup,list}` withhold unit-limited vouchers unless the request sends `X-Voucher-Features: units` (an old build would discount every unit). Live check: `VOUCHERS_UNITS_LIVE=1 npx jest tests/live/vouchers-unit-limit-live.test.ts` (demo store, cleans up).

- **Customer picks**: a customer may move a one-item voucher onto a pricier eligible unit — that is the owner's choice of feature; an owner who worries about it sets the voucher's peso cap ("Max discount").
