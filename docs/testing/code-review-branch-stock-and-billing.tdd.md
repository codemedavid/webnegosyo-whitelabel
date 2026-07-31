# Code review remediation — branch stock, billing gate, branch allowance

## Source plan

No `*.plan.md`. The work originated from a `/code-review` pass over the 64
unpushed commits on `feat/platform-supabase-order-parity` plus the uncommitted
working tree. The review produced eight findings; the user approved fixing all
eight and applying the database half to production.

Because these are **fixes to existing shipped behaviour**, the RED signal for
each was the defect reproduced against the real code — not a missing
implementation. Where a reproducer could not be run before the fix (see
"Honest notes" below), that is stated rather than implied.

## User journeys

1. As a **branch manager**, I want the inventory screen to show my branch's
   stock, so that I do not count my shelf short against the whole chain's total.
2. As a **branch manager**, I want a stocktake to correct my own shelf, so that
   counting what is actually there does not corrupt the store's totals.
3. As an **owner**, I want a sale to deplete the branch it was rung up at, so
   that each shop's shelf reflects what it actually sold.
4. As an **owner**, I want to record a delivery into a specific branch, so that
   my entries and my manager's accumulate in the same place.
5. As the **platform owner**, I want a lapsed tenant to actually be unable to
   write, so that the subscription gate is a boundary and not a sign.
6. As the **platform owner**, I want the collections total to include the
   tenants I cut off, so that the figure means "money owed right now".
7. As a **merchant**, I want to be told the truth when my branch allowance
   cannot be read, so that a database blip does not read as a plan downgrade.

## Task report

### 1. Two migrations clobbering `apply_stock_movement()` — CRITICAL

`20260807130000` (stocktake resolved under the row lock via `target_qty`) and
`20260808120000` (per-branch `inventory_stock`) each `CREATE OR REPLACE` the
whole function with bodies that do not contain each other's work.

