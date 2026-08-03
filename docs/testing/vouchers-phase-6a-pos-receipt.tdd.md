# TDD evidence — Vouchers Phase 6a: the register sees the discount

**Source plan**: inline plan from `/ecc:plan` ("the other phases we want to
build"), Phase 6 steps 6a and 6b.
**Depends on**: [Phase 5 checkout](./vouchers-phase-5-checkout.tdd.md).

This is the first slice of Phase 6. It makes the register **read** a discount
correctly. It does not yet let a cashier **apply** one — see Not done below.

## User journeys

1. As a customer paying at the counter with a voucher, I want a receipt whose
   arithmetic I can check.
2. As a merchant, I want the mismatch warning to mean something, so I notice it
   when it fires for a real reason.
3. As a merchant, I want the register and the storefront to agree on what a
   discount was, because they read the same order.
4. As a cashier editing a discounted order, I want the figure I confirm to be
   the figure the customer is billed.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Discounted receipt | 4 failed, 14 passed | 18 passed |
| App-side discount reader | `Cannot find module '../../webnegosyo-app/lib/order-discount'` | 14 passed |
| POS money guardrail | 1 failed, 4 passed | 5 passed |

Merchant app suite: **1743 passed, 103 suites**, `tsc --noEmit` clean.
Web voucher + guardrail suites: **233 passed, 19 suites**.

## What the RED actually printed

The receipt's own warning, on a plain discounted sale:

```
[Receipt] Subtotal mismatch: computed=327.50 vs order.total=300.00
```

Every voucher sale tripped it. A warning that fires on correct behaviour trains
a merchant to ignore the one signal meant to catch real corruption, so the
discount is now part of the sum rather than only a printed line.

## What the guardrail found

`lib/backends/order-revise.ts:192` held a **third** copy of the revised-order
total, separate from the `editModeTotals` copy the cashier reads.

I checked before reporting it as a bug, and it is **not** one: the call site
passes `carriedCharges` as the `serviceChargeAmount` argument, and that residue
is already net of any discount, so an edit preserves the discount today. It is
duplication, not a live defect — two functions that must agree with nothing
keeping them agreeing. Both now call `revisedOrderTotal`.

The register's discipline is markedly better than the web's was: `cartTotals`
and `editModeTotals` really were the only two places the arithmetic lived. The
guardrail exists to keep that true now that discounts give the arithmetic a
reason to be copied.

## Decisions the tests encode

- **`total` is always already net of the discount, on every backend.** The
  payload is the breakdown — what to print, what to refund — never the source
  of the amount charged. Nothing may subtract it twice.
- **The subtotal line appears whenever anything sits between the items and the
  total.** Previously it appeared only for delivery, which would have left a
  discount with no stated starting point.
- **A discount total that exceeds the sum of its lines is still printed**, as a
  residual `Discount:` line. That gap is a delivery discount, which has no line
  of its own, and it is money owed to the customer.
- **Only the READ half of `order-discount.ts` is ported.** The register never
  writes a discount payload; porting the builder would be a second copy of the
  arithmetic with no caller.
- **A malformed blob yields null, never a throw.** A receipt that throws is a
  sale the cashier cannot hand over.
- **An undiscounted receipt is byte-for-byte unchanged.** Almost every sale.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A discounted receipt names the voucher | `receipt-formatter.test.ts:prints a discount line` | unit | PASS |
| 2 | …and shows it as an amount taken off | `…:shows the discount as an amount taken off` | unit | PASS |
| 3 | …with a subtotal, so it reads top to bottom | `…:prints the subtotal too` | unit | PASS |
| 4 | …while TOTAL stays the backend's figure | `…:still prints the backend total as authoritative` | unit | PASS |
| 5 | The mismatch warning no longer cries wolf | `…:does not warn about a mismatch it can now account for` | unit | PASS |
| 6 | A discounted receipt fits the paper | `…:keeps a discounted receipt within the paper width` | unit | PASS |
| 7 | An ordinary receipt is unchanged | `…:leaves an undiscounted receipt byte-for-byte unchanged` | unit | PASS |
| 8 | Both codebases read a discount identically, over 13 shapes incl. malformed | `order-discount-parity.test.ts` | unit | PASS ×14 |
| 9 | No register file outside the two owners adds money up | `pos-money-wiring.test.ts:keeps the totals arithmetic…` | unit | PASS |
| 10 | The guardrail actually scanned files | `…:scans a plausible number of files` | unit | PASS |
| 11 | The placed and displayed totals come from `cartTotals` | `…:routes the placed order's total…` ×2 | unit | PASS |

## Not done in this slice

- **A cashier still cannot apply a voucher at the register.** This slice is the
  read side only. Entry needs the engine ported and an answer to the open
  question below.
- **Manual open discount** is not built. It needs a permission gate — an
  unbounded cashier-entered discount is a till-skimming vector.
- **No component test** for the printed output on a physical printer; the
  formatter is pure and tested, the native path is not.

## Open question this slice did not settle

Phase 3b's rule is that the client sends codes and never an amount. The
register's rule, stated in `buildPosOrder`, is that it computes its own total so
it works on a flaky connection at a counter. Both cannot hold.

My recommendation stands: **the register prices locally, the burn stays
server-side.** The conditional `UPDATE` in `redeem_voucher()` is already the
real over-redemption defence, so a forced discount is a staff-theft problem an
audit trail solves, not an anonymous-internet one. Requiring a round-trip before
the register can total an order breaks offline operation, which is the point of
a register.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — discounted receipt | `220e41a` |
| RED — missing app-side reader | `ad4721a` |
| GREEN — reader ported + receipt prints the discount | `1fcfe89` |
| RED — POS money guardrail | `89ae115` |
| GREEN/refactor — one revised-order total | `c732ce1` |
