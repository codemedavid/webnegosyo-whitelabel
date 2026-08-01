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

- **Status: APPLIED 2026-07-31** to the production project as `inventory_branch_stock`,
  then probed. Not covered by the Jest suite — this is SQL, and the trigger can
  only be proven against a database.

**Baseline before applying**: one inventory item (`Mozzarela`, `current_qty` 20),
one stock movement, `inventory_stock` absent.

**After the backfill** — the roll-up invariant, asserted per item:

| name | rollup | branch_sum | invariant_holds | stock_rows | store_pool_rows |
|---|---|---|---|---|---|
| Mozzarela | 20.0000 | 20.0000 | true | 1 | 1 |

**Trigger probe** — a two-branch scenario built on `gungjeon-unlimited`'s real
outlets inside a transaction that was rolled back. Receive 500 at North, receive
200 at South, sell 30 at North, transfer 100 North→South as two legs:

| north | south | rollup | branch_sum | rows_created | balance_after per movement |
|---|---|---|---|---|---|
| 370.0000 | 300.0000 | 670.0000 | 670.0000 | 2 | `[500, 200, 470, 370, 300]` |

Four things this proves:

1. **The original defect is fixed.** The sale of 30 at North left South at 200,
   untouched. Before this migration it would have drawn on the same scalar.
2. **The roll-up invariant holds under movement**, not just after the backfill:
   `rollup 670 = branch_sum 670`.
3. **The trigger creates a branch's first stock row** — `rows_created = 2` from
   movements alone; nothing pre-seeded them.
4. **`balance_after` is the branch's balance, not the store's.** The sale at
   North recorded 470, North's own running total, not the chain's 670.

**Cross-tenant branch guard** — inserting a movement pairing `gungjeon`'s item
with `cafejuancho`'s outlet:

```
REJECTED: Stock movement references a branch outside its tenant
```

**Post-probe state** — every probe artefact rolled back, nothing leaked:

```
leftover_probe_items: 0   total_items: 1   total_stock_rows: 1
total_movements: 1        invariant_holds_everywhere: true
```

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

1. **The trigger's race handling is unexercised.** Two concurrent first-movements
   at the same new branch take the `unique_violation` retry path; the probe is
   single-threaded and never drives it. Proving it needs two concurrent sessions.
2. **`src/types/database.ts` / `src/types/supabase.ts` are stale** — they do not
   yet know `inventory_stock` or `stock_movements.outlet_id`. Regenerating them is
   the first Phase 2 task; deliberately deferred here because those files are large
   and another session shares this working tree.
3. **Nothing writes a branch yet.** `applyOrderStockMovements` still takes no
   outlet, so every movement lands in the store pool. Per-branch depletion is
   Phase 2 — until it ships, this migration changes no observable behaviour.
4. **Inventory RLS is still role-based.** A branch manager can read every branch's
   stock. Narrowing it is Phase 2, alongside the reads that would otherwise break.
5. **Auto-86 still flips store-wide `menu_items.is_available`.** Untouched by this
   phase; the all-branches-out rule is Phase 4.
