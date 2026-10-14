# Frozen cost + atomic average cost — TDD evidence (Phase 0b, Reports & Inventory suite)

Plan: `docs/plans/2026-10-12-reports-and-inventory-suite.md` §5 (Costing), §7.4, §9 Phase 0b.
Date: 2026-10-12. Branch: `feat/reports-inventory`. Migration: `20261012180000_inventory_frozen_cost.sql` (applied as `inventory_frozen_cost`).

## Why

Only a delivery stored a price. A sale, waste or count was valued at report time at **today's** cost, so editing a cost rewrote every past month's food cost, and a cancelled order could come back at a different price than it went out at. The weighted average was blended in the web request from an item read **before** the insert, so two deliveries landing together each blended against the same stale shelf. History only builds up from deploy day, so this ships before any report reads it.

## What changed

| Piece | Behaviour |
|---|---|
| `inventory_convert_quantity` / `inventory_recipe_cost` / `inventory_effective_unit_cost` | Line-for-line SQL mirror of `costing.ts` (+ `unit-conversion.ts`, `graph-builder.ts`). NULL wherever costing.ts throws. Invoker, `service_role`-only execute. |
| `stock_movement_frozen_cost` | SECURITY DEFINER, refuses `pg_trigger_depth() < 1` (no RPC). Void → weighted cost of what the order still has out (NULL if any of it was uncosted). Transfer arrival / shortfall → the departure's cost. Else today's effective cost (prep = recipe ÷ yield). Errors and ≥ 1e8 → NULL + `raise warning`, never a failed movement. |
| `apply_stock_movement` | Unchanged quantities. Reads qty + cost under one lock. A delivery keeps its given price (blank = uncosted) and blends the average; an empty, negative **or never-priced** shelf takes the price outright. Every other movement's cost is set by the database, whatever the caller sent. |
| `stock_movements_unit_cost_nonnegative` | CHECK `unit_cost is null or >= 0`. |
| `order_items.category_name` | BEFORE trigger (definer): the category the dish was sold under, same store only. Not editable afterwards (kept unless the dish changes). |
| `order_item_costs` | Dish cost at sale: base recipe, else typed product cost, else no row. Own table because every staff account that can see an order can read its lines. RLS select: `menu` + store-wide, or platform staff. No client writes. |
| `stock-service.ts` | JS blend removed (it raced). `movingAverageUnitCost` stays as the reference the trigger mirrors; it now also takes the price outright over an unpriced shelf. |

Deviations from the plan, on purpose: dish cost lives in `order_item_costs`, not `order_items.unit_cost_snapshot` (security); prep cost is computed in the database, not passed from `costing.ts` by the writer (one authority for every writer, including transfers and the app).

## RED → GREEN

1. `npx jest tests/unit/inventory-frozen-cost-migration.test.ts` — RED: migration file missing. GREEN: 18/18.
2. `npx jest tests/unit/inventory-stock-ledger.test.ts` — RED: "an unpriced shelf takes the delivery price outright" (blend gave 0.06). GREEN.
3. `npx jest tests/unit/inventory-stock-cost-unit.test.ts` — RED: the service still wrote `inventory_items.unit_cost`. GREEN: no item update; P240 of stock still pinned via the movement.
4. Regression: `npx jest tests/unit/inventory tests/unit/recipe tests/unit/api/inventory` → 137 suites / 1,557 tests pass. Lint clean on touched files.

## Live verification (platform DB)

Before applying: the whole migration ran in `BEGIN … ROLLBACK` with role probes (fixtures created inside the transaction on a 5-branch store).

