# TDD Evidence — Prep (composite) ingredients (Phase 3)

## Source

No `*.plan.md` file was used. Journeys were derived during this TDD run from the
inline plan agreed in session. Phase 3 was scoped as "prep/composite ingredients
in the inventory manager". Earlier phases:
[Phase 1](./inventory-cost-mode.tdd.md), [Phase 2](./inventory-recipe-editor.tdd.md).

## User journeys

- As a merchant, I want to say what an in-house prep (dough, sauce, syrup) is
  made of, so its cost comes from ingredients instead of a number I guessed.
- As a merchant, I want to record how much a batch makes, so the cost of one
  gram of sauce is derived rather than estimated.
- As a merchant, I want to correct or clear a yield I entered wrongly.
- As a merchant with only raw materials, I want the inventory list to look
  exactly as it did.

## What was actually broken

The costing core has resolved prep ingredients recursively since Phase 0 —
`resolveIngredientUnitCost` costs the prep's own recipe and divides by its
yield, with cycle guarding. But `buildCostingGraph` only takes that branch when
the recipe row carries **both** `yield_quantity` and `yield_unit_id`, and
nothing could ever write either: `recipeInputSchema` had no yield fields, so
`saveRecipeForTarget` never persisted them.

The merchant-visible symptom: ticking **"Prep item (made in-house)"** set a flag
and rendered a badge, and nothing else. There was no way to attach a recipe to a
prep, and had there been, the derived cost would still have been discarded. The
recursion was unreachable code. This phase opened the path end to end.

## Task report

### Task 1 — Make the yield writable

`recipeInputSchema` gained optional `yield_quantity` / `yield_unit_id`; the new
pure `src/lib/inventory/recipe-yield.ts` maps validated input to the recipe
row's own columns, and `saveRecipeForTarget` uses it on both insert and update.

- **RED**: `npx jest --testPathPatterns="inventory-prep-yield"`
  → `Cannot find module '@/lib/inventory/recipe-yield'` (compile-time RED).
- **GREEN**: same command → `Tests: 7 passed`.
- **Why a separate pure module**: the write shape is the whole risk here. The
  yield is the divisor for every cost derived from that prep, so it needed a
  seam testable without a database — the same reasoning that produced
  `recipe-target.ts`.
- **Clearing works**: `buildRecipeRowFields` writes explicit `null`s rather than
  omitting absent fields. An omitted yield must *overwrite* a saved one, or a
  merchant who typed the wrong number could never take it back. A test pins this.
- **Guarded**: a zero or negative yield is rejected at the schema. It would
  otherwise divide the batch cost by nothing.

### Task 2 — Ask a prep how much it makes

`RecipeEditor` renders a "Yields [qty] [unit]" row **only** for the `prep_item`
target.

- **RED**: `npx jest --testPathPatterns="recipe-editor"`
  → `Tests: 2 failed, 12 passed` — no yield field, and no saved yield to reload.
- **GREEN**: same command → `Tests: 14 passed`.
- **Not shown elsewhere**: menu items, options and addons are consumed per sale,
  where a yield is meaningless and would only invite a wrong number. A test
  asserts its absence for the base-item target.
- **Unit pre-selected**: the yield unit defaults to the prep's own stock unit,
  since that is what a prep is priced in. This avoids a yield silently recorded
  in a unit nobody intended.

### Task 3 — A door in the inventory manager

Prep rows now carry a **Recipe** button that discloses a `RecipeEditor` keyed to
that prep.

- **RED**: `npx jest --testPathPatterns="inventory-prep-recipe"`
  → `Tests: 1 failed, 2 passed`. The 2 passing are absence assertions that hold
  vacuously before the feature exists; the failing one is the capability.
- **GREEN**: same command → `Tests: 3 passed`.
- **Collapsed by default**: each editor loads the tenant's ingredients, units,
  and its own recipe. Rendering one per row would fan out three requests per
  prep on page load, so only one opens at a time.
- **Raw materials unchanged**: flour is bought, not made. A test asserts no
  recipe control appears for a non-prep row.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | A prep recipe can record how much it makes | `inventory-prep-yield.test.ts` | unit | PASS | `npx jest inventory-prep-yield` |
