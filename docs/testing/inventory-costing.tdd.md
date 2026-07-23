# TDD Evidence — Inventory System + Comprehensive Costing (Phase A core)

**Source plan:** inline `/ecc:plan` output (this session). No `*.plan.md` file.
**Branch:** `feat/inventory-costing`
**Scope of this report:** the pure costing foundation — the highest-risk logic that
closes the variation/option/addon costing gap. Persistence services, live
migration apply, and the two UIs are subsequent slices.

## User journeys covered

1. As a merchant, I want an ingredient's recipe cost computed from its
   components in whatever unit I entered them, so item cost is accurate even when
   I buy in kg but cook in grams.
2. As a merchant, I want a **prep/composite** (e.g. a sauce) to cost itself from
   its own recipe and yield, so shared preps aren't double-counted or mis-priced.
3. As a merchant, I want the cost of a **specific configuration** — base item +
   the selected size/variation option + chosen addons — so margins reflect what
   the customer actually ordered (the gap: options/addons had price, no cost).
4. As the system, I must reject impossible costing inputs (cross-dimension
   conversion, recipe cycles, missing recipes) instead of producing garbage.

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| Unit conversion (same-dimension ratio, base helper, guards) | `npx jest --config jest.config.cjs inventory-unit-conversion` | RED: module absent → GREEN 9 tests |
| Recipe rollup, nested prep via yield, cycle guard, configured cost, margin | `npx jest --config jest.config.cjs inventory-costing` | RED: module absent → GREEN 16 tests |
| Rows→graph mapping + configuration recipe resolution | `npx jest --config jest.config.cjs inventory-graph-builder` | RED: module absent → GREEN 7 tests |

Final: `32 passed, 32 total` across the 3 suites. `eslint` clean on new sources.

## Test specification

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | kg↔g↔mg and L↔ml convert by factor ratio; identical unit is identity | `inventory-unit-conversion.test.ts` | unit | PASS |
| 2 | Cross-dimension conversion throws; non-finite throws | `inventory-unit-conversion.test.ts` | unit | PASS |
| 3 | Recipe cost = Σ component qty (converted to stock unit) × unit cost | `inventory-costing.test.ts` | unit | PASS |
| 4 | Prep ingredient priced as recipe cost ÷ yield, recursively | `inventory-costing.test.ts` | unit | PASS |
| 5 | Missing recipe throws; recipe cycle throws; missing raw cost = 0 | `inventory-costing.test.ts` | unit | PASS |
| 6 | Configured cost = base + selected option deltas + addons; unknown recipe ids contribute 0 | `inventory-costing.test.ts` | unit | PASS |
| 7 | Margin: profit + percent, zero-price safe (no divide-by-zero) | `inventory-costing.test.ts` | unit | PASS |
| 8 | Rows map into a graph the core can price; prep yield wired; unknown unit throws | `inventory-graph-builder.test.ts` | unit | PASS |
| 9 | Config resolver selects base/option/addon recipes by stable JSON ids only | `inventory-graph-builder.test.ts` | unit | PASS |

## Coverage & known gaps

- Pure modules (`unit-conversion`, `costing`, `graph-builder`) are exhaustively
  covered including error paths.
- **Not yet covered (subsequent slices):** Supabase CRUD services + server
  actions, the live migration apply, weighted-moving-average recompute (Phase B),
  order-driven stock depletion (Phase B), and both UIs (web admin + webnegosyo-app).
- The migration `20260722120000_inventory_core.sql` was **applied to the live
  Supabase project** on 2026-07-23 (name `inventory_core`). Apply was gated by a
  pre-flight audit confirming: none of the 4 new tables or the `inventory_enabled`
  column pre-existed, and all dependencies (`tenants`, `menu_items`, `app_users`,
  `set_updated_at()`) were present. Post-apply verification confirmed RLS enabled
  with admin + superadmin policies on all 4 tables, `inventory_enabled` defaulting
  to `false` (every existing tenant opted-out — feature dark until toggled), and
  the temp RLS helper dropped. `get_advisors(security)` reported **no new
  warnings** attributable to these tables.
- `src/types/supabase.ts` was updated **surgically** (4 table blocks + the
  `tenants.inventory_enabled` field added by hand) rather than by full
  regenerate-from-live. A full regenerate was attempted and reverted because the
  live remote DB lags local migrations (`order_backend`, `checkout_leads`, convex
  version columns not yet pushed), so regenerating would have deleted type
  definitions the codebase still depends on. `tsc --noEmit` error count is
  unchanged from baseline (13, all in unrelated pre-existing test files); zero
  new errors touch inventory or the types file.
