# TDD evidence — Phase A: making recipes findable

**Source plan:** agreed in session. The user reported "we can't make a recipe
even on the web" and "we don't have enough clarity on what's happening".
Sequence confirmed **A → B → C**; the `inventory_enabled` flag stays
superadmin-only.

## Diagnosis: not broken, unreachable

`RecipeEditor` works and saves. Three things made it feel impossible:

1. **`/admin/inventory` returns a bare 404** unless a superadmin sets
   `inventory_enabled` — 1 of 166 tenants. (Kept as-is by decision.)
2. **The editor only renders when `inventoryEnabled && item?.id`.** A brand-new
   dish showed *nothing at all* — indistinguishable from the feature being
   missing. You had to save, leave, and reopen, and nothing said so.
3. **It is buried** at line ~468 of a ~750-line menu-item form, below the cost
   fields. There was no list, no count, and no way to see that an ingredient was
   consumed by nothing.

Recipes gate everything: no recipe means no depletion, so no crossing, so no
alert and no auto-86, and the stock figure never moves.

**The live proof.** `brewdazeexpress` — the only tenant with inventory on —
switched it on, created one ingredient, and stopped:

```
brewdazeexpress: dishes 51 | dishes_with_a_working_recipe 0 | unused: Mozzarela
```

They got in the door and could not find the next step, and nothing on any
screen could have told them.

## User journeys

- As a merchant, I want to see which dishes still have no recipe, so I know
  what is left to set up without opening all 51.
- As a merchant, I want to know when an ingredient is used by nothing, so I
  stop wondering why its quantity never changes.
- As a merchant adding a new dish, I want to be told a recipe comes after
  saving, rather than seeing blank space.

## Task report

| Task | Command | Result |
|---|---|---|
| Coverage + unused-ingredient rules | `npx jest tests/unit/inventory-recipe-coverage.test.ts` | RED (no module) → 12 PASS |
| The Recipes tab | `npx jest tests/unit/inventory-recipe-coverage-tab.test.tsx` | RED (no module) → 7 PASS |
| Wiring + new-dish explanation | `npx jest --maxWorkers=2` | 2785 PASS, 8 skipped |

Commits, all on `feat/platform-supabase-order-parity`:

| Stage | Commit |
|---|---|
| RED | `921430c test: add reproducer for nothing showing which dishes lack a recipe` |
| GREEN | `164b67f feat: rules for recipe coverage and unused ingredients` |
| RED | (tab reproducer) `test: add reproducer for there being no recipe coverage surface` |
| GREEN | `812a027 feat: make recipes findable instead of buried` |

## Design decisions worth not re-deriving

- **An empty recipe row counts as UNCOVERED.** A recipe with no components is a
  shell that depletes nothing; calling it covered would report a dish as ready
  while it does nothing at all.
- **Only base (`menu_item`) recipes count towards coverage** — the same rule
  auto-86 uses. A prep recipe belongs to an ingredient and an addon recipe to an
  option, so neither makes the dish itself depletable.
- **"Unused ingredient" is a deliberately broader question.** An ingredient used
  only by an addon or prep recipe is still consumed by sales, so it is *in use*
  even though it does not give any dish coverage. Retired (`is_active = false`)
  ingredients are excluded.
- **Uncovered dishes sort first**, alphabetical within each group. Burying the
  actionable ones under a long list of finished ones would defeat the only job
  the surface has; alphabetical-within-group keeps it stable between visits.
- **An empty shelf short-circuits the whole tab** to "Add ingredients first".
  A recipe cannot be built before an ingredient exists, so listing dishes would
  send the merchant to a form they cannot complete.
- Coverage is computed **on the server** and passed down, rather than the client
  re-fetching menu items and recipes it does not otherwise need.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A dish with a base recipe is covered, with its ingredient count | `inventory-recipe-coverage.test.ts:reports a dish with a base recipe as covered` | unit | PASS |
| 2 | A dish with no recipe is uncovered | `…:reports a dish with no recipe at all as uncovered` | unit | PASS |
| 3 | An empty recipe row is uncovered, not "set up" | `…:treats a recipe with no components as uncovered` | unit | PASS |
| 4 | A prep recipe gives no dish coverage | `…:ignores a prep recipe` | unit | PASS |
| 5 | Dishes needing setup are listed first | `…:lists dishes with no recipe first` | unit | PASS |
| 6 | Ordering is stable between visits | `…:orders alphabetically within a group` | unit | PASS |
| 7 | Coverage is summarised as covered/total | `…:counts how many dishes are set up` | unit | PASS |
| 8 | An empty menu summarises without dividing by zero | `…:reports an empty menu without dividing by zero` | unit | PASS |
| 9 | An ingredient no recipe references is named | `…:names an ingredient no recipe consumes` | unit | PASS |
| 10 | An addon-only ingredient counts as used | `…:counts an ingredient used only by an addon recipe as used` | unit | PASS |
| 11 | Retired ingredients are not flagged | `…:leaves out inactive ingredients` | unit | PASS |
| 12 | The tab states coverage as "N of M dishes" | `inventory-recipe-coverage-tab.test.tsx:says how many dishes are set up` | unit | PASS |
| 13 | An uncovered dish links straight to its recipe editor | `…:links a dish with no recipe straight to where its recipe is built` | unit | PASS |
| 14 | A covered dish shows its ingredient count | `…:shows how many ingredients a set-up dish uses` | unit | PASS |
| 15 | Unused ingredients are named | `…:names an ingredient no recipe consumes` | unit | PASS |
| 16 | Nothing is said when every ingredient is used | `…:says nothing about unused ingredients when every one is consumed` | unit | PASS |
| 17 | An empty shelf sends the merchant to Ingredients first | `…:tells a merchant with no ingredients to start there` | unit | PASS |

## Verification against real data

Read-only query against production, showing what each tenant would now see:

| Tenant | Dishes | With a working recipe | Unused ingredients |
|---|---|---|---|
| `brewdazeexpress` | 51 | 0 | Mozzarela |
| `cafejuancho` | 65 | 0 | — |

So the tab would open on **"0 of 51 dishes have a recipe"**, *"51 to set up"*,
and *"Not used by any recipe: Mozzarela"* — the exact diagnosis that was
previously invisible.

## Known gaps

- **The 404 stays.** By decision, `inventory_enabled` remains superadmin-only
  and an unenabled tenant still gets a bare 404 rather than an explanation.
  Worth revisiting if it generates support load.
- **No bulk recipe entry.** Setting up 51 dishes is still 51 visits to the
  menu-item form. A quick-add straight from this tab is the obvious follow-up.
- **The merchant app has none of this** — it cannot create recipes at all.
  That is Phase C.
- **Nothing yet explains what the system DID** — auto-86 events, movement
  history at tenant level. That is Phase B.
