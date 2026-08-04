# TDD evidence — voucher entry on the default web checkout

## Source plan

No `*.plan.md`. Journeys were derived during the `/ecc:plan` run that preceded
this cycle, from the user's question: why vouchers cannot be attached on the
mobile POS, the web checkout, and orders management.

### What the investigation found

Three surfaces, three different causes. Only the middle one was addressed here.

| Surface | Attach a voucher? | Cause |
|---|---|---|
| Mobile POS — counter sale | yes | shipped |
| Mobile POS — editing a placed order | yes | gate removed earlier the same day in `6acb6ea` |
| Mobile orders management | yes, indirectly | order detail → Edit → register → discount sheet |
| Web checkout — modern / minimal / wizard / express | yes | `OrderSummaryLines` renders `VoucherField` |
| **Web checkout — classic** | **no** | hand-rolls its own summary; never renders the field |
| Web admin orders management | no | discount is render-only; no edit write path, no payment capture at all |

`classic` is the default template and carries almost every tenant:

```sql
select coalesce(checkout_template,'(null)') as tpl, count(*) from tenants group by 1 order by 2 desc;
-- classic 167 | modern 5 | express 1 | wizard 1 | minimal 1
```

So online voucher redemption was unreachable for 167 of 175 tenants. Nothing
was mis-priced — `grandTotal` is derived through `computeOrderTotals` and is
already net of accepted codes. There was simply nowhere to type the code.

The cause is documented in the file itself: `classic-checkout.tsx` is
"preserved verbatim … must remain pixel-identical to the pre-template
checkout". The voucher field was added later, to the shared primitive that
classic does not use.

Meanwhile `checkout-primitives.tsx:497` carries the comment *"Shared by all
five designs, so a voucher works the same everywhere."* That comment has been
false since it was written. This is the reason the guardrail below matters more
than the fix.

## User journeys

1. As a customer on the default storefront checkout, I want to enter a voucher
   code, so that the discount comes off before I am asked to pay.
2. As a customer stacking two codes, I want to be told which one was turned down
   and why, rather than a single "invalid voucher" banner.
3. As a customer, I want to take a code back off if I change my mind.

## Task report

### 1. Guardrail — every design must offer voucher entry

A design qualifies by rendering `<VoucherField` itself or by delegating its
summary to `<OrderSummaryLines`, which renders it. Rendering neither is the
defect. The check reads template source, mirroring the existing
`tests/unit/order-totals-wiring.test.ts` guardrail, which pins the same class of
failure for totals ("silently omits the discount … on one checkout template out
of five").

RED — `npx jest --config jest.config.cjs tests/unit/classic-checkout-voucher.test.tsx`:

```
✕ classic checkout lets a customer enter a code
✓ modern checkout lets a customer enter a code
✓ minimal checkout lets a customer enter a code
✓ wizard checkout lets a customer enter a code
✓ express checkout lets a customer enter a code
```

The four passing rows are what make the failing row meaningful — the test
discriminates between designs rather than failing universally.

GREEN — all five pass after the fix.

### 2. Voucher entry rendered on classic

`VoucherField` inserted into classic's own summary markup, directly above the
total, plus a Discount summary row. The summary was deliberately **not** swapped
for `OrderSummaryLines`: that would change spacing and typography on 167 live
storefronts, against the file's stated constraint.

RED: 6 failed, 5 passed — every failure for the intended reason
(`Unable to find a label with the text of: /have a voucher/i`).

GREEN: 11 passed, 0 failed.

### 3. No total arithmetic changed

`grandTotal` already flows from `computeOrderTotals` with the discount lines
applied. The test `shows the discounted total, not the full one` passed in the
RED run, before any production edit — confirming classic already renders the net
figure and only the entry point was missing. It is kept as a regression pin.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every one of the five checkout designs offers voucher entry | `classic-checkout-voucher.test.tsx:every checkout design offers voucher entry` | unit (guardrail) | PASS |
| 2 | The default checkout gives a customer somewhere to type a code | `:shows a customer somewhere to type a code` | unit | PASS |
| 3 | A typed code reaches the checkout hook | `:hands a typed code to the checkout hook` | unit | PASS |
| 4 | An accepted code shows its amount on the code and as a Discount row | `:shows what an accepted code took off` | unit | PASS |
| 5 | A rejected code states its reason against that code | `:tells the customer why a code was turned down` | unit | PASS |
| 6 | A customer can remove an applied code | `:lets the customer take a code back off` | unit | PASS |
| 7 | The total shown is the discounted one | `:shows the discounted total, not the full one` | unit | PASS |

Evidence command for all of the above:
`npx jest --config jest.config.cjs tests/unit/classic-checkout-voucher.test.tsx`

## Validation actually run

| Command | Result |
|---|---|
| `npx jest --config jest.config.cjs tests/unit/classic-checkout-voucher.test.tsx` | 11 passed, 11 total |
| `npx jest --config jest.config.cjs` (full web suite) | 448 passed, 1 skipped; 5,455 tests passed |
| `npx tsc --noEmit` | 0 errors under `src/` |
| `npx eslint <both changed files>` | clean, no output |

## Coverage and known gaps

No coverage run: `npm run test:coverage` walks the whole repo and this change is
two files. The behaviour added is fully covered by the seven guarantees above.

Known gaps, deliberately not closed here:

- **No E2E.** These are jsdom component tests against a mocked `useCheckout`.
  The round trip — code typed, `validateVoucherAction` called, server re-price
  at order time — is not exercised end to end on the classic template.
- **Web admin orders management is untouched.** Attaching a discount to a placed
  order on web remains impossible, and there is no payment capture there at all
  (`recordPayment` / `amount_paid` / `balance` appear nowhere in
  `order-detail-dialog.tsx` or `convex-order-sheet.tsx`). That was scoped as
  Phase 2 and not started.
- **The guardrail is source-text based.** It proves the field is rendered, not
  that it is reachable in every layout state — a design could render it inside a
  collapsed step and still pass.

## Pre-existing conditions noted, not introduced

- `npx tsc --noEmit` reports 90 errors repo-wide, all in test/e2e/`sms/` files
  and none under `src/`. Pre-existing; unrelated to this change.
- The `impeccable` design hook flags three `gray-on-color` findings in
  `classic-checkout.tsx` at the order-type selector (~L101/L135/L152). Those
  predate this change and are outside the summary block edited here. Left
  unchanged: altering them would change the appearance of the default checkout
  for 167 tenants, which is not in scope for a voucher-entry fix.

## Merge evidence

RED `40e3eca` → GREEN `b962c6d`, both on `feat/android-sms-followups`.

- RED: `test: add reproducer for voucher entry missing on the default checkout`
  — 6 failed / 5 passed, failures all "no voucher entry on classic".
- GREEN: `feat: let a customer redeem a voucher on the default checkout`
  — 11/11 pass; full suite 5,455 pass; tsc clean under `src/`; eslint clean.
- No refactor commit: the change is an insertion into existing markup with
  nothing left to clean up.

### Process note

During validation a `git stash --keep-index` was run in this shared working
tree, which stashed not only this work but another concurrent session's
uncommitted SMS changes. It was restored in full via `git stash pop` and
verified against `git status` (8 modified files plus 11 untracked paths all
present), and GREEN was re-confirmed afterwards. Recorded because the tree is
shared and a stash here is destructive to other sessions.
