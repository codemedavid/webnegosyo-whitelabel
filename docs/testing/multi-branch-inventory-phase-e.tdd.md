# Multi-branch inventory, E — generated types and the transfer cycle

**Source plan** — the remaining-tasks plan agreed on 2026-08-01, which listed E
(types regen + one E2E across draft → send → receive) and D2 (merchant app
transfers). This report covers E only. **D2 was not started.**

**Branch** `feat/platform-supabase-order-parity`.

## User journeys

1. As a developer, I want the database types to know an alert belongs to a
   branch, so a row that forgets the branch fails to compile rather than
   alerting the whole store.
2. As an owner, I want a completed transfer to leave my total stock unchanged,
   so moving flour between shops does not appear to create or destroy it.
3. As an owner, I want a shortfall to cost me the missing units once, not twice.

## Task report

### E1. `stock_alerts.outlet_id` in the generated types

RED `ca63c27` → GREEN `3f1ab7c`.

```
npx tsc --noEmit
RED:   5 errors in tests/unit/inventory-stock-alerts-types.test.ts
       TS2353 'outlet_id' does not exist in type '{ ... }'
       TS2339 Property 'outlet_id' does not exist on type '{ ... }'
       TS2344 Type '"outlet_id"' does not satisfy the constraint '...'
GREEN: no errors in any file I touched
npx jest --testPathPatterns="inventory-stock-alerts-types"  → 3 passed
```

**The RED here is compile-time only, and the test file says so in its header.**
Jest transforms with SWC, which strips types without checking them, so these
assertions pass whether or not the column is typed. `npx tsc --noEmit` is the
command that validates this file; running it under Jest alone proves nothing.

**The gap was invisible, which is why it was worth closing.** The insert in
`stock-alerts-service.ts` was cast `as never`, so a row that omitted the branch
— or spelled it `outletId` — compiled fine and raised the alert against the
whole store instead of the one shop that was short. The GREEN commit therefore
does two things: adds the column, then **removes that cast**, so TypeScript
actually checks the rows. The type without the cast removal would have been
decoration.

#### A full regen was rejected, deliberately

The plan said "regenerate `src/types/supabase.ts`". I generated it, diffed it,
and did **not** apply it. The generated file differs from the committed one by
~4,600 lines, and the diff is not additive:

| | Detail |
|---|---|
| Tables gained | 16, including `order_payments`, `order_revisions`, `product_costs` |
| Tables lost | 3 — `bundle_items`, `checkout_lead_status_history`, `push_subscriptions` |
| Other | `PostgrestVersion` "13.0.5" → "14.5"; two hand-written comment blocks destroyed |

All three lost tables are genuinely absent from the platform database
(confirmed against `information_schema.tables`), so the generator is right and
the committed file is stale. But **applying it would break the build**:
`src/lib/checkout-leads/checkout-leads-service.ts` reads and writes
`checkout_lead_status_history` at two call sites, and that table does not
exist. Regenerating turns a silent runtime failure into a compile error in
someone else's feature, mid-branch, with other sessions live in this tree.

So E1 was done surgically: the one column the phase actually needs, added by
hand to match the generator's own output byte for byte, with the foreign key
it emits.

**Two findings are handed over rather than fixed:**

- `checkout_lead_status_history` **does not exist in the database** but
  `checkout-leads-service.ts` still queries it. That is a live bug in the
  checkout-leads feature, outside this phase's scope and untouched.
- `src/types/supabase.ts` is ~16 tables behind the schema. A full regen is
  worth doing once the checkout-leads issue is resolved, and will need the two
  hand-written comment blocks re-added.

### E2. The transfer cycle

Commit `3970630`. **No RED — and that is the honest result.**

```
npx jest --testPathPatterns="inventory-transfer-cycle"
FIRST RUN: Tests: 9 passed, 9 total
```

There was no bug to fix. `inventory-stock-transfers-service.test.ts` already
covers each leg in isolation across 15 cases; what nothing asserted was the
property that only exists once the legs are composed — **what a completed
transfer does to the chain's total.** This is a characterization test closing a
coverage gap, so it passes on the first run by construction. Manufacturing a
RED by breaking the source first would have proved nothing about the code as
written.

**Instead the tests were proven non-vacuous by mutation.** Deleting the
"restore to the sender" leg from `buildReceiveMovements` — precisely the
double-charge bug the module's own comment warns about — produced:

