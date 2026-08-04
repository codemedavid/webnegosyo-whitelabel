# TDD evidence — settlement foundations for the web admin

## Source plan

No `*.plan.md`. This is **Phase 2, steps 1–5 (step 5 partial)** of the plan produced in the
`/ecc:plan` run recorded in
[`classic-checkout-voucher.tdd.md`](./classic-checkout-voucher.tdd.md).

Phase 2's goal is: a merchant looking at a placed order in web orders
management can attach a voucher, have the order re-priced, and have the
outstanding balance drop accordingly. These cycles deliver the foundation that
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

### 3. The settlement account a merchant reads (step 2)

`computeBalance` answers one number; a screen needs the account behind it —
charged, refunded, net, and which of collect / refund / settled to offer. This
is the layer the attach-a-voucher flow reads: after a ₱40 code lands on a fully
paid ₱250 order the merchant must be shown a refund of ₱40, which needs the
charged and refunded halves kept apart rather than collapsed into a net.

`src/lib/order-settlement.ts` ported from `summarizeSettlement` in
`webnegosyo-app/lib/order-history-view.ts`.

RED — `npx jest --config jest.config.cjs tests/unit/order-settlement-parity.test.ts`:

```
● Test suite failed to run
  Cannot find module '@/lib/order-settlement' from 'tests/unit/order-settlement-parity.test.ts'
```

GREEN — same command: **13 passed, 13 total**.

**Numbers only, deliberately.** The app's copy also returns a pre-formatted
`balanceLabel` built from its own `formatPeso`; the web formats with
`formatPrice` from `@/lib/cart-utils`. Porting the label would be a second
money-formatting implementation with no caller. Parity therefore compares the
five numeric/intent fields — which is all that can meaningfully drift — across
8 ledgers × 5 totals.

Callers must label the balance themselves, and must: `balance` is signed while
the label is not. The screen says "Still owing" or "Refund due", so a minus sign
in the figure would read as a negative refund.

### 4. Absent ledger vs unreadable ledger (step 3)

The blocker flagged at the end of step 2, resolved. `src/lib/order-ledger.ts`
ported from `webnegosyo-app/lib/order-ledger.ts`.

**The decision that was open, and how it resolved.** The question was whether to
port `stale-backend.ts`'s Convex-specific matching or define the web's own
classification. Reading `stale-backend.ts` settled it: the marker
(`Could not find public function`) is **Convex's own wording, produced by the
deployment rather than by any client**, so it matches identically on both sides.
There was no client-specific error contract to reverse-engineer.

What genuinely differs is the INPUT. The register reads `error?: string | null`
out of `useSafeQuery`; the web's Convex client throws `Error` objects. The web
copy therefore accepts `unknown` and normalizes — strictly wider than the app's,
so it cannot classify a shared message differently, which the parity block pins.

`stale-backend.ts` itself was deliberately **not** ported: it answers "was this
WRITE rejected, and what do I tell the cashier?" and carries advice copy the web
has no caller for. Only the read-trust half was needed.

**The asymmetry that drove the implementation.** Both misreadings are bugs, but
they are not equally expensive:

- absent read as unavailable — merchants are blocked from editing. This already
  happened, on most stores.
- unavailable read as absent — a fully-paid order renders as owing its whole
  total, and a merchant collects money the customer already handed over.

So only the one marker that *proves* emptiness returns `absent`. Everything
unrecognised — an argument rejection, a network failure, an object of an
unexpected shape — falls to `unavailable`.

RED — `npx jest --config jest.config.cjs tests/unit/order-ledger-parity.test.ts`:

```
● Test suite failed to run
  Cannot find module '@/lib/order-ledger' from 'tests/unit/order-ledger-parity.test.ts'
```

GREEN — same command: **25 passed, 25 total**.

### 5. Which codes an attach newly added (step 4)

`src/lib/order-discount-attach.ts`, ported from `newDiscountLines` in
`webnegosyo-app/lib/pos-edit-mode.ts`.

An order arriving in orders management already carries whatever discount it was
placed with. When a merchant attaches another code, one question decides whether
money and a redemption are given away twice: which lines are NEW?

- Count a carried code again → one voucher takes its discount off twice.
- Burn a carried code again → a second redemption is spent from the customer's
  own allowance for a voucher presented once.

Manual lines are excluded by design: real money off the bill with no voucher
behind them, so nothing to redeem and nothing that could be redeemed twice. They
must never reach a redemption call. Zero, `NaN` and negative amounts are excluded
too — the payload is read from an untyped database edge, and a negative
"discount" would add money to a bill.

