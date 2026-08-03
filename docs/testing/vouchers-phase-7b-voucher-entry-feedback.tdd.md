# TDD evidence — Vouchers Phase 7b: telling the cashier why

**Source plan**: inline plan from `/ecc:plan`, Phase 7 follow-up.
**Depends on**: [Phase 7](./vouchers-phase-7-orders-management.tdd.md).

This pass began by verifying two defects I had recorded as known gaps. **Both
turned out to be wrong.** Checking them surfaced a third, real one, which is
what got fixed.

## Two retractions

Recording these plainly, because an evidence report asserting defects that do
not exist is worse than no report.

**1. "Refund and void work from the gross."** Wrong. The refund path is
`computeBalance(newTotal, payments)`, where
`newTotal = revisedOrderTotal(itemsTotal, deliveryFee, carriedCharges)` and
`carriedCharges = deriveCarriedCharges(order.total, lines, deliveryFee)`.
`order.total` is stored **net of the discount**, so both sides of the balance
are discounted figures and the arithmetic was already right. There is no
separate void-refund path, and the web app has no refund logic at all — only
refund *policy* text. I called this "the most important remaining item" and a
"live cash-loss risk" across two turns. It was neither.

**2. "A voucher's usage limit is not checked at entry."** Overstated.
`eligibility.ts:93` rejects `usage_limit_reached`, so an exhausted code was
never priced as a discount.

Both claims came from the plan's assumptions rather than from reading the code.
The lesson is narrow and worth keeping: a "known gap" written from a plan is a
hypothesis, and belongs in an evidence report only after it has been checked
against the source.

## The real defect

Verifying claim 2 exposed it. The engine refuses a code with a written reason —
"This voucher has been fully claimed." — and `DiscountSheet` was **discarding
that sentence**. Its only check was whether the lookup returned anything, so a
code that existed but could not be used was added to the sale, priced at zero,
and rendered no row. The cashier watched the sheet close with nothing changed
and had nothing to tell the customer.

Introduced in Phase 6d.

## User journeys

1. As a cashier, when a code does not work, I want to know why so I can tell
   the customer.
2. As a cashier, I do not want a code to look accepted when it changed nothing.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Refused voucher fails silently | compile-time: `Cannot find module './pos-voucher-entry'` | 8 passed |

Merchant app: **1827 passed, 108 suites**, `tsc --noEmit` clean.

## Decisions the tests encode

- **The verdict is reached by pricing the sale the voucher WOULD join**, not by
  inspecting the voucher alone. A solo-only code is fine by itself and refused
  alongside another, so the answer depends on the whole session.
- **The engine's own wording is surfaced verbatim.** Re-writing refusal
  messages here would give the counter and the storefront different
  vocabularies for the same rule.
- **An already-applied code is refused explicitly.** Re-adding is a silent
  no-op, which would otherwise look identical to a voucher worth nothing.
- **A code accepted by every rule but worth nothing is still refused** — a
  free-delivery voucher at a counter has no delivery to discount, and a zero
  row reads as a broken discount.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A usable code is accepted | `pos-voucher-entry.test.ts:accepts a voucher that is worth something` | unit | PASS |
| 2 | A fully claimed code is refused, with the reason | `…:refuses a fully claimed voucher and says so` | unit | PASS |
| 3 | An expired code is refused, with the reason | `…:refuses an expired voucher and says so` | unit | PASS |
| 4 | A code below its minimum is refused, with the reason | `…:refuses a voucher below its minimum spend` | unit | PASS |
| 5 | A code locked to another branch is refused | `…:refuses a voucher locked to another branch` | unit | PASS |
| 6 | Re-applying a held code is refused explicitly | `…:refuses a code already applied to this sale` | unit | PASS |
| 7 | The verdict depends on the whole sale, not the voucher alone | `…:judges the voucher against the sale it would actually join` | unit | PASS |
| 8 | A valid-but-worthless code is refused rather than shown as zero | `…:refuses a voucher that is valid but worth nothing here` | unit | PASS |

## Known gaps

- **The wiring is untested**, as with all of Phase 6d: the store and the sheet
  are outside jest's roots. `previewSessionVoucher` is proven; that
  `DiscountSheet` calls it is only typechecked.
- **A race remains between lookup and burn.** `usedCount` is a snapshot, so
  another till can exhaust a code in between. The conditional UPDATE in
  `redeem_voucher()` still prevents over-redemption in the database; what the
  cashier sees is a discount given on a sale whose burn then fails. This is the
  accurate version of the claim retracted above.
- **`order-card.tsx` and `convex-order-sheet.tsx`** remain unwired from
  Phase 7.
- **The edit path** remains untouched, still pending the business decision on
  what a voucher should do when an edit removes the qualifying item.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — refused voucher fails silently | `4dd424a` |
| GREEN — the cashier is told why | `718e9ab` |
