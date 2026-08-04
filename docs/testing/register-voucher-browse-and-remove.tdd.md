# Choosing and removing a voucher at the register — TDD evidence

**Source plan:** none. Journeys were derived during this TDD run from two
screenshots of the register: the "Add discount" sheet (a bare code box) and a
sale carrying an applied `PWD` discount.

## User journeys

1. As a cashier, I want to see the vouchers my shop is currently running, so I
   can honour one without knowing how it is spelled.
2. As a cashier, I want to be told why a listed voucher will not go on this
   sale, so I have something to tell the customer.
3. As a cashier, I want to take a voucher back off a sale, so a mis-tap or a
   changed mind does not mean clearing the whole order and ringing it again.
4. As a cashier, I want to take back a manual discount too, which has no code
   to look up.

## What changed

| Layer | File |
|---|---|
| Read | `src/lib/vouchers/repository.ts` — `findActiveVouchers` |
| Route | `src/app/api/vouchers/list/route.ts` — POST /api/vouchers/list |
| Fetch | `webnegosyo-app/lib/voucher-service.ts` — `listVouchers` |
| Decide | `webnegosyo-app/lib/pos-voucher-picker.ts` — `buildVoucherChoices`, `voucherTerms` |
| Show | `webnegosyo-app/components/pos/VoucherChoiceRow.tsx`, `DiscountSheet.tsx` |
| Wire | `webnegosyo-app/app/(main)/pos.tsx` |