| # | Actor | Action | Expected | Got |
|---|---|---|---|---|
| P1 | owner | receive 1000 g @0.04 on empty shelf | cost 0.0400 | 0.0400 |
| P2 | owner | receive 1000 g @0.06 | blend 0.0500 | 0.0500 |
| P3 | owner | receive 500 g, no price | cost unchanged, movement NULL | 0.0500 / null |
| P4 | owner | waste with forged cost 999 | 0.0500 | 0.0500 |
| P5–6 | service | sale −300; cost → 0.08; void +300 | void 0.0500, order nets 0 | 0.0500, 0.00000000 |
| P7 | owner | unpriced 1000 g, then 1000 g @0.10 | 0.1000 (not 0.05) | 0.1000 |
| P9 | owner | waste of a prep costing 5e8/g | NULL, no error | null |
| P10 | owner | transfer out (forged 7), cost → 0.09, arrival + shortfall | all 0.0800 | 0.0800 ×3 |
| P11 | owner / anon | RPC to the helpers | 42501 | 42501 ×3 |
| P12 | anon | checkout inserts 3 lines | recipe 10.8, manual 25, foreign store none; categories right | as expected |
| P13 | owner | PATCH `category_name` | ignored | 0 changed |
| P14 | owner / anon | read / write `order_item_costs` | read 2; write 42501; anon 42501 | as expected |
| P15 | service | delivery at −1 | 23514 | 23514 |
| P16 | — | branch + roll-up balances after all of it | 2150 / 2300 | 2150 / 2300 |

Post-apply (rolled back): prep waste 600 g × 0.08 / 1 kg = **0.0480**; stocktake to 40 → delta 40 at 0.0800; a **branch-locked receiver who cannot see the sender's out-leg** (RLS: 0 rows) still gets the departure cost 0.0800 after the price moved to 0.50; a line moved to another dish is re-costed (60.0000) and re-categorised. Objects probed by name: 7 functions (definer/search_path as designed), 2 new triggers, CHECK, column, RLS on, 2 policies, grants (authenticated SELECT only; helpers service_role only; frozen-cost helper authenticated + service_role).

Parity: `INVENTORY_COST_LIVE=1 npx jest tests/live/inventory-frozen-cost-live.test.ts` — every live recipe (357; 344 costable, 259 non-zero) costs the same in SQL and `costing.ts`.

Types: `src/types/supabase.ts` regenerated via the Supabase MCP (additions only; it also picks up live objects from branches not merged here).

## Found, not fixed here

- **60 of 344 costed dishes (7 stores) have a recipe cost above their price; 54 above 3×** (e.g. a ₱149 latte costing ₱90,750). These are unit-price entry errors (priced per kg, stocked per g), the same family as the 1000× defect. Frozen costs will faithfully record them. Phase 3/5 must flag "cost looks wrong" (cost > price) and keep such dishes out of profit totals with a disclosure, and Stock home should nudge the owner to fix the ingredient price.
- Transfer movements still send the draft line's `unit_cost`; the trigger ignores it (comment added in `stock-transfers-service.ts`).

## Review follow-up (part 2, `20261012180100_inventory_frozen_cost_hardening.sql`, applied as `inventory_frozen_cost_hardening`)

Independent database review: no CRITICAL. Fixed:

| Finding | Fix |
|---|---|
| HIGH — a prep cycle fanned out ~k^8 calls inside checkout / sale (statement timeout is uncatchable → lost order) | Helpers carry their path (`p_path uuid[]`); a revisit or 32 nested preps = unknown. Old depth-integer overloads dropped. |
| MED — `exception when others` = one subtransaction per ledger row (>64 overflows `pg_subtrans` for everyone) | Removed from `stock_movement_frozen_cost` and the category snapshot (every failure guarded instead). Kept only in the checkout dish-cost trigger (one per line). |
| MED — never-priced ingredient frozen at 0 ("free") | Frozen cost ≤ 0 → NULL ("not recorded"). |
| LOW — `numeric(12,4)` rounded ₱0.00035/g to 0.0004 (+14%) | `stock_movements.unit_cost` + `inventory_items.unit_cost` → `numeric(16,6)`; frozen cost rounds to 6. |

Accepted as is: an empty/unpriced shelf takes the delivery price outright (deliberate); the `order_item_costs` policy evaluates per row (reports read through RPCs); a void with nothing left out falls back to today's cost.

RED: 3 shape tests failed (no part-2 file). GREEN 21/21. Rollback probes before apply: old overloads gone; 6-way interlinked prep cycle → NULL in 16 ms; checkout of a dish built on the cycle succeeds (no cost row, category kept); unpriced waste/sale/void → NULL; 0.00035 kept as 0.000350; multi-row void after a price change nets the order to 0; live recipe totals unchanged (344 costed). Post-apply: objects probed; no movement written between apply and probe was affected (latest movement predates apply). Parity test re-run: pass. Types regenerated (`p_path`). `tsc` clean (desktop `electron` errors pre-existing). Inventory suites 137/137 on a quiet re-run.
