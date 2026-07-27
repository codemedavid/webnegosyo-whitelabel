# TDD Evidence — Inventory Phase 5B: low-stock alerts & auto-86

**Source plan**: inline plan agreed in-session (no `*.plan.md` artifact). Phase 5B
was selected from the inventory roadmap held in project memory
(`inventory-management-build`), which listed 5B as the next unstarted phase.

**Branch**: `feat/unified-modifier-groups`

## User journeys

1. As a merchant, I want to be told the moment an ingredient falls to its
   reorder level, so that I can reorder before I run out mid-service.
2. As a merchant, I do **not** want an alert for every sale of an ingredient
   that is already low, so that the one alert that matters is not buried.
3. As a merchant, I want an alert to clear itself when a delivery restores
   stock, so that the next genuine crossing still reaches me.
4. As a merchant, I want dishes I can no longer make taken off the menu
   automatically, so that customers stop ordering what I cannot serve.
5. As a merchant, I do not want a dish hidden because an *optional* extra ran
   out, so that I keep selling what I can still make.
6. As a platform operator, I want both behaviours off until a tenant asks for
   them, so that no merchant's live menu changes without their say-so.

## Task report

### Task 1 — Level evaluation and crossing detection (pure)

Added `src/lib/inventory/low-stock.ts`: `evaluateStockLevel` (ok/low/out) and
`detectStockCrossings` (downward transitions only). Pure, in the style of
`stock-history.ts`, so the web admin, the merchant app, and the server alert
path all answer "is this low?" the same way.

- Validation: `npx jest tests/unit/inventory-low-stock.test.ts`
- RED: `Cannot find module '../../src/lib/inventory/low-stock'` — the module did
  not exist. Commit `8f044b3`.
- GREEN: `Tests: 19 passed, 19 total`. Commit `0453a6f`.
- Guarantees: a reorder level of 0 never produces `low`; zero and negative stock
  are always `out`; already-low ingredients falling further raise nothing;
  recovery raises nothing; NUMERIC(16,4) rounding dust does not read as stock.

### Task 2 — Which menu items an exhausted ingredient 86s (pure)

Added `src/lib/inventory/auto-86.ts`: `resolveMenuItemsToDisable`. Only a
**base** recipe can 86 an item — an ingredient used solely by a variation
option, modifier option, or addon leaves the item sellable in its other
configurations.

- Validation: `npx jest tests/unit/inventory-auto-86.test.ts`
- RED: `Cannot find module '../../src/lib/inventory/auto-86'`. Commit `c72744f`.
- GREEN: `Tests: 9 passed, 9 total`. Commit `c7c311a`.
- Guarantees: option/addon/modifier-only usage never disables an item; every
  menu item sharing the ingredient is disabled; each item is named once; prep
  recipes name no menu item (a prep item is stocked in its own right).

### Task 3 — Persisting alerts and applying auto-86

Added `src/lib/inventory/stock-alerts-service.ts`: `processStockLevelChanges`.
Reads the per-tenant flags, raises alerts for crossings, closes alerts for
recovered ingredients, and applies auto-86 for `out` crossings.

- Validation: `npx jest tests/unit/inventory-stock-alerts-service.test.ts`
- RED: `Cannot find module '../../src/lib/inventory/stock-alerts-service'`.
  Commit `fca5966`.
- GREEN: `Tests: 13 passed, 13 total`. Commit `17eb2c4`.
- Note: at first GREEN, 3 of 13 failed because the test's own `ingredient()`
  fixture dropped its `...overrides` spread, so every case silently used the
  default quantity. The fixture was the defect and was fixed; no assertion was
  weakened to accommodate the implementation.
- Guarantees: both features are off unless explicitly enabled, including when
  the tenant row cannot be read; one open alert per ingredient (no re-alerting
  while unresolved); recovery to `ok` closes the open alert; auto-86 fires only
  on `out`, never on `low`, and never re-enables an item; the whole path
  swallows its own errors.

### Task 4 — Reaching the alert path from both ledger writers

Wired `processStockLevelChanges` into `applyOrderStockMovements`
(`order-stock-service.ts`) and `recordStockMovement` (`stock-service.ts`).

- Validation: `npx jest tests/unit/inventory-stock-alerts-wiring.test.ts`
- RED: `Expected number of calls: 1 / Received number of calls: 0` — the alert
  path was never reached from either writer. Commit `c6f98c8`.
- GREEN: `Tests: 5 passed, 5 total`. Commit `786db23`.
- Note: one test initially failed on a `ZodError` because it used non-UUID ids;
  the manual movement path validates its input as UUIDs. Test fixture fixed.
- Guarantees: alerts see the **pre**-movement rows plus the applied deltas (a
  post-write re-read would race the running-total trigger and detect no
  crossing); deltas for one ingredient across several order lines are summed; an
  order that moved no stock does no alert work; a throwing alert path still
  leaves the order's movements recorded.

### Task 5 — Migration and superadmin toggles

- `supabase/migrations/20260728120000_inventory_low_stock_alerts.sql`:
  `tenants.low_stock_alerts_enabled` and `tenants.auto_86_enabled` (both
  `DEFAULT false`), plus the `stock_alerts` table with RLS mirroring
  `stock_movements` and a **partial unique index** on
  `(tenant_id, inventory_item_id) WHERE resolved_at IS NULL` so two concurrent
  depletions cannot both pass the application dedup check.