**RED — probed against the live database:**

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p ... WHERE p.proname = 'apply_stock_movement';
```

The live body contained `target_qty` and **no reference to `inventory_stock`**.
Branch-stock had lost the race, so `inventory_stock` was frozen at its backfill
values, `balance_after` recorded the chain roll-up, and — paired with the
branch-scoped RLS of `20260809120000` — every branch manager's inventory screen
read zero for every ingredient.

Drift check before writing the repair:

```sql
SELECT count(*) FROM inventory_stock;   -- 1
SELECT count(*) FROM stock_movements;   -- 1
-- drifted_pool_rows: 0
```

Inventory is barely used in production, so the reconcile in the migration is a
no-op here and the apply was low-risk.

**GREEN — probed in a transaction that was rolled back by a raised exception:**

```
PROBE_OK_ROLLBACK north=10.0000 south=90.0000 rollup=120.0000 balance_after=10.0000
```

North 10 / South 90, North counts 10 → delta `0` (was `-90`), `balance_after` is
the branch's 10 rather than the chain's 120, and the branches still sum to the
roll-up. Rollback confirmed: `probe_outlets=0, movements=1, stock_rows=1, drift=0`.

Post-apply verification of the merged function:

```
maintains_branch_stock=true  resolves_stocktake=true  counts_against_branch=true
```

**Guaranteed:** one final definition that both resolves a stocktake under the row
lock and maintains `inventory_stock` per branch, sorting after both rivals so a
fresh `db reset` cannot flip the winner.

### 2. Branch stocktake resolved against the chain roll-up — HIGH

`resolveMovementDelta` was fed `item.current_qty`, the sum across every branch.

**RED:** `npx jest tests/unit/inventory-branch-stocktake.test.ts` — before the
service fix was re-applied (it had been reverted by a concurrent session), the
suite failed with `Expected: 0, Received: -90`, which is exactly the defect.

**GREEN:** same command, 5 passed.

**Guaranteed:** a stocktake reconciles against the movement's own branch row,
missing row reads as zero on both the service and trigger sides, and the delta
handed to alerting/auto-86 (which the trigger never revisits) is the branch's.

### 3. `assertSubscriptionActive` never called — HIGH

`grep` found it only in its own module, its test, and a comment.

**RED:** not reproducible as a failing test before the fix — the assertion was
simply unreachable, so there was no call site to fail. The evidence is the grep
and the module's own comment stating the redirect "does not stop a POST aimed
straight at an action". Recorded as a compile-free finding rather than a runtime
RED.

**GREEN:** `npx jest tests/unit/subscription-gate-wiring.test.ts` — 5 passed,
covering refusal, admittance, superadmin exemption, fail-open on read error, and
the no-subscription case.

**Guaranteed:** the gate runs inside `verifyTenantAdmin`, the single function all
118 admin call sites funnel through.

### 4 & 5. POS branch resolution and dropped `outlet_id` — MEDIUM

**GREEN:** `npx jest tests/unit/api/inventory-order-stock.test.ts` (20 passed)
and `tests/unit/api/inventory-movement-authz.test.ts` (10 passed). Three new
cases each.

### 6. `overduePhp` excluded the most delinquent — MEDIUM

**GREEN:** `npx jest tests/unit/subscription-overdue-total.test.ts` — 3 passed.

**Note:** the production change rode into commit `5c1ce55` alongside a concurrent
session's due-soon work; the test landed separately in `754f6d8`.

### 7. Failed allowance read reported as a plan of 1 — MEDIUM

**GREEN:** `npx jest tests/unit/outlets-branch-allowance.test.ts` — 5 passed,
including the `42703` missing-column case that an unapplied migration produces.

### 8. Store-wide alerts over branch-scoped quantities — LOW

**GREEN:** `npx jest tests/unit/inventory-alert-scope.test.ts` — 5 passed.

## Test specification

| # | What is guaranteed | Test file or command | Type | Result |
|---|--------------------|----------------------|------|--------|
| 1 | Merged trigger keeps branch stock AND the stocktake race fix; branches sum to the roll-up | live `DO` block probe, rolled back | db integration | PASS |
| 2 | Counting exactly what a branch holds moves nothing | `inventory-branch-stocktake.test.ts` | unit | PASS |
| 3 | A branch with no stock row counts against zero, not the chain | `inventory-branch-stocktake.test.ts` | unit | PASS |
| 4 | The alerting pass receives the branch delta, not the roll-up one | `inventory-branch-stocktake.test.ts` | unit | PASS |
| 5 | A sale depletes the order's branch, not the acting account's | `api/inventory-order-stock.test.ts` | integration | PASS |
| 6 | Falls back to the account when the order is not in the platform table | `api/inventory-order-stock.test.ts` | integration | PASS |
| 7 | A caller-chosen branch is forwarded; a non-string is ignored | `api/inventory-movement-authz.test.ts` | integration | PASS |
| 8 | A lapsed tenant is refused at the admin chokepoint | `subscription-gate-wiring.test.ts` | unit | PASS |
| 9 | A superadmin is never locked out; a failed read fails open | `subscription-gate-wiring.test.ts` | unit | PASS |
| 10 | A tenant paused at zero days overdue still counts as owing | `subscription-overdue-total.test.ts` | unit | PASS |
| 11 | A failed allowance read says so, and creates nothing | `outlets-branch-allowance.test.ts` | integration | PASS |
| 12 | An unset allowance still falls back to the platform default | `outlets-branch-allowance.test.ts` | integration | PASS |
| 13 | A branch with a full shelf is not shown the chain's warning | `inventory-alert-scope.test.ts` | unit | PASS |
| 14 | A store-wide viewer keeps every alert | `inventory-alert-scope.test.ts` | unit | PASS |

## Coverage

`npx jest --coverage --collectCoverageFrom=<changed files>` over the full suite:

| File | % Stmts | % Branch | % Funcs |
|---|---|---|---|
| `src/lib/billing/subscription-roster.ts` | 100 | 100 | 100 |
| `src/lib/inventory/stock-alerts-view.ts` | 100 | 100 | 100 |
| `src/lib/inventory/stock-service.ts` | 94.60 | 80 | 88.88 |
| `src/app/api/inventory/order-stock/route.ts` | 89.14 | 95.65 | 100 |
| `src/app/api/inventory/movement/route.ts` | 79.01 | 60.86 | 100 |
| `src/app/actions/outlets.ts` | 75 | 62.50 | 55.55 |
| **All changed files** | **90.14** | **86.89** | **84.84** |

Full suite at the time of writing: **357 suites / 4406 tests passing**.
`tsc --noEmit`: **0 errors in `src/`**. ESLint on all changed files: clean.

## Known gaps and honest notes

- **Finding 3 had no runtime RED.** The function was unreachable, so there was
  no failing call site to demonstrate. The grep result is the evidence.
- **The gate is broader than the finding stated.** Placing it in
  `verifyTenantAdmin` gates admin *reads* on that path too, not just writes. A
  paused tenant is already redirected out of `/admin`, so this is believed inert,
  and the merchant app authenticates separately and is unaffected — but it is a
  wider change than "stop the POST" and should be narrowed if that proves wrong.
- **`outlets.ts` and `movement/route.ts` sit below 80% statements.** The
  uncovered lines are pre-existing sibling handlers (update/delete/reorder,
  auth branches), not the changed code. The changed lines are covered.
- **A concurrent Claude session shares this working tree.** Mid-task it reverted
  two of these edits (`stock-service.ts`) and absorbed a third into its own
  commit (`subscription-roster.ts` → `5c1ce55`). Both were re-verified after the
  fact. `tests/unit/subscription-collections-screen.test.tsx` is that session's
  untracked RED-stage reproducer and fails by design; it is not part of this work.
- **No E2E.** These are server-side and database-level defects; the guarantees
  are asserted at the service, route, and SQL layers.

## Merge evidence

If these commits are squashed, preserve:

- `fc45584` merged the rival `apply_stock_movement()` definitions and applied the
  migration to production, verified by a rolled-back live probe.
- `c0935a5` order/movement branch resolution — 30 route tests green.
- `c8c406e` subscription gate wired to the chokepoint — 5 tests green.
- `ea29e85` honest branch-allowance failure — 5 tests green.
- `377dd04` branch-scoped low-stock banner — 5 tests green.
- `754f6d8` collections total counts paused tenants — 3 tests green.
