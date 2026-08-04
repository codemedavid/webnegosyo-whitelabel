# TDD evidence — settlement math for the web admin

## Source plan

No `*.plan.md`. This is **Phase 2, step 1** of the plan produced in the
`/ecc:plan` run recorded in
[`classic-checkout-voucher.tdd.md`](./classic-checkout-voucher.tdd.md).

Phase 2's goal is: a merchant looking at a placed order in web orders
management can attach a voucher, have the order re-priced, and have the
outstanding balance drop accordingly. This cycle delivers the foundation that
every later step needs. **Phase 2 is not complete** — see Known gaps.

## What the investigation found

The web admin has no concept of a balance. Grep
`recordPayment|amount_paid|balance` across `src/components/admin/order-detail-dialog.tsx`
and `src/components/admin/convex-order-sheet.tsx` returns **zero hits**. There is
also no order-revision write path anywhere in `src/` — searching for
`reviseOrder|revise_order|revisionNumber` hits only Convex deploy tooling.

The merchant app has had this since order editing shipped:
`webnegosyo-app/lib/order-balance.ts` — pure, 66 lines, and every
collect/refund/square decision on the register routes through it.

### Why this blocks the discount feature

Taking ₱40 off a bill that is already fully paid does not merely lower a total.
It turns ₱40 into money owed **back**. Without a balance the discount would be
silently given away: the order would show the lower figure and nobody would ever
be told to return the difference.

### Design decision, resolved by the codebase rather than by guesswork

The plan flagged "share the engine vs port it" as an open question needing a
human call. It did not need one — this repo already has an established,
enforced convention for cross-tree money code:

- `tests/unit/vouchers/engine-parity.test.ts` — byte equality for verbatim copies
- `tests/unit/vouchers/order-discount-parity.test.ts` — behavioural parity over shared fixtures
- `staff-permissions-parity.test.ts` — the pattern that started it, and which
  "earned its keep: the desktop copy there had silently fallen a key behind and
  nothing could see it"

So: **port, and pin with a behavioural parity test.** Behavioural rather than
byte parity because the two trees differ in style (quotes, semicolons) and a
formatting diff is not a defect.

## User journeys

1. As a merchant, I want to see what a customer still owes on a placed order, so
   that I can collect or refund the right amount.
2. As a merchant attaching a voucher to an already-paid order, I want the ₱40 it
   took off to show as money owed back, so that it is returned rather than
   quietly absorbed.
3. As a merchant, I want the register and the office to agree on what was paid.

## Task report

### 1. Settlement math available on the web

`src/lib/order-balance.ts` ported from the app copy: `amountPaid`,
`computeBalance`, `settlementIntent`, `OrderPayment`, `PaymentKind`,
`SettlementIntent`.

RED — `npx jest --config jest.config.cjs tests/unit/order-balance-parity.test.ts`:

```
● Test suite failed to run
  Cannot find module '../../src/lib/order-balance' from 'tests/unit/order-balance-parity.test.ts'
```

Compile-time RED: the test newly references the missing implementation, and the
failure is that absence, not broken setup.

GREEN — same command: **35 passed, 35 total**.

### 2. Parity with the register

Nine ledger shapes × five totals, run through both copies: unpaid, full payment,
part payment, payment-then-refund, over-refund, a `NaN` amount, an `Infinity`
amount, many small charges, and a zero-amount row.

GREEN: every parity case agrees.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | An untouched, fully paid order reads as settled | `order-balance-parity.test.ts:reports nothing owed on an untouched, fully paid order` | unit | PASS |
| 2 | A discount on a fully paid order becomes money owed back (−40, `refund`) | `:turns a discount on a fully paid order into money owed back` | unit | PASS |
| 3 | The same discount on an unpaid order just lowers what is collected | `:reduces what is still to collect on an unpaid order` | unit | PASS |
| 4 | A refund already issued nets against what was charged | `:nets a refund already issued against what was charged` | unit | PASS |
| 5 | One unreadable ledger row does not poison the total with NaN | `:skips an unreadable ledger row rather than poisoning the total` | unit | PASS |
| 6 | An over-refund is surfaced, not clamped to zero | `:surfaces an over-refund rather than clamping it to zero` | unit | PASS |
| 7 | Sub-centavo float drift reads as square | `:treats sub-centavo drift as square` | unit | PASS |
| 8 | A whole centavo does not read as square | `:does not treat a whole centavo as square` | unit | PASS |
| 9 | Web and register agree on amount paid, balance, and intent across 9 ledgers × 5 totals | `:settlement parity — web vs merchant app` | unit (parity) | PASS |

## Validation actually run

| Command | Result |
|---|---|
| `npx jest --config jest.config.cjs tests/unit/order-balance-parity.test.ts` | 35 passed, 35 total |
| `npx jest --config jest.config.cjs` (full web suite) | 449 passed, 1 skipped; 5,490 tests passed |
| `npx tsc --noEmit` | 0 errors under `src/` |
| `npx eslint src/lib/order-balance.ts tests/unit/order-balance-parity.test.ts` | clean, no output |

## Coverage and known gaps

No coverage run: this is one 66-line pure module and all six exports are
exercised by the 35 tests above.

**Phase 2 is NOT complete.** What this cycle delivers is the arithmetic. What
remains before a merchant can actually attach a voucher on the web:

1. **A payments reader for a stored order.** The ledger rides inside the
   free-form `customerData` blob (the same route discounts take, because the
   Convex schema is deployed per tenant). `readOrderDiscount` has a web copy;
   the payments equivalent does not.
2. **New-vs-already-burned code selection.** The register has
   `newDiscountLines` in `pos-edit-mode.ts` — attaching a code already on the
   order must not burn a second redemption. Needs a web copy plus parity.
3. **The write path, across three backends** — Convex, per-tenant Supabase,
   platform Supabase. Each persists totals differently. `src/` currently has no
   order-revision write path at all.
4. **Redemption burning.** Noted from prior work: `redeem_voucher` returns NULL
   with no error on refusal, so the failure path needs explicit handling.
5. **UI on `order-detail-dialog.tsx` and `convex-order-sheet.tsx`**, plus
   payment capture — which does not exist on the web in any form and is
   effectively a second feature riding along.
6. **No E2E** anywhere in Phase 2 yet.

Nothing in this cycle is wired to a screen, so it changes no live behaviour on
its own. That is deliberate: it is the piece every later step depends on, and it
is the piece that can be proven without touching money on real orders.

## Merge evidence

RED `b2a1fb0` → GREEN `36891ca`, both on `feat/android-sms-followups`.

- RED: `test: add reproducer for settlement math missing on the web admin`
  — suite failed to run, module absent.
- GREEN: `feat: give the web admin the settlement math for a placed order`
  — 35/35 pass; full suite 5,490 pass; tsc clean under `src/`; eslint clean.
- No refactor commit: the port is a straight transliteration with the module
  docstring rewritten for its new context; nothing left to clean up.
