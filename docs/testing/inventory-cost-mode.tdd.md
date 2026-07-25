# TDD Evidence — Inventory cost mode + costing read path (Phase 1a–1b)

## Source

No `*.plan.md` file was used. Journeys were derived during this TDD run from the
inline plan agreed in session, which resolved two open questions:

1. **Cost mode** — every costable target gets an explicit **Simple / Composite**
   choice rather than an implicit "recipe overrides manual" precedence rule.
2. **Order depletion** — Convex first, then the per-tenant Supabase order
   backend (Phase 4; not part of this run).

This report covers **Phase 1a** (the pure core) and **Phase 1b** (the costing
read path). The admin UI wiring — the Simple/Composite toggle and the
`menu_items.cost_mode` migration — is the remaining Phase 1 work.

## User journeys

- As a merchant, I want to choose whether an item/option is costed by a number I
  type (**Simple**) or by an ingredient recipe (**Composite**), so the cost shown
  is the one I actually maintain.
- As a merchant with items configured before this feature existed, I want my
  costs and margins to stay exactly as they were, so nothing silently changes.
- As a merchant, I want to see the recipe-derived cost of each variation option,
  addon, and modifier option of an item, so I can spot a bad-margin modifier.
- As a merchant with one broken recipe, I want the other rows to still show their
  costs, so a single mistake does not blank out the editor.

## Task report

### Task 1 — Cost mode resolver

Added `src/lib/inventory/cost-mode.ts` (`resolveCostByMode`,
`resolveOptionCostForOption`) and the `CostMode` type on `ModifierOption`.

- **RED**: `npx jest --testPathPatterns="inventory-cost-mode|inventory-cost-breakdown"`
  → `Test Suites: 2 failed, 2 total` — `Cannot find module '../../src/lib/inventory/cost-mode'`
  (compile-time RED: the tests reference the intended, not-yet-existing modules).
- **GREEN**: same command → `Test Suites: 2 passed, Tests: 21 passed`.
- **Guarantees**: the chosen mode is authoritative in both directions; a missing
  cost on the chosen side reads as 0 rather than falling back to the other side;
  an absent mode reproduces the pre-existing `resolveOptionCost` output for every
  legacy input (asserted by direct comparison, not by restating the rule).

### Task 2 — Per-target cost breakdown

Added `src/lib/inventory/cost-breakdown.ts` (`computeMenuItemCostBreakdown`),
mapping recipe rows onto one menu item's base / variation option / addon /
modifier option targets.

- **RED / GREEN**: same commands and results as Task 1 (one reproducer commit).
- **Guarantees**: correct keying per target type; recipes for other menu items
  and `prep_item` recipes are excluded; a broken recipe becomes a reported
  `errors` entry while every other row keeps its cost.

### Task 3 — Wire cost mode into the live margin path

`computeOptionMargin` now resolves via `resolveOptionCostForOption`;
`resolveOptionCost` delegates to `resolveCostByMode(undefined, ...)` so one rule
exists instead of two implementations.

- **RED**: `npx jest --testPathPatterns="modifier-margin"` → `Tests: 2 failed, 7 passed`.
  Simple mode returned the recipe cost (45, expected 30); composite mode with no
  recipe returned the stale manual cost (30, expected 0). The 5 pre-existing
  legacy assertions passed unchanged — this is the runtime RED.
- **GREEN**: `npx jest --testPathPatterns="modifier|inventory|recipe"`
  → `Test Suites: 21 passed, Tests: 227 passed`, stable across 3 consecutive runs.

### Task 4 — Unified modifier options in configured-cost resolution

`resolveConfiguredRecipeIds` now matches `target_type='modifier_option'` by
`modifier_option_id`, returning those recipes in `optionRecipeIds` where the
costing core already sums option deltas.

- **RED**: `npx jest --testPathPatterns="inventory-graph-builder"`
  → `Tests: 2 failed, 10 passed` — `optionRecipeIds` was `[]` where
  `['modSpicy']` was expected. All 6 pre-existing tests passed.