```
✕ costs the chain the shortfall once, not twice
✕ charges the loss to the branch that loaded the van
✕ writes the whole load off against the sender
Tests: 3 failed, 6 passed, 9 total
```

The mutation was reverted with `git checkout --` and the file confirmed clean.

### E3. Live probe — the database half

The pure tests sum the deltas handed to the ledger. They cannot prove the
trigger and the roll-up agree with those sums. Run against a real two-outlet
tenant with real triggers, in a rolled-back transaction:

| Stage | Source | Dest | Roll-up | Branch sum |
|---|---|---|---|---|
| 1. baseline | 100 | 0 | 100 | 100 |
| 2. after send 30 | 70 | 0 | **70** | 70 |
| 3. after full receive | 70 | 30 | **100** | 100 |
| 4. sent 20, counted 12 | 50 | 42 | **92** | 92 |

Three things this establishes that no mocked test could:

- **The van is real and honest.** At stage 2 the stock is on neither shelf and
  the roll-up says 70, not 100. A system that hid the in-transit state would
  let two branches count the same sack.
- **A full cycle returns to exactly 100.** The transfer nets to zero.
- **The 8 lost units cost the chain 8, not 16.** The double-charge hazard is
  disproven at the database level, not just in the arithmetic.
- `rollup == branch_sum` at **every** stage — the roll-up never drifts from the
  sum of its branches.

The probe seeds its own unit and ingredient because neither multi-outlet tenant
has any, and the whole transaction is rolled back.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | An alert insert carries a typed branch | `inventory-stock-alerts-types.test.ts` | compile | PASS (`tsc`) |
| 2 | A store-wide alert is a null branch, not a missing field | same | compile | PASS (`tsc`) |
| 3 | The branch reads back off a row | same | compile | PASS (`tsc`) |
| 4 | The alert insert is type-checked, not cast away | `stock-alerts-service.ts` uncast | compile | PASS (`tsc`) |
| 5 | An intact transfer leaves the chain total unchanged | `inventory-transfer-cycle.test.ts` | unit | PASS |
| 6 | An intact transfer moves stock shelf to shelf | same | unit | PASS |
| 7 | A clean transfer accuses nobody of a loss | same | unit | PASS |
| 8 | A shortfall costs the chain once, not twice | same | unit | PASS (mutation-proven) |
| 9 | The loss is charged to the sending branch | same | unit | PASS (mutation-proven) |
| 10 | A load that never arrives is written off in full | same | unit | PASS (mutation-proven) |
| 11 | A zero receipt credits the destination with nothing | same | unit | PASS |
| 12 | The unbranched pool works as an ordinary endpoint | same | unit | PASS |
| 13 | Receiving more than was sent is refused | same | unit | PASS |
| 14 | The in-transit state is visible in the roll-up | live probe | manual | PASS |
| 15 | A full cycle returns the roll-up to its start | live probe | manual | PASS |
| 16 | Roll-up equals the branch sum at every stage | live probe | manual | PASS |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory"
Test Suites: 1 skipped, 92 passed, 92 of 93 total
Tests:       8 skipped, 1064 passed, 1072 total

npx eslint <3 changed files> → exit 0
npx tsc --noEmit → no errors in any file touched here
```

Gaps, stated plainly:

- **D2 was not started.** Merchant-app and POS transfers remain unbuilt; the
  phone can read a branch shelf and record a movement, but cannot transfer.
- **The E2E is a probe, not a committed integration test.** It exercised the
  real trigger through raw SQL rather than through `createTransfer` /
  `sendTransfer` / `receiveTransfer`. The service functions' own composition is
  covered only by mocks, so nothing yet drives the real TypeScript entry points
  against the real database. `tests/integration/inventory-live-e2e.test.ts`
  exists for the order path and would be the natural harness to extend, but it
  belongs to a concurrent session and carries pre-existing `tsc` errors
  (TS2769, dynamic table names) — untouched here.
- **No merchant has moved stock between branches.** Every transfer this phase
  reasons about is synthetic.
- **`src/types/supabase.ts` remains ~16 tables stale**, by decision, with the
  checkout-leads bug above as the blocker to clearing it.
- Three pre-existing `tsc` errors in `inventory-stock-alerts-{view,banner}`
  test fixtures omit a required `outletId` on `StockAlertView`. They are in
  committed files I did not touch and predate this phase.
