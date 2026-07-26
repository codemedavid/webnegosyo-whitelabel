# TDD Evidence — Inventory cost mode, costing read path, cost source UI (Phase 1a–1c)

## Source

No `*.plan.md` file was used. Journeys were derived during this TDD run from the
inline plan agreed in session, which resolved two open questions:

1. **Cost mode** — every costable target gets an explicit **Simple / Composite**
   choice rather than an implicit "recipe overrides manual" precedence rule.
2. **Order depletion** — Convex first, then the per-tenant Supabase order
   backend (Phase 4; not part of this run).

This report covers **Phase 1a** (the pure core), **Phase 1b** (the costing read
path), and **Phase 1c** (the merchant-facing cost source control). Phase 1 is
complete for modifier options. The base item's cost source is deliberately
deferred — see Known gaps.

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

### Task 6 — Per-option cost source control (Phase 1c)

Added `setOptionCostMode` to `src/lib/modifier-groups-form.ts`, a Manual/Recipe
toggle per option in `modifier-groups-editor.tsx`, and
`src/hooks/use-menu-item-costs.ts` — the first caller of `getMenuItemCostAction`.

- **RED**: `npx jest --testPathPatterns="modifier-groups-form"`
  → `Tests: 5 failed, 14 passed` (`setOptionCostMode is not a function`);
  `npx jest --testPathPatterns="modifier-option-cost-source"`
  → `Tests: 7 failed, 2 passed` (no cost source control rendered);
  `npx jest --testPathPatterns="use-menu-item-costs"`
  → `Test Suites: 1 failed` (`Cannot find module '@/hooks/use-menu-item-costs'`).
- **GREEN**: `npx jest --testPathPatterns="inventory|recipe|modifier|menu-item"`
  → `Test Suites: 27 passed, Tests: 267 passed`; `npm run build` → compiled.
- **Design**: `optionRecipeCosts` reaches the editor as a **prop**, not a fetch —
  the editor stays presentational and the server action stays in the container,
  which is what makes the display testable without a Supabase client.
- **Deliberate asymmetry**: `costing-service` throws on a fetch failure, but the
  hook swallows it into "no recipe costs". The service must not report a false
  ₱0; the editor must not break because a cost panel could not load. The hook is
  where that decision is made, and it is tested from both sides.
- **`manual_cost` survives a switch to composite.** The mode decides which cost
  is *used*, so the typed number is inert rather than wrong, and switching back
  restores it instead of discarding merchant input.
- **Recipe editor now also opens for a composite option** whose stock is
  untracked. Previously only `stock_mode === 'recipe'` revealed it, so costing by
  recipe would have forced the merchant to also turn on recipe-backed stock —
  two unrelated decisions welded together.

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
| 21 | A merchant can switch an option between Manual and Recipe costing | `modifier-option-cost-source.test.tsx` | unit | PASS | `npx jest modifier-option-cost-source` |
| 22 | The editor shows which cost source is currently active | same | unit | PASS | same |
| 23 | A composite option displays its recipe cost, not its stale manual cost | same | unit | PASS | same |
| 24 | A simple option ignores an attached recipe cost | same | unit | PASS | same |
| 25 | A legacy option with no mode keeps the recipe-overrides-manual rule | same | unit | PASS | same |
| 26 | The recipe editor opens for a composite option with untracked stock | same | unit | PASS | same |
| 27 | The manual cost input is hidden only when costing is recipe-based | same | unit | PASS | same |
| 28 | Choosing a cost mode never mutates the option or drops its manual cost | `modifier-groups-form.test.ts` | unit | PASS | `npx jest modifier-groups-form` |
| 29 | Choosing a cost mode leaves stock tracking untouched | same | unit | PASS | same |
| 30 | Costs load for a saved item with inventory on | `use-menu-item-costs.test.tsx` | unit | PASS | `npx jest use-menu-item-costs` |
| 31 | No request is made for an unsaved item or an inventory-off tenant | same | unit | PASS | same |
| 32 | A failed or thrown cost load leaves the editor working with no costs | same | unit | PASS | same |

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

Phase 1c modules:

```
npx jest --testPathPatterns="modifier-groups-form|use-menu-item-costs|modifier-option-cost-source" --coverage \
  --collectCoverageFrom="src/lib/modifier-groups-form.ts" \
  --collectCoverageFrom="src/hooks/use-menu-item-costs.ts"

File                      | % Stmts | % Branch | % Funcs | % Lines | Uncovered
All files                 |     100 |    91.66 |     100 |     100 |
  use-menu-item-costs.ts  |     100 |     90.9 |     100 |     100 | 45
  modifier-groups-form.ts |     100 |       92 |     100 |     100 | 135,142
```

**Known gaps / not done in this run:**

- **No migration was needed, and none was written.** Modifier options live in the
  `menu_items.modifier_groups` JSONB column, so `cost_mode` persists with no
  schema change and no backfill — the `undefined` = legacy branch carries
  existing tenants unchanged.
- **`menu_items.cost_mode` was planned and is deliberately not built.** The base
  item's cost (`costPrice`/`costNotes`) lives in **Convex**, not Supabase — there
  are no cost columns on `menu_items`. Adding a Supabase `cost_mode` column would
  put the mode in a different store from the cost it governs. The base-item cost
  source belongs with the base cost and is deferred until that store is settled;
  `getMenuItemCost` already returns `baseCost`, and the hook already exposes it.
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
| `87b32ea` | docs — Phase 1b evidence |
| `1ea9b0d` | RED — reproducers for the per-option cost source control |
| `8e19941` | RED — reproducer for the menu item cost hook |
| `67e04e0` | GREEN — cost source toggle, cost hook, container wiring |

Lint: `npx eslint` over the five changed files → clean.