Removal from the sale itself already existed (`removeSessionVoucher`,
`clearSessionManualDiscount`, and `CartSheet`'s expanded rows). What was missing
was a way to reach it from the discount sheet, which is where the cashier is
standing when they realise the code is wrong.

## Task report

### 1. Turning a voucher list into something choosable

- **Validation:** `npx jest lib/pos-voucher-picker.test.ts` (in `webnegosyo-app/`)
- **RED:** `TS2307: Cannot find module './pos-voucher-picker'` — the test named
  a module that did not exist. Compile-time RED.
- **GREEN:** 10 passed.
- **Guaranteed:** usability verdicts come from the same engine the typed-code
  path uses (passed in as `judge`), never a second implementation; an already
  applied code is never re-judged, so "already applied" cannot render as if the
  voucher were broken; inactive and non-POS codes are not offered at all.

### 2. Reading the merchant's live vouchers

- **Validation:** `npx jest tests/unit/vouchers/repository.test.ts`,
  `npx jest tests/unit/api/vouchers-list.test.ts` (repo root)
- **RED:** repository — 3 failed, 9 passed (`findActiveVouchers` not exported).
  Route — 7 failed, 7 total (module did not exist).
- **GREEN:** repository 12 passed; route 7 passed.
- **Guaranteed:** the read is tenant-scoped and `is_active`-scoped *in the
  query*, not filtered afterwards — it runs under the service-role client,
  which bypasses RLS; an admin of another tenant gets 403 and the query never
  runs; a missing or user-less token gets 401; a plain cashier without the
  `vouchers` permission is served, matching the lookup route's reasoning.
- **Deliberately not filtered:** channel. A null `channels` column means "every
  channel", so a `contains('channels', ['pos'])` would drop exactly the
  vouchers that ARE valid at a counter. The mapper resolves the null and the
  picker filters on the mapped value.

### 3. Fetching it from the phone

- **Validation:** `npx jest lib/voucher-service.test.ts` (in `webnegosyo-app/`)
- **RED:** `TS2305: Module './voucher-service' has no exported member 'listVouchers'`.
- **GREEN:** 18 passed.
- **Guaranteed:** the cashier's own session token authenticates the read; a
  thrown fetch, a non-ok response, or a missing session all yield an empty list
  rather than an error — the browse list is a convenience over the typed-code
  path, which still works with no signal.

### 4. The sheet itself

- **Validation:** `npx jest components/pos/DiscountSheet.test.tsx`
- **RED:** 7 failed, 15 passed — the 15 pre-existing assertions stayed green
  throughout, so the new surface did not disturb the typed-code path.
- **GREEN:** 22 passed.
- **Guaranteed:** a listed code applies for the right money with nothing typed
  (₱60 off ₱300 of coffee, service charge undiscounted) and without calling the
  lookup; a refused code shows the engine's own sentence and does not move the
  bill however hard it is tapped; removing a voucher restores the full ₱330 and
  offers the code again; a manual discount can be taken back off.

The taps are asserted through the real store, the real discount session and the
real voucher engine — only the network is mocked. "The code was applied" is
asserted on the CartSheet's money, not on the sheet, because a code priced at
zero would otherwise pass for accepted.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A listed code applies for the right money with nothing typed | `components/pos/DiscountSheet.test.tsx:puts a chosen code on the sale for the right money, with nothing typed` | component | PASS |
| 2 | A code the engine refuses cannot be applied by tapping it | `DiscountSheet.test.tsx:does not apply a code the engine refuses, however hard it is tapped` | component | PASS |
| 3 | A refusal shows the engine's own sentence, not a dead tap | `DiscountSheet.test.tsx:says why a listed code cannot be used, rather than offering a dead tap` | component | PASS |
| 4 | Removing a voucher restores the full bill | `DiscountSheet.test.tsx:removes an applied voucher and restores the full bill` | component | PASS |
| 5 | A removed code is offered again, so a mis-tap is recoverable | `DiscountSheet.test.tsx:offers the removed code again, so a mis-tap is not a dead end` | component | PASS |
| 6 | A manual discount, which has no code, can also be taken back off | `DiscountSheet.test.tsx:takes back a manual discount, which has no code to look up` | component | PASS |
| 7 | The typed-code path still works when the list is empty | `DiscountSheet.test.tsx:keeps the typed-code box working when the list cannot be fetched` | component | PASS |
| 8 | An applied code is never re-judged as "already applied" | `lib/pos-voucher-picker.test.ts:marks a code already on the sale as applied rather than judging it again` | unit | PASS |
| 9 | Inactive and online-only codes are never offered at a counter | `lib/pos-voucher-picker.test.ts:hides a switched-off code…`, `…hides a code that can never be presented at a counter` | unit | PASS |
| 10 | Actionable rows sort above refused ones | `lib/pos-voucher-picker.test.ts:puts what the cashier can act on first` | unit | PASS |
| 11 | One merchant cannot read another merchant's promotions | `tests/unit/api/vouchers-list.test.ts:refuses to hand one merchant another merchant-s promotions` | integration | PASS |
| 12 | An unauthenticated or user-less token is refused before any query | `tests/unit/api/vouchers-list.test.ts:rejects a request with no Authorization header`, `…rejects a caller whose token names no user` | integration | PASS |
| 13 | The browse read is tenant- and is_active-scoped in the query itself | `tests/unit/vouchers/repository.test.ts:scopes the browse list to the tenant and to codes that are switched on` | unit | PASS |
| 14 | A failed read offers nothing rather than an unusable list | `tests/unit/vouchers/repository.test.ts:offers nothing when the read fails`, `lib/voucher-service.test.ts:shows nothing rather than an error when the counter has no signal` | unit | PASS |

## Refactor

`VoucherChoiceRow` was extracted from `DiscountSheet` to keep both files small,
and four synchronous tests were made async so the sheet's opening fetch settles
inside `act`. Suite re-run after both: 164 suites / 2590 tests passed, zero act
warnings, `npx tsc --noEmit` clean.

## Coverage

`npx jest --coverage` over the four touched modules:

| File | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `components/pos/DiscountSheet.tsx` | 94.52 | 82.35 | 94.44 | 98.52 |
| `components/pos/VoucherChoiceRow.tsx` | 100 | 100 | 100 | 100 |
| `lib/pos-voucher-picker.ts` | 100 | 81.81 | 100 | 100 |
| `lib/voucher-service.ts` | 94.23 | 86.95 | 90 | 95.55 |

Above the 80% floor on every axis.

## Known gaps

- **Not proven end to end.** `/api/vouchers/list` has never been called by a
  real handset against a real deployment; the mobile side is proven only
  against a mocked fetch. It ships behind the same web app as
  `/api/vouchers/lookup`, so it needs the web app deployed before the sheet
  will list anything.
- **Pre-existing failure, untouched by this work:**
  `tests/unit/vouchers/engine-parity.test.ts` › "keeps the order summary rows
  identical across both codebases" fails on this branch. Both
  `src/lib/order-summary-rows.ts` and `webnegosyo-app/lib/order-summary-rows.ts`
  are unmodified here; the drift arrived with commit `8059718`.
- **No pagination.** A merchant running dozens of promotions gets all of them
  in one scrolling list. The list is bounded in height, not in length.
