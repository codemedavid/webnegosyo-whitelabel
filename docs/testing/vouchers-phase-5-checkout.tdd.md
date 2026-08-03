# TDD evidence — Vouchers Phase 5: checkout entry

**Source plan**: inline plan from `/ecc:plan` ("remaining tasks"), Phase 5.
**Depends on**: [Phase 3b server authority](./vouchers-phase-3b-server-authority.tdd.md),
[Phase 4 admin](./vouchers-phase-4-admin.tdd.md).

**This is the phase that makes the feature reachable by a customer.**

## User journeys

1. As a customer, I want to type a code and see what it takes off.
2. As a customer, I do not want to be shown a discount and then charged
   without it.
3. As a customer entering two codes where the second is refused, I want to know
   *which* one failed.
4. As a merchant, I want the amount on the QR I ask customers to scan to match
   the amount on the order.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Guardrail on the checkout hook | `useCheckout.ts:746` reported | 14 passed |
| Checkout voucher field state | `Cannot find module '@/lib/vouchers/checkout-codes'` | 21 passed |
| Hook wiring + shared UI | — (typecheck/lint/full-suite gate) | 4946 passed |

Full suite: `4946 passed, 34 failed` — the same pre-existing failures as
`origin/main`. `tsc --noEmit`: 0 errors under `src/`.

## A second bug the guardrail caught

`useCheckout` derives the shared `grandTotal` through `computeOrderTotals`
correctly — and then built a **second** total 500 lines further down for the QR
handoff payload:

```ts
const grandTotalForQr = total + serviceChargeAmount
```

That is the amount a customer is asked to pay when they scan. It omitted the
delivery fee entirely, so **a delivery order paid by QR already asked for less
than the order billed** — before any voucher work. It now reuses the same
`grandTotal` the summary renders, which also means a discount reaches it.

This is the fourth money-bearing surface the guardrail has found since Phase 0
(the others: `PaymentDetailsDialog`, the merchant notification email, and the
three order write paths). Each was invisible because it kept compiling and kept
looking right.

## Decisions the tests encode

- **A stale preview contributes nothing.** Any change to the lines, the
  delivery fee or the service charge invalidates it, and the total falls back to
  full price while it re-checks. A customer shown one number and billed another
  is the worst way to be right — the server re-prices from the codes regardless.
- **Adding or removing a code drops the preview too.** Stacking is sequential,
  so every code changes what the others are worth.
- **Entry order survives.** It decides a solo-only conflict, and reordering
  would silently give someone a different deal than the one they typed.
- **Rejections are per code, not one banner.** With stacking, one code can be
  accepted while the next is refused.
- **The field lives in `OrderSummaryLines`**, shared by all five designs, so a
  voucher behaves identically on each instead of being wired five times.
- **The order sends codes, never the previewed amount.**

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The QR total is the total the summary shows | `order-totals-wiring.test.ts` | unit | PASS |
| 2 | A code is normalized on entry | `checkout-codes.test.ts:adds a normalized code` | unit | PASS |
| 3 | The same code twice does not discount twice | `…:refuses a duplicate` | unit | PASS |
| 4 | Entry order is preserved | `…:keeps entry order` | unit | PASS |
| 5 | State is never mutated in place | `…:does not mutate the state it was given` | unit | PASS |
| 6 | Adding or removing a code drops the preview | `…:drops a preview` / `…:drops the preview` | unit | PASS |
| 7 | The fingerprint changes on line, fee and charge changes | `cartFingerprint` ×5 | unit | PASS |
| 8 | A moved cart marks the preview stale | `isPreviewStale:is stale when the cart moved` | unit | PASS |
| 9 | A null or fully-rejected preview yields no discount lines | `discountLinesFrom` ×2 | unit | PASS |

## Known gaps

- **No component test for `VoucherField`.** Its logic is the tested pure module
  plus rendering; the wiring is held by typecheck and the full suite. A
  render test asserting a rejection message appears next to the right code
  would be worth adding.
- **No end-to-end test of the whole path** (enter code → order → redemption
  burned). Every segment is covered in isolation. This is the highest-value
  test still missing in the feature.
- **Scoped vouchers still cannot be created from the UI** (Phase 4 gap), so the
  category path of the checkout preview is exercised only by unit tests.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — guardrail on the hook | `b2bae0a` |
| GREEN — QR total | `477f381` |
| RED — checkout voucher state | `a695691` |
| GREEN — checkout voucher state | `b9af0f5` |
| GREEN — hook wiring + shared field | `9dc795e` |
