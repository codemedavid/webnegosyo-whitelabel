# TDD evidence — Vouchers Phase 6b: discounting at the register

**Source plan**: inline plan from `/ecc:plan`, Phase 6 steps 6b–6d.
**Depends on**: [Phase 6a](./vouchers-phase-6a-pos-receipt.tdd.md).

The architectural question 6a left open was answered by the user: **the register
prices locally, the burn stays server-side.** Everything below follows from
that choice.

## User journeys

1. As a cashier, I want to take a voucher code at the counter and have it be
   worth exactly what it is worth online.
2. As a cashier, I want to take money off for a damaged item without needing a
   voucher to exist for it.
3. As an owner, I do not want any cashier able to discount a sale at will.
4. As an owner, I want to know who discounted a sale and why.
5. As a customer paying cash, I want to hand over the discounted amount, not the
   full one.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Port the engine | 5 failed (ENOENT ×5) | 5 passed |
| Discounts in `cartTotals` | compile-time: `'discountTotal' does not exist on CartTotals` | 46 passed |
| Register vouchers + manual discount | `Cannot find module './pos-discount'` | 21 passed |
| Discount reaches the written order | compile-time: `'discounts' does not exist in type 'PosOrderContext'` | 26 passed |

Merchant app: **1779 passed, 104 suites**, `tsc --noEmit` clean.
Web voucher + guardrail suites: **236 passed, 19 suites**.

## Why the port is byte-identical

`types.ts`, `eligibility.ts`, `discount.ts` and `stacking.ts` are copied
**verbatim** into `webnegosyo-app/lib/vouchers/`, and
`tests/unit/vouchers/engine-parity.test.ts` asserts byte equality.

Behavioural parity would only prove the cases someone thought to write down.
These modules were built portable — no Supabase, Convex or React types anywhere
in them — so verbatim copying costs nothing and makes drift *impossible* rather
than merely unlikely. The same voucher is now evaluated by two codebases; a
single differing rounding step would quote one figure online and charge another
in the shop.

One file exists purely to make this work: `webnegosyo-app/lib/order-totals.ts`
ports the `OrderDiscountLine` **type only**, so `stacking.ts` can keep its
import path. `computeOrderTotals` is deliberately *not* ported — the register's
arithmetic lives in `pos-cart.ts`, and two implementations of the same function
is exactly the duplication the money guardrail exists to prevent.

`repository.ts`, `resolve.ts`, `order-pricing.ts` and `mapper.ts` are not
ported: they reach a database, and the register reaches a different one.

## Decisions the tests encode

- **A manual discount requires a written reason and the `vouchers` permission.**
  The register prices locally, so the defence against a forced discount cannot
  be arithmetic — it is knowing who did it and why. This audit trail is what
  makes local pricing safe, and it is the direct consequence of the
  local-pricing decision rather than a bolt-on.
- **Over-100% is refused, not clamped.** A cashier meaning `10.00` and typing
  `1000` should be stopped, not silently obeyed with a free sale. Exactly 100%
  is allowed — a full comp is a real thing.
- **Permission and reason are checked before the amount is computed**, so a
  refusal never depends on the size of the sale. A cashier must not learn that
  the same discount is allowed on a bigger bill.
- **An invalid manual discount yields `null`, not a zero line.** "₱0.00 off"
  printed on a receipt is worse than no line.
- **A manual discount carries no `voucherId` or `code`** — nothing is redeemed,
  so nothing is burned.
- **Cash is checked against the DISCOUNTED total.** Refusing ₱350 on a ₱343.50
  sale would send a customer away over money they do not owe.
- **The discount blob is spread before `pos`** in `customerData`, so a discount
  can never displace the payment payload. Both are needed to settle a sale.
- **The stored `total` is what was actually taken off**, already capped, not the
  amount requested. The record must say what happened, not what was asked for.
- **`deliveryFee` is always 0 at the register**, so a free-delivery voucher
  correctly finds nothing to discount rather than being special-cased away.
- **`applyPosVouchers` is a thin pass-through and stays that way.** Every rule —
  expiry, branch, channel, stacking order, minimum spend — belongs to the shared
  engine. A register-specific exception is how the two surfaces would begin to
  disagree.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The engine is byte-identical across both codebases | `engine-parity.test.ts` | unit | PASS ×5 |
| 2 | Discounts come off the register's total, subtotal intact | `pos-cart.test.ts:cartTotals with discounts` | unit | PASS ×8 |
| 3 | An over-large voucher makes the sale free, never a refund | `…:never turns an over-large voucher into a refund` | unit | PASS |
| 4 | A corrupt (negative/NaN) amount cannot ADD to a bill | `…:ignores a corrupt discount amount` | unit | PASS |
| 5 | The cart is described in the engine's vocabulary | `pos-discount.test.ts:posDiscountContext` | unit | PASS ×3 |
| 6 | A checkout-only voucher is refused at the counter | `…:refuses a voucher that is not valid at the register` | unit | PASS |
| 7 | Only permitted staff may discount, and only with a reason | `…:validateManualDiscount` | unit | PASS ×9 |
| 8 | A manual discount becomes a labelled, capped, unredeemed line | `…:manualDiscountLine` | unit | PASS ×7 |
| 9 | The written order bills net and persists the breakdown | `pos-order.test.ts:buildPosOrder with a discount` | unit | PASS ×7 |
| 10 | An ordinary sale carries no discount key at all | `…:writes no discount key on an ordinary sale` | unit | PASS |

## Known gaps

- **No register UI yet.** Everything above is the logic layer; the POS screen
  does not yet have a code field or a discount button. `pos-discount.ts` is
  called by tests only.
- **Nothing burns a POS redemption.** The order is written with the discount,
  but `redeem_voucher()` is not called from the register, so a POS voucher's
  usage count does not move. This is the single most important remaining piece
  and it is a **real limitation of what shipped**, not a design decision — a
  usage-limited voucher can currently be reused at a counter.
- **No voucher lookup on the register.** `applyPosVouchers` takes `Voucher`
  objects; nothing yet fetches them by code from the app.
- **Manual discounts are not yet recorded against the staff member.** The reason
  is stored in the line label; the cashier id is not.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — missing engine | `9925fda` |
| GREEN — engine ported byte-identical | `9172fb6` |
| RED — register ignores discounts | `02f2543` |
| GREEN — discounts in `cartTotals` | `dae2de5` |
| RED — no register discount layer | `d6f78a5` |
| GREEN — vouchers + gated manual discount | `cea0184` |
| RED — discount never reaches the order | `c9b6067` |
| GREEN — order bills net and persists it | `0aa6699` |