RED — `npx jest --config jest.config.cjs tests/unit/order-discount-attach-parity.test.ts`:

```
● Test suite failed to run
  Cannot find module '@/lib/order-discount-attach' from 'tests/unit/order-discount-attach-parity.test.ts'
```

GREEN — same command: **22 passed, 22 total**, including 11 shared parity cases.

### 6. Re-pricing a placed order on attach (step 5, core)

`src/lib/order-attach-reprice.ts` — `repriceAttachedDiscount`.

This is the arithmetic the three backend write paths will each persist,
computed ONCE so Convex, the platform Postgres and a tenant's own Postgres
cannot disagree about what the customer was charged. Each write path's job is
to store this result, never to derive its own.

**The invariant it rests on**, stated in `order-discount.ts` and true on every
backend: an order's `total` is ALREADY net of its discount. The stored payload
is the breakdown, never the source of the amount charged. So only the NEWLY
attached lines are subtracted — subtracting the carried discount again would
take the same money off twice and produce a bill nobody authorised.

That is also why this is separate from the checkout's `priceOrderWithVouchers`,
which prices a gross bill from scratch. A placed order is not a fresh one.

The added discount is capped at the order's own total: two codes that each fit
under the bill can still sum past it, and a negative total is money invented —
downstream it would read as a refund owed on top of everything already returned.

RED — `npx jest --config jest.config.cjs tests/unit/order-attach-reprice.test.ts`:

```
● Test suite failed to run
  Cannot find module '@/lib/order-attach-reprice' from 'tests/unit/order-attach-reprice.test.ts'
```

GREEN — same command: **12 passed, 12 total**.

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
| 10 | An unpaid order owes its whole total | `order-settlement-parity.test.ts:reports an unpaid order as owing its whole total` | unit | PASS |
| 11 | A fully paid order reads as settled | `:reports a fully paid order as settled` | unit | PASS |
| 12 | A discount on a paid order reads as a refund due | `:turns a discount on a paid order into a refund due` | unit | PASS |
| 13 | Charged and refunded are kept apart, not netted into one figure | `:keeps what was charged separate from what was given back` | unit | PASS |
| 14 | A part payment reports the remainder still owed | `:reports what is still owed after a part payment` | unit | PASS |
| 15 | Web and register agree on the whole account across 8 ledgers × 5 totals | `:settlement summary parity — web vs merchant app` | unit (parity) | PASS |
| 16 | A clean read is `available` | `order-ledger-parity.test.ts:treats a clean read as available` | unit | PASS |
| 17 | A missing ledger function is `absent`, not broken | `:treats a missing ledger function as an absent ledger, not a broken one` | unit | PASS |
| 18 | A failed read is `unavailable` | `:treats a failed read as unavailable` | unit | PASS |
| 19 | An argument rejection is NOT read as an absent ledger | `:does not treat an argument rejection as an absent ledger` | unit | PASS |
| 20 | An `Error` object classifies as its message does | `:reads an Error the same way it reads the message inside it` | unit | PASS |
| 21 | An empty error message reads as no error | `:treats an empty error message as no error` | unit | PASS |
| 22 | An unrecognisable error is `unavailable`, never `absent` | `:treats an unrecognisable error as unavailable, never as absent` | unit | PASS |
| 23 | A bill may be changed against a loaded or absent ledger, never an unreadable one | `:what may be done against a ledger in each state` | unit | PASS |
| 24 | Web and register classify the same 7 Convex messages identically | `:ledger-state parity — web vs merchant app` | unit (parity) | PASS |
| 25 | A code the order did not carry is returned as newly added | `order-discount-attach-parity.test.ts:returns a code the order did not already carry` | unit | PASS |
| 26 | A code the order already carried is not added again | `:leaves out a code the order already carried` | unit | PASS |
| 27 | A manual line is never returned, so it can never be redeemed | `:leaves out a manual line, which has no code to redeem` | unit | PASS |
| 28 | Zero, NaN and negative amounts are excluded | `:leaves out a line worth nothing` / `:leaves out a line whose amount is unreadable` / `:leaves out a negative line, which would add money to the bill` | unit | PASS |
| 29 | A carried manual line does not suppress a new code | `:does not let a carried manual line suppress a new code` | unit | PASS |
| 30 | The inputs are not mutated | `:does not mutate what it was given` | unit | PASS |
| 31 | Web and register agree across 11 attach shapes | `:attach selection parity — web vs merchant app` | unit (parity) | PASS |
| 32 | A newly attached code comes off the placed total | `order-attach-reprice.test.ts:takes the new discount off the placed total` | unit | PASS |
| 33 | The discount the order was placed with is NOT subtracted again | `:does not subtract the discount the order was already placed with` | unit | PASS |
| 34 | Re-entering the carried code changes nothing | `:ignores a code the order already carried` | unit | PASS |
| 35 | An order is never priced below zero | `:never prices an order below nothing` | unit | PASS |
| 36 | Two codes that individually fit but together exceed the bill are capped | `:caps two codes that individually fit but together exceed the bill` | unit | PASS |
| 37 | A manual line is never applied by an attach | `:ignores a manual line, which carries no code to redeem` | unit | PASS |
| 38 | Money is rounded to centavos, not carried as float drift | `:rounds to centavos rather than carrying float drift` | unit | PASS |
| 39 | The new total reconciles from the figures reported alongside it | `:keeps the new total reconcilable from the figures it reports` | unit | PASS |