- **GREEN**: `npx jest --testPathPatterns="inventory|recipe|modifier"`
  → `Test Suites: 21 passed, Tests: 232 passed`.
- **Why it mattered**: this was a pre-existing gap, harmless while nothing
  consumed the function, but Phase 4 order depletion relies on it to explode an
  order into ingredients — modifier options would have silently depleted nothing.
- **Backward compatibility**: `selectedModifierOptionIds` is optional and last,
  and the return shape is unchanged. A dedicated test asserts that omitting the
  argument reproduces the exact prior result.

### Task 5 — Costing read path

Added `src/lib/inventory/costing-service.ts` (`getCostingGraph`,
`getMenuItemCost`) and `getMenuItemCostAction` in `src/app/actions/inventory.ts`.

- **RED**: `npx jest --testPathPatterns="inventory-costing-service"`
  → `Test Suites: 1 failed` — `Cannot find module '@/lib/inventory/costing-service'`.
- **GREEN**: same command → `Tests: 7 passed`; full targeted run
  `npx jest --testPathPatterns="inventory|recipe|modifier"`
  → `Test Suites: 22 passed, Tests: 239 passed`.
- **Design**: the row fetch is injectable via `CostingFetchDeps`, mirroring
  `TenantOrderWriteDeps` in `tenant-supabase-orders.ts`, so assembly and error
  handling are unit-tested without a Supabase client.
- **Guarantees**: rows project into a priceable graph; an empty tenant yields an
  empty graph rather than an error; rows are fetched once per call; a broken
  recipe is reported in `errors`; **a fetch failure propagates** instead of
  degrading to an empty graph, which would render a confident ₱0 on every item.
- **Build**: `npm run build` → compiled successfully. This is the guard against
  the client/server boundary leak that previously broke PR #22 — `costing-service`
  imports `next/headers` via the Supabase server client and must never reach a
  client bundle.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | Simple mode uses the manual cost even when a recipe cost exists | `inventory-cost-mode.test.ts` | unit | PASS | `npx jest inventory-cost-mode` |
| 2 | Composite mode uses the recipe cost even when a manual cost exists | same | unit | PASS | same |
| 3 | A zero recipe cost in composite mode is a real zero, not a fallback | same | unit | PASS | same |
| 4 | Composite with no recipe attached costs 0, not the stale manual cost | same | unit | PASS | same |
| 5 | An absent mode matches `resolveOptionCost` for every legacy input | same | unit | PASS | same |
| 6 | An item with no recipes yields a null base cost and empty maps | `inventory-cost-breakdown.test.ts` | unit | PASS | `npx jest inventory-cost-breakdown` |
| 7 | Costs key correctly per target (base / variation / addon / modifier option) | same | unit | PASS | same |
| 8 | Recipes of other menu items and `prep_item` recipes are excluded | same | unit | PASS | same |
| 9 | A cyclic or missing-ingredient recipe is reported without losing other rows | same | unit | PASS | same |
| 10 | Option margin honors an explicit cost mode | `modifier-margin.test.ts` | unit | PASS | `npx jest modifier-margin` |
| 11 | Legacy option margin behavior is unchanged | `modifier-margin.test.ts` (5 pre-existing) + `modifier-groups.test.ts` | unit | PASS | `npx jest modifier` |
| 12 | A selected unified modifier option contributes its recipe to the configured cost | `inventory-graph-builder.test.ts` | unit | PASS | `npx jest inventory-graph-builder` |
| 13 | Unselected / other-item modifier options are excluded | same | unit | PASS | same |
| 14 | Omitting the new modifier argument reproduces the prior result exactly | same | unit | PASS | same |
| 15 | Tenant rows project into a graph the costing core can price | `inventory-costing-service.test.ts` | unit | PASS | `npx jest inventory-costing-service` |
| 16 | An empty tenant yields an empty graph, not an error | same | unit | PASS | same |
| 17 | Rows are fetched once per call | same | unit | PASS | same |
| 18 | A broken recipe surfaces as an error rather than throwing | same | unit | PASS | same |
| 19 | A fetch failure propagates instead of reporting a false ₱0 cost | same | unit | PASS | same |
| 20 | The server-only costing service never reaches a client bundle | `npm run build` | build | PASS | compiled successfully |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory-cost-mode|inventory-cost-breakdown|modifier-margin|modifier-groups" --coverage

