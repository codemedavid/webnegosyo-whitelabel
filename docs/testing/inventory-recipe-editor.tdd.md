# TDD Evidence — Target-generic recipe editor (Phase 2)

## Source

No `*.plan.md` file was used. Journeys were derived during this TDD run from the
inline plan agreed in session. Phase 2 was scoped as "`RecipeEditor` extraction +
base-item and addon recipe editors". Phase 1 evidence lives in
[`inventory-cost-mode.tdd.md`](./inventory-cost-mode.tdd.md).

## User journeys

- As a merchant, I want to attach an ingredient recipe to the **item itself**, so
  its cost comes from what it is actually made of.
- As a merchant, I want to attach a recipe to an **add-on**, so extras are costed
  too rather than guessed.
- As a merchant, I want the cost display to update when I save a recipe, so I do
  not have to reload the page to see the effect.
- As a merchant whose store has inventory turned off, I want the product editor
  to look exactly as it did, so nothing new appears that I cannot use.

## Task report

### Task 1 — Extract a target-generic `RecipeEditor`

`src/components/admin/recipe-editor.tsx` now serves any `RecipeTarget`;
`ModifierOptionRecipeEditor` became a thin wrapper that only names its target.

- **RED**: `npx jest --testPathPatterns="recipe-editor"`
  → `Test Suites: 1 failed` — `Cannot find module '@/components/admin/recipe-editor'`
  (compile-time RED).
- **GREEN**: same command → `Tests: 7 passed`.
- **Why it mattered**: the recipe control already existed but only a modifier
  option could reach it. A merchant could cost a "Large" upgrade from ingredients
  while the item itself had no recipe at all — the base cost, the largest number
  on the page, was the one thing that could not be costed.
- **Duplication removed**: ~200 lines. The wrapper keeps every existing call site
  working unchanged.
- **Target correctness**: a test asserts the save carries the *given* target, not
  a hardcoded one — the failure mode of an extraction like this is a recipe
  silently keyed to the wrong row, which the partial unique indexes would then
  enforce as a wrong-but-valid state.

### Task 2 — On-demand cost refresh

`useMenuItemCosts` gained `refresh()`, wired to every editor's `onSaved`.

- **RED**: `npx jest --testPathPatterns="use-menu-item-costs"`
  → `Tests: 1 failed, 5 passed` — `result.current.refresh is not a function`
  (runtime RED; the 5 pre-existing tests passed unchanged).
- **GREEN**: same command → `Tests: 6 passed`.

### Task 3 — Recipes for legacy addons

`AddonEditor` accepts an optional `recipeContext` and renders a `RecipeEditor`
per addon.

- **RED**: `npx jest --testPathPatterns="addon-recipe-editor"`
  → `Tests: 1 failed, 3 passed`. The 3 passing are absence assertions that hold
  vacuously before the feature exists; the failing one is the capability.
- **GREEN**: same command → `Tests: 4 passed`.
- **Why the deprecated path still got the feature**: addons are edited through
  this component for every tenant without `modifier_groups_enabled`. Skipping it
  would have made inventory costing work only for migrated tenants — a silent
  half-feature rather than a deferred one.
- **Backward compatibility**: `recipeContext` is optional. A test renders
  `AddonEditor` with no context at all and asserts the original output.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | An existing recipe loads for whichever target is given | `recipe-editor.test.tsx` | unit | PASS | `npx jest recipe-editor` |
| 2 | Saving carries the given target, not a hardcoded one | same | unit | PASS | same |
| 3 | Emptying the lines clears the recipe instead of saving an empty one | same | unit | PASS | same |
| 4 | A tenant with no ingredients is told to add them first | same | unit | PASS | same |
| 5 | A line missing its unit is refused rather than saved | same | unit | PASS | same |
| 6 | The container is notified after a save so costs can refresh | same | unit | PASS | same |
| 7 | Each target can label its own recipe section | same | unit | PASS | same |
| 8 | Costs can be re-read on demand after a recipe is saved | `use-menu-item-costs.test.tsx` | unit | PASS | `npx jest use-menu-item-costs` |
| 9 | An addon's recipe is keyed to that addon | `addon-recipe-editor.test.tsx` | unit | PASS | `npx jest addon-recipe-editor` |
| 10 | No recipe control appears when inventory is off | same | unit | PASS | same |
| 11 | No recipe control appears before the item is saved | same | unit | PASS | same |
| 12 | Callers passing no recipe context render exactly as before | same | unit | PASS | same |
| 13 | The whole product-editor surface still compiles and passes | `npx jest "inventory\|recipe\|modifier\|menu-item\|addon"` | unit | PASS | 30 suites / 293 tests |
| 14 | No client/server boundary leak from the new imports | `npm run build` | build | PASS | Compiled successfully |

## Coverage and known gaps

```
npx jest --testPathPatterns="recipe-editor|addon-recipe-editor|use-menu-item-costs" --coverage \
  --collectCoverageFrom="src/components/admin/recipe-editor.tsx" \
  --collectCoverageFrom="src/components/admin/addon-editor.tsx" \
  --collectCoverageFrom="src/hooks/use-menu-item-costs.ts"

File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered
All files                |   96.45 |    85.18 |   42.85 |   96.45 |
  addon-editor.tsx       |   96.52 |    71.42 |      25 |   96.52 | 66-69
  recipe-editor.tsx      |   95.33 |    84.84 |   44.44 |   95.33 | 89-93,119-121,128-130
  use-menu-item-costs.ts |     100 |    92.85 |     100 |     100 | 51
```

Statement and branch coverage are above the 80% threshold. **Function coverage is
not** (42.85%), and that number is honest: the uncovered functions are the
add/remove-line callbacks and the Radix `Select` `onValueChange` handlers, which
jsdom cannot drive without a real pointer implementation. The uncovered lines are
the same handlers plus the two server-error toast branches.

**Known gaps / not done in this run:**

- **Variation options have no recipe editor yet.** `RecipeEditor` supports the
  `variation_option` target and the costing core reads it, but no UI attaches
  one. Legacy grouped variations are edited in `VariationGroupsEditor`, which was
  left untouched this run — unified modifier options are the supported path for
  new work, and wiring both would double the deprecated surface. This is a
  deliberate omission, not an oversight.
- No integration/RLS/E2E coverage for the recipe write path (Phase 7).
- The `Select` interactions above are unverified in jsdom; they are the same
  controls that shipped in the pre-extraction editor, unchanged.

## Environment note

A **second Claude session continued committing to this branch during this run**
(MCP image ingestion, a branding upload fix, a storefront 404 fix). Only this
task's paths were staged. The five checkpoint commits below are each scoped to
this task's files and were verified reachable from `HEAD` with
`git merge-base --is-ancestor`.

## Merge evidence (checkpoint commits)

| Commit | Stage |
|---|---|
| `aac7056` | RED — reproducer for the target-generic recipe editor |
| `d7b9779` | RED — reproducer for on-demand cost refresh |
| `de5b02b` | GREEN — RecipeEditor + base item recipes + refresh |
| `1fcf488` | RED — reproducer for addon recipe attachment |
| `a9d8b2f` | GREEN — recipes attachable to legacy addons |

Lint: `npx eslint` over every changed file → clean.
