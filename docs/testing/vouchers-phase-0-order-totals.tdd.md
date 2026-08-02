# TDD evidence — Vouchers Phase 0: centralize order totals

**Source plan**: inline plan produced by `/ecc:plan` for the voucher & discount system
(conversational mode; no `*.plan.md` artifact was written). Phase 0 of 8.

**Why this phase exists**: four separate surfaces recomputed
`total + deliveryFee + serviceCharge` by hand. A discount added to a shared
component would have reached four of the five checkout designs and silently
skipped the fifth — the customer sees, and is charged, full price. Nothing in
the type system or the linter catches that. So the totals get one owner before
any voucher code is written.

## User journeys

1. As a customer, I want the total I am shown at checkout to be the total I am
   charged, no matter which checkout design my merchant picked.
2. As a customer applying a voucher, I want the discount reflected in the total
   on the summary, the payment dialog, and the confirmation screen alike.
3. As a customer whose voucher is worth more than my cart, I want the order to
   be free — not to be quoted a negative amount.
4. As a merchant reviewing voucher performance, I want the recorded discount to
   be what was actually given away, not what the voucher nominally offered.

## Task report

### Task 1 — `computeOrderTotals` as the single arithmetic

Created `src/lib/order-totals.ts`: pure, I/O-free, centavo-rounded, discounts
clamped so `grandTotal` floors at zero and `discountTotal` reports the granted
amount rather than the requested one.

- **Validation**: `npx jest --config jest.config.cjs tests/unit/order-totals.test.ts`
- **RED**: `Cannot find module '@/lib/order-totals' from 'tests/unit/order-totals.test.ts'` — compile-time RED; the module under test did not exist.
- **GREEN**: `Tests: 13 passed, 13 total`
- **Guaranteed**: the no-discount path is arithmetically identical to the legacy
  inline formula (so this phase is a safe refactor), and the discount path
  behaves correctly at its boundaries (over-discount, negative amount, rounding).

### Task 2 — every surface routes through it

Replaced the inline formulas in `useCheckout.ts`, `checkout-shared.tsx`
(confirmation screen + payment dialog) and `classic-checkout.tsx`, and added a
source-level guardrail so a future design cannot reintroduce one.

- **Validation**: `npx jest --config jest.config.cjs tests/unit/order-totals-wiring.test.ts`
- **RED**: `Tests: 4 failed, 6 passed, 10 total` — failing on exactly the known
  offenders (`checkout-shared.tsx`, `classic-checkout.tsx`, and the two
  "routes through computeOrderTotals" assertions).
- **GREEN**: `Tests: 23 passed, 23 total` across both order-totals suites.
- **Full suite**: `Tests: 4886 passed, 8 skipped, 4894 total`.

### Behavior change (deliberate, not a pure refactor)

`PaymentDetailsDialog` computed its total with `deliveryFee || 0` and **no
address-match guard**, while `OrderSummaryLines` — rendered directly above it —
showed `—` for that same stale quote. A customer who edited their delivery
address after a fee was quoted saw two different totals on one screen and was
asked to pay the higher one. Routing the dialog through the hook's `grandTotal`
resolves both to the guarded value; the fee row in the dialog now carries the
same staleness guard.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Fee and service charge add to the subtotal exactly as the legacy formula did | `tests/unit/order-totals.test.ts:adds delivery fee and service charge to the subtotal` | unit | PASS |
| 2 | A null (unquoted) delivery fee counts as zero, not NaN | `…:treats a null delivery fee as zero` | unit | PASS |
| 3 | Fractional service charges round to centavos, not float noise | `…:rounds a fractional service charge to centavos` | unit | PASS |
| 4 | A discount line is subtracted from the grand total | `…:subtracts a single discount line from the grand total` | unit | PASS |
| 5 | Multiple stacked discounts sum | `…:sums multiple stacked discount lines` | unit | PASS |
| 6 | The grand total never goes negative | `…:never returns a negative grand total when the discount exceeds the bill` | unit | PASS |
| 7 | A clamped discount reports what was granted, protecting voucher reporting | `…:reports the discount actually granted, not the amount asked for` | unit | PASS |
| 8 | A negative discount amount cannot inflate the bill | `…:ignores a negative discount amount` | unit | PASS |
| 9 | The caller's discount array is never mutated | `…:does not mutate the caller-supplied discount array` | unit | PASS |
| 10 | No checkout template recomputes the grand total inline | `tests/unit/order-totals-wiring.test.ts:%s does not recompute the grand total inline` (7 files) | guardrail | PASS |
| 11 | `useCheckout` and the confirmation screen route through the shared arithmetic | `…:useCheckout derives grandTotal through computeOrderTotals` | guardrail | PASS |
| 12 | A stale delivery quote is excluded from the total, matching the summary | `…:a stale delivery quote is excluded from the total` | unit | PASS |

## Coverage

```
npx jest --config jest.config.cjs tests/unit/order-totals --coverage --collectCoverageFrom='src/lib/order-totals.ts'

File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 order-totals.ts |     100 |       90 |     100 |     100 | 73
```

Above the 80% threshold. The one uncovered branch is the `input.subtotal ?? 0`
defensive fallback on line 73, unreachable from TypeScript callers because
`subtotal` is a required field; it exists for untyped (ported JS) callers.

## Known gaps / follow-ups

- The **cart** designs and the POS register still compute their own totals; they
  are folded in during Phases 5–6 when a discount can actually reach them.
- `classic-checkout.tsx` renders no Subtotal row at all (its `total` binding was
  used only by the deleted inline formula). Left as-is — a visual change belongs
  to the checkout-UI phase, not a totals refactor.
- Three pre-existing `gray-on-color` design-hook findings in
  `classic-checkout.tsx` (L98/132/149) are untouched; they predate this change
  and are unrelated to totals.
- 5 failing suites under `sms/` are an untracked React Native project from a
  concurrent session being swept into this app's jsdom runner. They failed
  before this change and are outside its scope.

## Checkpoint commits

| Stage | Commit | Evidence |
|---|---|---|
| RED (module) | `895c441` | `Cannot find module '@/lib/order-totals'` |
| GREEN (module) | `d20106b` | 13/13 pass |
| RED (wiring) | `670dcee` | 4 failed / 6 passed |
| GREEN + refactor | `3208d2f` | 23/23 pass, 4886 pass overall |
