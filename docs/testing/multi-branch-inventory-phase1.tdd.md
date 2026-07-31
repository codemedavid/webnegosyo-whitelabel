# TDD evidence — Multi-branch inventory, Phase 1

**Source plan**: inline `/ecc:plan` output (multi-branch inventory), confirmed 2026-07-31.
Not written to a `.plan.md` file; the phase breakdown is reproduced in the commit bodies.

**Branch**: `feat/platform-supabase-order-parity`
**Checkpoints**: RED `24a6f95` → GREEN `bb6c17d` → migration `fdd56b7`
(`c127c26`, a concurrent session's docs commit, sits between RED and GREEN; RED is
confirmed an ancestor of HEAD via `git merge-base --is-ancestor 24a6f95 HEAD`.)

## The defect being fixed

`inventory_items.current_qty` was a single scalar per tenant with `outlet_id`
appearing nowhere in the inventory schema. A two-branch store therefore shared
one stock pool: a sale at North silently depleted South.

## User journeys

1. As a branch owner, I want to see total on-hand for an ingredient across every
   branch, so that I know what the business holds.
2. As a branch owner, I want to see what one branch holds, so that I can tell
   which shop is short.
3. As a merchant, I want moving stock between branches to be two recorded
   movements, so that stock in transit is visible and a shortfall on arrival can
   be blamed on the leg it happened on.

## Task report

### Task 1 — per-branch on-hand arithmetic (`src/lib/inventory/stock-location.ts`, new)

Pure module over one row per (item, branch): `stockLocationKey`, `indexStockRows`,
`stockOnHandAt`, `rollUpOnHand`.

- **RED**: `npx jest --testPathPatterns="inventory-stock-(location|ledger)"`
  → `Test Suites: 2 failed, 2 total. Tests: 4 failed, 16 passed, 20 total.`
  The `inventory-stock-location` suite failed to resolve
  `@/lib/inventory/stock-location` — the module did not exist.
- **GREEN**: same command → `2 passed, 35 passed`.
- **Guaranteed**: a branch with no stock row reports **zero**, not the store-wide
  pool. This is the rule that separates stock from `outlet-menu-overrides`, where
  a missing row means "inherit the store-wide value". Inheriting a *quantity*
  would report the same sack of flour present at every branch and double-count
  the roll-up.

### Task 2 — transfers as two ledger legs (`src/lib/inventory/stock-ledger.ts`)

Added `transfer_out` / `transfer_in` to `StockMovementReason`, with signs, labels,
and deliberate exclusion from `MANUAL_MOVEMENT_REASONS`.

- **RED**: 4 failing assertions — `delta('transfer_out', 500)` returned `undefined`
  (the exhaustive switch had no arm), and `MOVEMENT_REASON_LABELS.transfer_out`
  was `undefined`.
- **GREEN**: all pass.
- **Guaranteed**: a transfer leg cannot be written from the manual movement form.
  A hand-written leg would be one-sided — stock leaves North and arrives nowhere —
  losing stock with a plausible reason attached.

### Task 3 — migration (`supabase/migrations/20260808120000_inventory_branch_stock.sql`)

`inventory_stock` table, `stock_movements.outlet_id`, widened reason CHECK,
backfill of one store-pool row per existing item, rewritten `apply_stock_movement()`.

- **Status: WRITTEN, NOT APPLIED.** No database validation has been run.
- Not covered by the Jest suite: this is SQL, and the trigger's behaviour can only
  be proven against a database. See Known gaps.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | A branch holding stock reports its own quantity | `inventory-stock-location.test.ts:reports what one branch is holding` | unit | PASS | `npx jest --testPathPatterns="inventory-stock-location"` |
| 2 | A branch with no row reports zero, not the store pool | `…:reports zero for a branch with no row, NOT the store-wide pool` | unit | PASS | same |
| 3 | An absent/blank branch resolves to the store pool, never a branch named "" | `…:reads a blank branch as the store-wide pool` | unit | PASS | same |
| 4 | The roll-up sums every branch including the unbranched pool | `…:includes the unbranched pool in the total` | unit | PASS | same |
| 5 | Negative stock is preserved, not clamped | `…:preserves negative stock rather than clamping it` | unit | PASS | same |
| 6 | A negative branch nets against a positive one in the roll-up | `…:nets a negative branch against a positive one` | unit | PASS | same |
| 7 | Indexing does not mutate the caller's rows | `…:does not mutate the rows it is given` | unit | PASS | same |
| 8 | `transfer_out` removes and `transfer_in` adds | `inventory-stock-ledger.test.ts:transfer movements` | unit | PASS | `npx jest --testPathPatterns="inventory-stock-ledger"` |
| 9 | Units convert on both legs — a kilo out is a kilo in | `…:converts units on both legs` | unit | PASS | same |
| 10 | Transfer legs are not offered on the manual movement form | `…:is not offered as a movement a merchant records by hand` | unit | PASS | same |

## Regression check

- Full inventory suite: `npx jest --testPathPatterns="inventory"` →
  `64 passed, 1 skipped, 65 total. Tests: 683 passed, 8 skipped, 691 total.`
  Widening `StockMovementReason` broke no exhaustive switch elsewhere.
- `npx tsc --noEmit` → no errors under `src/`. (Pre-existing errors remain in
  `tests/integration/inventory-live-e2e.test.ts`, `tests/unit/api/*`, and the
  branding tests; none touched by this change.)
- `npx eslint` on the four changed files → clean, exit 0. (`npm run lint`
  repo-wide reports 87 errors, all pre-existing in the vendored
  `webnegosyo-desktop` bundle.)

## Coverage

```
npx jest --testPathPatterns="inventory-stock-(location|ledger)" --coverage \
  --collectCoverageFrom="src/lib/inventory/stock-location.ts" \
  --collectCoverageFrom="src/lib/inventory/stock-ledger.ts"

File               | % Stmts | % Branch | % Funcs | % Lines
stock-ledger.ts    |     100 |    92.85 |     100 |     100
stock-location.ts  |     100 |      100 |     100 |     100
```

Above the 80% threshold. The one uncovered branch in `stock-ledger.ts` (line 118)
is in `movingAverageUnitCost`, pre-existing and untouched by this phase.

## Known gaps

1. **The migration is unapplied and unproven.** The roll-up invariant
   (`sum(inventory_stock.current_qty) = inventory_items.current_qty` per item) has
   NOT been asserted against a database. It must be probed before and after
   applying. The plan names this the highest-severity risk of the phase.
2. **The trigger's race handling is unexercised.** Two concurrent first-movements
   at the same new branch take the `unique_violation` retry path; no test drives it.
3. **Nothing writes a branch yet.** `applyOrderStockMovements` still takes no
   outlet, so every movement lands in the store pool. Per-branch depletion is
   Phase 2 — until it ships, this migration changes no observable behaviour.
4. **Inventory RLS is still role-based.** A branch manager can read every branch's
   stock. Narrowing it is Phase 2, alongside the reads that would otherwise break.
5. **Auto-86 still flips store-wide `menu_items.is_available`.** Untouched by this
   phase; the all-branches-out rule is Phase 4.