- `src/components/superadmin/tenant-form-wrapper.tsx`: an Inventory Alerts card
  with both switches, following the existing Bundles flag pattern exactly, with
  a warning shown when auto-86 is switched on.
- Types: `stock_alerts` added to `src/types/supabase.ts`; the two flags added to
  `Tenant` in `src/types/database.ts`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | An unset reorder level never produces a low-stock state | `inventory-low-stock.test.ts:never reports low when no reorder level is set` | unit | PASS |
| 2 | Zero and negative stock always read as out of stock | `inventory-low-stock.test.ts:reports out when stock has gone negative` | unit | PASS |
| 3 | An already-low ingredient falling further raises nothing | `inventory-low-stock.test.ts:stays silent when stock was already low and only fell further` | unit | PASS |
| 4 | A delivery lifting stock out of low raises nothing | `inventory-low-stock.test.ts:stays silent when a delivery lifts stock back out of low` | unit | PASS |
| 5 | Rounding dust is not mistaken for remaining stock | `inventory-low-stock.test.ts:does not treat a rounding-scale residue as remaining stock` | unit | PASS |
| 6 | An ingredient used only by an option never 86s the item | `inventory-auto-86.test.ts:leaves a menu item alone when only a variation option needs the ingredient` | unit | PASS |
| 7 | Every menu item sharing an exhausted base ingredient is disabled | `inventory-auto-86.test.ts:disables every menu item sharing the out-of-stock ingredient` | unit | PASS |
| 8 | Alerts do not fire for a tenant that has them switched off | `inventory-stock-alerts-service.test.ts:does not raise an alert when the tenant has alerts switched off` | unit | PASS |
| 9 | A second alert is not raised while one is still open | `inventory-stock-alerts-service.test.ts:does not raise a second alert while one is still open for that ingredient` | unit | PASS |
| 10 | Recovery closes the open alert | `inventory-stock-alerts-service.test.ts:closes an open alert when a delivery brings the ingredient back to ok` | unit | PASS |
| 11 | Auto-86 does nothing for a tenant that has it switched off | `inventory-stock-alerts-service.test.ts:leaves the menu alone when the tenant has auto-86 switched off` | unit | PASS |
| 12 | Auto-86 never re-enables an item when stock returns | `inventory-stock-alerts-service.test.ts:never re-enables a menu item when stock comes back` | unit | PASS |
| 13 | An unreadable tenant row means both features off | `inventory-stock-alerts-service.test.ts:treats a tenant row it cannot read as having both features off` | unit | PASS |
| 14 | A failing alert write never surfaces as a failed sale | `inventory-stock-alerts-service.test.ts:never throws when the alert write fails` | unit | PASS |
| 15 | Order depletion reports pre-movement rows and applied deltas | `inventory-stock-alerts-wiring.test.ts:reports the pre-movement ingredients and the deltas an order applied` | unit | PASS |
| 16 | Deltas across order lines for one ingredient are summed | `inventory-stock-alerts-wiring.test.ts:sums the deltas when several lines share one ingredient` | unit | PASS |
| 17 | A throwing alert path still records the order's movements | `inventory-stock-alerts-wiring.test.ts:still records the order movements when the alert path throws` | unit | PASS |
| 18 | Manual merchant movements reach the alert path too | `inventory-stock-alerts-wiring.test.ts:reports the ingredient and delta a merchant-recorded waste applied` | unit | PASS |

## Coverage

```
npx jest --coverage \
  --collectCoverageFrom="src/lib/inventory/{low-stock,auto-86,stock-alerts-service}.ts" \
  --testPathPatterns="inventory"

File                     | % Stmts | % Branch | % Funcs | % Lines
All files                |     100 |    89.74 |     100 |     100
 auto-86.ts              |     100 |    93.75 |     100 |     100
 low-stock.ts            |     100 |      100 |     100 |     100
 stock-alerts-service.ts |     100 |    84.78 |     100 |     100
```

Above the 80% threshold on every axis. Uncovered branches are null-coalescing
defaults on Supabase responses.

Whole-suite regression: `npx jest` → **221 suites, 2554 tests, all passing**.
`npx tsc --noEmit` → no errors in production files (the ~21 pre-existing errors
are all in test files, from the untyped `jest.Mock` pattern). `npx eslint` on
every changed file → clean.

## Known gaps

1. **The migration is written but NOT APPLIED.** Until it is, the flag select
   errors, `readTenantFlags` returns both-off, and the feature is inert — the
   same failure mode as the storefront select drift, but fail-safe by design.
2. **Nothing surfaces the alerts yet.** `stock_alerts` rows are written but no
   web admin or merchant app view reads them, and no push notification is sent.
   Delivery was deliberately left out of this cycle: pushing through Convex
   would mean a per-tenant schema redeploy, which the POS depletion work already
   established as a cost to avoid. The rows are the durable record; a reader and
   a push path are the next increment.
3. **The superadmin toggles have no unit test.** They are form plumbing added in
   the exact shape of every other flag in `tenant-form-wrapper.tsx`, none of
   which is unit-tested. Verified by typecheck, lint, and the full suite only.
4. **No integration or E2E coverage** — that is Phase 7, and the DB-level
   behaviour (the partial unique index in particular) is unproven against a live
   database.