## Validation actually run

| Command | Result |
|---|---|
| `npx jest --config jest.config.cjs tests/unit/order-balance-parity.test.ts` | 35 passed, 35 total |
| `npx jest --config jest.config.cjs tests/unit/order-settlement-parity.test.ts` | 13 passed, 13 total |
| `npx jest --config jest.config.cjs tests/unit/order-ledger-parity.test.ts` | 25 passed, 25 total |
| `npx jest --config jest.config.cjs tests/unit/order-discount-attach-parity.test.ts` | 22 passed, 22 total |
| `npx jest --config jest.config.cjs tests/unit/order-attach-reprice.test.ts` | 12 passed, 12 total |
| `npx jest --config jest.config.cjs` (full web suite, after step 5 core) | 453 passed, 1 skipped; 5,568 tests passed |
| `npx tsc --noEmit` | 0 errors under `src/` |
| `npx eslint` on all four changed files | clean, no output |

## Coverage and known gaps

No coverage run: this is one 66-line pure module and all six exports are
exercised by the 35 tests above.

**Phase 2 is NOT complete.** What this cycle delivers is the arithmetic. What
remains before a merchant can actually attach a voucher on the web:

1. **A payments source for the web.** On the register the ledger is a separate
   backend query (`getOrderPaymentsRef`), not a field on the order row — the web
   has no equivalent query wired up. The *classification* of that query's errors
   now exists (step 3, `src/lib/order-ledger.ts`); the query itself does not.
   Whoever wires it must pass the error through `resolveLedgerState` and refuse
   to render a balance when the result is `unavailable`.
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

Four checkpoint commits, all on `feat/android-sms-followups`.

**Step 1 — balance math.** RED `b2a1fb0` → GREEN `36891ca`.

- RED: `test: add reproducer for settlement math missing on the web admin`
  — suite failed to run, module absent.
- GREEN: `feat: give the web admin the settlement math for a placed order`
  — 35/35 pass.

**Step 2 — settlement account.** RED `c7ad0cd` → GREEN `f4d2fa1`.

- RED: `test: add reproducer for the settlement summary missing on the web admin`
  — suite failed to run, module absent.
- GREEN: `feat: give the web admin the settlement account for a placed order`
  — 13/13 pass.

**Step 3 — ledger trust.** RED `f03063d` → GREEN `636c9c8`.

- RED: `test: add reproducer for ledger-state classification missing on the web`
  — suite failed to run, module absent.
- GREEN: `feat: let the web tell an absent settlement ledger from an unreadable one`
  — 25/25 pass.

**Step 4 — attach selection.** RED `a779da5` → GREEN `2ca642a`.

- RED: `test: add reproducer for attach selection missing on the web`
  — suite failed to run, module absent.
- GREEN: `feat: let the web tell which codes an attach newly added`
  — 22/22 pass; full suite 5,550 pass; tsc clean under `src/`; eslint clean.

**Step 5 (core) — re-price on attach.** RED `22c6cd6` → GREEN `fc03726`.

- RED: `test: add reproducer for re-pricing an order when a code is attached`
  — suite failed to run, module absent.
- GREEN: `feat: re-price a placed order when a voucher is attached to it`
  — 12/12 pass; full suite 5,568 pass; tsc clean under `src/`; eslint clean.

No refactor commits: the four ports are straight transliterations with their
module docstrings rewritten for the new context; nothing left to clean up.
