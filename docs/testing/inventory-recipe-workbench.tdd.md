# TDD evidence — the recipe workbench

**Source plan:** reported in session — *"we can't create a recipe for an item
and we can't see any item we want to add a recipe with"*, with a reference
design supplied for the intended feel. Journeys derived during this run.

## The bug behind the complaint

Phase A added a Recipes tab that could *report* coverage — "0 of 51 dishes have
a recipe" — but the only way to act on it was a **link out** to the menu-item
form. So every single recipe cost:

1. a page navigation away from inventory,
2. a scroll past the cost fields to the bottom of a ~750-line form,
3. a trip back to find the next dish.

And there was **no search anywhere**. On a 51-dish menu you could not find the
dish you meant, which is precisely the reported symptom: the items were not
visible and the recipe could not be created.

Counting the problem is not the same as fixing it. Phase A did the first.

## User journeys

- As a merchant, I want to search my dishes and pick one, so I can find the dish
  I mean without scrolling a whole menu.
- As a merchant, I want to write the recipe right there, so setting up 51 dishes
  is 51 edits instead of 51 round trips.
- As a merchant, I want to see at a glance which dishes still need work, and
  filter to just those.

## What was built

A two-pane workbench replacing the link-out tab:

| Pane | Contents |
|---|---|
| Left | Search box, filter chips with counts (All / Needs recipe / Set up), scrollable dish list with per-dish status |
| Right | `RecipeEditor` for the selected dish, headed by its name |

`RecipeEditor` is **reused untouched**. It already loads and saves a recipe for
any target on its own round-trip, so keying it to the selection was the entire
integration — no save logic was rewritten or duplicated.

### Design decisions

- **Opens on the first dish needing a recipe.** `buildRecipeCoverage` already
  orders actionable-first, so landing on an empty pane would throw away the one
  decision the screen has already made.
- **The editor is remounted on selection change** (`key={menuItemId}`). Without
  it the previous dish's lines would sit under the new dish's heading until the
  reload finished — the worst possible moment to be ambiguous about which
  recipe you are editing.
- **Search matches anywhere in the name**, not just the start: a merchant
  searches for the word they remember ("adobo"), not the label's first word
  ("Chicken Adobo Rice").
- **The filter does not re-sort.** Coverage ordering is decided upstream;
  re-ordering here would silently override it.
- **An empty shelf short-circuits the whole pane** to "Add ingredients first",
  because every other control on it would be a dead end.

### Reference design

Taken from the supplied reference: the soft rounded cards on muted fills, the
chip-style filter row with counts, the search-led left column, and green as the
selection colour rather than the brand accent. Selection is carried by a green
border plus tint, matching the reference's selected-card treatment.

## Task report

| Task | Command | Result |
|---|---|---|
| Search / filter rules | `npx jest tests/unit/inventory-recipe-workbench.test.ts` | RED (no module) → 12 PASS |
| Workbench UI | `npx jest tests/unit/inventory-recipe-workbench-ui.test.tsx` | RED (no module) → 11 PASS |
| No regressions | `npx jest --maxWorkers=2` | 2801 PASS, 8 skipped |
| Types / lint | `npx tsc --noEmit`, `npx eslint` | 0 errors in `src/`, clean |

Commits, all on `feat/platform-supabase-order-parity`:

| Stage | Commit |
|---|---|
| RED | `test: add reproducer for being unable to find a dish to write a recipe for` |
| GREEN | `feat: search and status filter for picking a dish to write a recipe for` |
| RED | `test: add reproducer for the recipe workbench` |
| GREEN | `7029728 feat: build recipes in place instead of navigating away` |

### A correction made during GREEN

Three picker assertions failed with "multiple elements found". The cause was the
**test**, not the component: the selected dish's name legitimately appears in
both panes — once in the list, once as the editor heading — and a separate test
asserts exactly that. The assertions were scoped to the picker via a
`workbench-picker` test id rather than weakened.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | No filter and no search shows every dish | `inventory-recipe-workbench.test.ts:returns everything when nothing is typed` | unit | PASS |
| 2 | The filter narrows to dishes needing a recipe | `…:narrows to dishes still needing a recipe` | unit | PASS |
| 3 | The filter narrows to dishes already set up | `…:narrows to dishes already set up` | unit | PASS |
| 4 | Search matches anywhere in the name | `…:matches a search anywhere in the name` | unit | PASS |
| 5 | Search ignores case and whitespace | `…:ignores case and surrounding whitespace` | unit | PASS |
| 6 | Search and filter combine | `…:applies the search and the filter together` | unit | PASS |
| 7 | A search matching nothing returns nothing | `…:returns nothing when a search matches no dish` | unit | PASS |
| 8 | Filtering never re-sorts | `…:preserves the incoming order rather than re-sorting` | unit | PASS |
| 9 | Chip counts are correct, including an empty menu | `…:counts each filter so the chips can show totals` | unit | PASS |
| 10 | Every dish is listed | `inventory-recipe-workbench-ui.test.tsx:lists every dish` | unit | PASS |
| 11 | A dish is findable by an interior word | `…:finds a dish by a word anywhere in its name` | unit | PASS |
| 12 | The chip filters the list | `…:narrows to only the dishes still needing a recipe` | unit | PASS |
| 13 | Chips show how many dishes sit behind each | `…:shows how many dishes sit behind each filter` | unit | PASS |
| 14 | An empty search result says so | `…:says so when a search matches nothing` | unit | PASS |
| 15 | The first dish needing a recipe opens by default | `…:opens the first dish needing a recipe` | unit | PASS |
| 16 | Picking a dish switches the editor, no navigation | `…:switches the editor to whichever dish you pick` | unit | PASS |
| 17 | The editor pane names its dish | `…:names the dish being edited` | unit | PASS |
| 18 | The selected dish is marked in the list | `…:marks the selected dish in the list` | unit | PASS |
| 19 | An empty shelf sends the merchant to Ingredients | `…:sends a merchant with no ingredients to the Ingredients tab first` | unit | PASS |
| 20 | Unused ingredients are still surfaced | `…:still flags ingredients that no recipe consumes` | unit | PASS |

## Removed

`src/components/admin/recipe-coverage-tab.tsx` and its suite were **superseded
and deleted**, not left orphaned. Every guarantee it held — coverage summary,
unused ingredients, empty state — is asserted in the workbench suite. The one
that disappeared is "links out to the editor", which is the behaviour being
removed.

## Known gaps

- **The Ingredients and Units tabs were not restyled.** The Ingredients tab was
  being rebuilt into a table view by a parallel session in this same working
  tree during this work; restyling it concurrently would have collided. The
  reference-design language is applied to the Recipes surface only.
- **Still no bulk entry.** Setting up 51 dishes is now 51 in-place edits rather
  than 51 round trips, which is the large win, but a duplicate-recipe or
  apply-to-category action would cut it further.
- **No cost feedback in the workbench.** `estimateRecipeCost` exists and the
  editor shows it, but the pane does not show margin against the dish price —
  the obvious next addition.
- **Phase B is untouched.** The health panel and the activity feed explaining
  what auto-86 actually did are still to come.
