# TDD evidence — "Cannot edit this order" on stores with no payment ledger

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from a reported defect:
tapping **Edit in register** on an order at Brew Daze Express raised
_"Cannot edit this order — Its payment history could not be loaded, so its bill
cannot be edited safely."_

## Root cause

`app/(main)/order/[orderId].tsx` read the settlement ledger with
`useSafeQuery("orders:getOrderPayments")` and treated **any** error from it as
"the bill is unknown" (`if (paymentsError)`).

Every store runs its own Convex deployment and they are re-pushed in bulk, so
most run a bundle older than the settlement ledger. Brew Daze Express is on
`convex_schema_version = 5` (confirmed via the platform DB) against an app that
ships v15+ refs. Its deployment has no `orders:getOrderPayments`, so Convex
answers `Could not find public function` — an error, and the edit was refused.

That reading is wrong: a deployment with no ledger query also has no
`orders:recordPayment`, so **nothing can ever have been settled through it**.
Its ledger is empty, not unknown, and the bill on screen is the whole truth.

## User journeys

1. As a merchant on a store that has not been re-deployed, I want to edit a
   placed order, so that a customer's correction does not require a support
   ticket.
2. As a cashier, I still want the edit refused when the ledger genuinely failed
   to load, so that I never re-charge an order that was already paid.
3. As a cashier on an un-updated store, I want to be told the store needs a
   backend update when I try to collect, rather than a misleading "could not be
   loaded".

## Task report

### 1. Classify the ledger error instead of failing on all of them

New pure module `webnegosyo-app/lib/order-ledger.ts` — `resolveLedgerState`
maps a query error to `available` | `absent` | `unavailable`, and
`isLedgerSafeToEdit` admits the first two.

- Validation: `npx jest lib/order-ledger.test.ts`
- RED: compile-time — `Cannot find module './order-ledger'`. The new test newly
  references the missing rule, which is the intended RED signal.
- GREEN: `PASS logic lib/order-ledger.test.ts`
- Guarantees: an absent ledger is safe to edit against; a failed read is not.

### 2. Route the order screen through the shared rule

`app/(main)/order/[orderId].tsx` now derives `ledgerState` once and uses it for
the edit guard, the collect gate, and the settlement card.

- Validation: `npx jest lib/order-ledger-wiring.test.ts`
- RED: 3 runtime failures — the screen still matched `if (paymentsError)` and
  `isLedgerAvailable: !paymentsError`.
- GREEN: `PASS logic lib/order-ledger-wiring.test.ts`
- Guarantees: the screen cannot regress to judging the ledger inline.

### 3. Give the collect gate an honest reason on an un-updated store

`canCollectPayment` takes `ledger: LedgerState` in place of the boolean
`isLedgerAvailable`. `unavailable` keeps the "could not be loaded" refusal;
`absent` refuses with "this store needs a backend update" — the balance is
trustworthy there, but the mutation that records a payment is missing.

- Validation: `npx jest lib/order-collect.test.ts`
- RED: compile-time — `Property 'isLedgerAvailable' is missing … but required in
  type 'CollectRequest'` across the suite.
- GREEN: `PASS logic lib/order-collect.test.ts`
- Guarantees: the two block reasons stay distinguishable and neither is silent.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A ledger that loaded reports `available` (null and undefined error alike) | `lib/order-ledger.test.ts:reports a ledger that loaded` | unit | PASS |
| 2 | "Could not find public function" reports `absent`, not broken | `lib/order-ledger.test.ts:reports a deployment that has no ledger at all as absent, not broken` | unit | PASS |
| 3 | A timeout or network failure reports `unavailable` | `lib/order-ledger.test.ts:reports a genuine fetch failure as unavailable` | unit | PASS |
| 4 | An edit is allowed on a store whose backend has no ledger | `lib/order-ledger.test.ts:allows an edit on a store whose backend has no ledger` | unit | PASS |
| 5 | An edit is still refused when the ledger could not be read | `lib/order-ledger.test.ts:refuses an edit when the ledger exists but could not be read` | unit | PASS |
| 6 | The order screen classifies through the shared rule, not `if (paymentsError)` | `lib/order-ledger-wiring.test.ts` (3 cases) | wiring guardrail | PASS |
| 7 | Collecting is refused with "could not be loaded" on an unreadable ledger | `lib/order-collect.test.ts:refuses when the payment ledger could not be loaded` | unit | PASS |
| 8 | Collecting is refused with "needs an update" on a store with no ledger | `lib/order-collect.test.ts:refuses on a store whose deployment has no ledger, and says why` | unit | PASS |

## Coverage and known gaps

- Full app suite: `npx jest` → **160 suites, 2519 tests, all passing**.
- Typecheck: `npx tsc --noEmit` → clean.
- Gap: the fix is verified against the pure rules and the screen source, not on
  a handset against the live v5 deployment. The behaviour change to confirm
  there: **Edit in register** opens, and **Collect payment** reports that the
  store needs a redeploy.
- Not addressed (deliberate): Brew Daze Express is still on schema v5. Pushing
  the current bundle to it would give it a real ledger and is the separate,
  proper remedy — this change is what makes the app correct for the many stores
  that are behind at any moment.

## Merge evidence

- RED checkpoint: `416b9c5 test: add reproducer for editing an order on a store with no payment ledger`
- GREEN checkpoint: `27e8d6b fix: let a store with no payment ledger still edit its orders`
- No separate refactor commit: the fix landed in its final shape.