File                 | % Stmts | % Branch | % Funcs | % Lines | Uncovered
All files            |     100 |    93.54 |     100 |     100 |
  modifier-margin.ts |     100 |      100 |     100 |     100 |
  cost-breakdown.ts  |     100 |    89.47 |     100 |     100 | 35,58
  cost-mode.ts       |     100 |      100 |     100 |     100 |
```

Phase 1b modules:

```
npx jest --testPathPatterns="inventory-cost|graph-builder" --coverage \
  --collectCoverageFrom="src/lib/inventory/costing-service.ts" \
  --collectCoverageFrom="src/lib/inventory/graph-builder.ts"

File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered
All files           |   90.62 |      100 |     100 |   90.62 |
  costing-service.ts|   77.17 |      100 |     100 |   77.17 | 46-66
  graph-builder.ts  |     100 |      100 |     100 |     100 |
```

Both above the 80% threshold. Uncovered: `describeTarget`'s id fallback chain
(cosmetic string building), the non-`Error` throw path, and
`costing-service.ts:46-66` — the Supabase default fetcher, which is the injected
boundary itself and is deliberately exercised by the build rather than by a unit
test.

**Known gaps / not done in this run:**

- `cost_mode` is a **type-level** field only so far. No migration yet for a
  `menu_items.cost_mode` column, and no backfill — deliberate, because the
  `undefined` = legacy branch means existing data needs no migration to keep
  working. The column arrives with the Phase 1 UI.
- The admin UI toggle is the remaining Phase 1 work. **`getMenuItemCostAction`
  has no caller yet** — the read path is built and tested but not yet displayed,
  so a merchant still sees only the manual cost.
- No caller passes `selectedModifierOptionIds` to `resolveConfiguredRecipeIds`
  yet; the capability exists ahead of its Phase 4 consumer.
- No integration/RLS/E2E coverage — unchanged from before this run (Phase 7).

## Environment note

A **second Claude session was committing to this same branch during this run**
(P5 tenant-project order-backend work). Full-suite failure counts moved between
runs because that session added test files and modified `jest.setup.js` mid-run.
Consequences for this evidence:

- Only this task's paths were staged; the four checkpoint commits below each
  contain solely this task's files and are all reachable from `HEAD`.
- Full-suite numbers are **not** a reliable baseline for this run. The stable,
  repeated evidence is the targeted 21-suite / 227-test run above.
- `tests/checkout-form-payment-terms.test.tsx` and `tests/checkout-page-video.test.tsx`
  failed in one full-suite run and **passed in isolation** — load-dependent
  timeout flakes, not caused by this change.
- The 2 consistently-failing suites (`webnegosyo-app/lib/printer-native-load.test.ts`,
  `webnegosyo-app/lib/order-item-images.test.ts`, 3 tests) are the pre-existing
  mock-hoisting failures already documented in
  `docs/testing/inventory-schemas-client-boundary.tdd.md`.

## Merge evidence (checkpoint commits)

| Commit | Stage |
|---|---|
| `886340b` | RED — reproducers for cost mode + cost breakdown |
| `f9ddd99` | GREEN — cost-mode resolver + cost-breakdown module |
| `c3c3e06` | RED — reproducer for cost-mode-aware option margin |
| `53c0da1` | GREEN — margin honors cost_mode; `resolveOptionCost` delegates |
| `33b54c9` | docs — Phase 1a evidence |
| `8a3fab5` | RED — reproducer for unified modifier options in configured cost |
| `16deb4d` | GREEN — modifier-option recipes resolved into optionRecipeIds |
| `64ac34c` | RED — reproducer for the inventory costing read path |
| `1af1b8f` | GREEN — costing read path + getMenuItemCostAction |

Lint: `npx eslint` over the five changed files → clean.