| 2 | Every non-prep target still saves with no yield at all | same | unit | PASS | same |
| 3 | A zero/negative yield is rejected before it can divide a cost | same | unit | PASS | same |
| 4 | A yield unit that is not a real unit id is rejected | same | unit | PASS | same |
| 5 | The yield reaches the recipe row on save | same | unit | PASS | same |
| 6 | Omitting a yield clears a previously-saved one | same | unit | PASS | same |
| 7 | A yield reaches the service input from the form | `recipe-form.test.ts` | unit | PASS | `npx jest recipe-form` |
| 8 | A half-filled yield (qty or unit alone) is dropped, not half-saved | same | unit | PASS | same |
| 9 | A saved yield round-trips back into the form for correction | same | unit | PASS | same |
| 10 | The yield field appears for a prep and carries into the save | `recipe-editor.test.tsx` | unit | PASS | `npx jest recipe-editor` |
| 11 | No yield field appears for targets that are sold, not produced | same | unit | PASS | same |
| 12 | A previously saved yield loads so it can be corrected | same | unit | PASS | same |
| 13 | A prep's recipe opens from the inventory list, keyed to that prep | `inventory-prep-recipe.test.tsx` | unit | PASS | `npx jest inventory-prep-recipe` |
| 14 | Raw materials offer no recipe control | same | unit | PASS | same |
| 15 | The recipe stays closed until asked | same | unit | PASS | same |
| 16 | The whole inventory + product-editor surface still passes | `npx jest "inventory\|recipe\|modifier\|menu-item\|addon"` | unit | PASS | 32 suites / 310 tests |
| 17 | No client/server boundary leak from the new imports | `npm run build` | build | PASS | Compiled successfully in 25.4s |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory-prep-yield|inventory-prep-recipe|recipe-form|recipe-editor" \
  --coverage --collectCoverageFrom="{src/lib/inventory/recipe-yield.ts,src/lib/inventory/recipe-form.ts,src/components/admin/inventory-manager.tsx,src/components/admin/recipe-editor.tsx}"

File                    | % Stmts | % Branch | % Funcs | % Lines | Uncovered
All files               |   74.35 |    84.21 |    43.9 |   74.35 |
  inventory-manager.tsx |   56.04 |    56.25 |   22.72 |   56.04 | 123-178,198-204,387-587
  recipe-editor.tsx     |   96.16 |    84.78 |   45.45 |   96.16 | 104-108,134-136,143-145
  recipe-form.ts        |     100 |     91.3 |     100 |     100 | 54,92,134-142
  recipe-yield.ts       |     100 |      100 |     100 |     100 |
```

The two pure modules are at 100%/100% statements. Two numbers are below the 80%
bar and both are stated rather than rounded off:

- **`inventory-manager.tsx` at 56%** — this file had **no test at all** before
  this run; the first one arrived here. The uncovered ranges are the ingredient
  create/update/delete handlers and the entire `UnitsTab` (387–587), none of
  which this phase touched. The prep branch and `toggleRecipe` added here are
  covered. Coverage went from 0 to 56, but the untested majority is real.
- **Function coverage (43.9%)** — the same jsdom limit reported in Phase 2: the
  add/remove-line callbacks and Radix `Select` `onValueChange` handlers cannot
  be driven without a real pointer implementation. Branch coverage is 84%.

**Not done in this run:**

- **No end-to-end proof that a prep's derived cost reaches a menu item.** Each
  link is unit-tested (yield persists → graph reads it → costing divides by it),
  but no test walks the whole chain against a database. That belongs to the
  Phase 7 integration pass.
- **A prep's manual `unit_cost` still shows in the list** even once a recipe
  derives its cost. The list reads `item.unit_cost` directly; showing the
  derived figure needs a costing round-trip per row. Deferred rather than
  faked — a wrong cost displayed confidently is worse than a stale one.
- **No cycle warning in the UI.** `costRecipe` throws on a cyclic prep graph
  (A made of B made of A), so the server is safe, but the editor lets a merchant
  build one and only reports it at cost time.
- Variation options still have no recipe-attach UI (carried from Phase 2).
- `recipe_components` has no guard against a prep referencing itself directly.

## Environment note

A second Claude session has been committing to this branch throughout this work.
Only this task's paths were staged on each commit, and both checkpoints were
verified reachable from `HEAD`.

## Merge evidence (checkpoint commits)

| Commit | Stage |
|---|---|
| `5cc909b` | RED — reproducers for prep ingredient yields and prep recipes |
| `aa2c3c2` | GREEN — prep yields + prep recipes in the inventory manager |

Lint: `npx eslint` over every changed file → clean.
