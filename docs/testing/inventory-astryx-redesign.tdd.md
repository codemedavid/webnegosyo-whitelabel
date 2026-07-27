# TDD Evidence — Inventory rebuilt on the Astryx design system

**Source plan**: journeys derived during this TDD run.

**Branch**: `feat/unified-modifier-groups`

## What changed

The whole web admin inventory page now renders in [Astryx](https://astryx.atmeta.com)
(`@astryxdesign/core` 0.1.8). The 786-line shadcn `inventory-manager.tsx` was
replaced by six focused components:

| File | Role |
|---|---|
| `inventory/inventory-manager.tsx` | Tab shell, counts on the tabs |
| `inventory/ingredients-tab.tsx` | Ingredient table + its three dialogs |
| `inventory/units-tab.tsx` | Units table + unit dialog |
| `inventory/ingredient-dialog.tsx` | Ingredient form |
| `inventory/stock-dialog.tsx` | Stock movement form + history |
| `inventory/stock-level-cell.tsx` | On-hand quantity with its level |
| `inventory/stock-alerts-banner.tsx` | Open alerts (rebuilt earlier in the pass) |

### Design decisions taken from Astryx's own guidance

- **Cards became rows.** Their rule is explicit: "dense data = rows (Table,
  List/Item) edge-to-edge — never Card-wrapped list items". Twenty ingredients
  can now be scanned down a column instead of parsed card by card.
- **Status is a `StatusDot`, not a Badge.** Their rule: "Status → StatusDot;
  Badge only for counts and enumerated states". A healthy ingredient now shows
  no marker at all — a marker on every row would drown the two that matter.
- **Stock reasons became a `SegmentedControl`** — mutually exclusive options
  that should all be visible, which is exactly what that control is for.
- **The prep recipe moved from an inline row expansion into a `Dialog`.** A
  table row cannot hold an editor. This also keeps the editor's data load
  deferred until a merchant asks for it, which the original comment called out
  as the reason it was collapsed by default.
- **Kept your admin shell, not their `AppShell`**, and scoped `<Theme>` to the
  inventory subtree, so every other admin page is untouched.
- **`reset.css` deliberately not imported** — a page-wide reset that would land
  in a CSS layer declared after Tailwind's and take precedence over Preflight
  everywhere else. Astryx components self-style via `astryx.css`.

## User journeys

1. As a merchant, I want to see every ingredient and what is on hand in one
   scannable list, so I can judge my shelf at a glance.
2. As a merchant, I want ingredients that are low or exhausted marked, and
   healthy ones left unmarked, so the problems stand out.
3. As a merchant, I want prep items distinguished from bought ingredients, and
   a recipe only where one can exist.
4. As a merchant, I want to be stopped from adding an ingredient before any unit
   exists, and told why.
5. As a merchant, I want to record a delivery, stocktake or waste against an
   ingredient and see the server's new figure, not my own arithmetic.
6. As a merchant, I want to be asked before a deletion that would cost recipes a
   line.

## Task report

### Task 1 — The rebuild

- Validation: `npx jest tests/unit/inventory-manager-astryx.test.tsx`
- RED: `Cannot find module '@/components/admin/inventory/inventory-manager'`.
  Commit `30f221b`.
- GREEN: `Tests: 21 passed`. Commit `86451ef`.
- Guarantees: every ingredient is listed with its on-hand quantity in its own
  stock unit, NUMERIC round-trip zeros trimmed; low and exhausted ingredients
  are announced distinctly and a healthy one is not announced at all; prep items
  are marked and only they offer a recipe; a retired ingredient is shown as
  inactive rather than hidden; both empty states explain themselves; the
  no-units guard blocks the add button and says why; all three dialogs open with
  the right title.

### Task 2 — Coverage of the units CRUD

- Validation: same file. `Tests: 27 passed`.
- Guarantees: a new unit reaches the server with the typed values; an invalid
  form is caught before any round trip; deletion asks first and is abandoned
  when the merchant cancels; the ingredient deletion warning names the
  consequence ("Recipes using it").

### Corrections made during the cycle

Three of my assumptions about the library were wrong, and were corrected in the
tests rather than papered over in the component:

1. **`TabList` is navigation, not the ARIA tab pattern.** It renders
   `<button aria-current="page">` inside a `<nav>`. `getByRole('tab')` was my
   error, not a component defect.
2. **A `Button` with a tooltip uses `aria-disabled`, not the native attribute**,
   so it stays focusable and the reason stays reachable by keyboard. The test
   now asserts that contract, which is stronger than `toBeDisabled()`.
3. **Astryx renders truncated labels twice** (cell + overflow tooltip), so two
   assertions were scoped rather than left ambiguous.

### Environment work this forced

| Problem | Fix |
|---|---|
| `Unexpected token 'export'` on any Astryx import | `transpilePackages` in `next.config.ts` — `next/jest` derives `transformIgnorePatterns` from that list, so patching `jest.config.cjs` does nothing |
| Same, one level deeper | Astryx's `intl-messageformat` chain added to the same list |
| `dialog.showModal is not a function` | jsdom polyfill in `jest.setup.js` |
| `window.matchMedia is not a function` | jsdom polyfill in `jest.setup.js` |
| `tenantSchema` rejecting `domain` | **zod pinned back to 4.1.12** — installing Astryx bumped it to 4.4.3 inside the existing `^4.1.12` range, changing union/optional semantics. Unrelated to the design system and much wider in blast radius |

Two older suites (`inventory-stock-manager`, `inventory-prep-recipe`) were
repointed at the new module and their assertions updated to the new
presentation — "800 g on hand" is now an `On hand` column, and "Low stock" is
now an announced `StatusDot`. The behaviours they guard are unchanged.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every ingredient is listed by name | `inventory-manager-astryx.test.tsx:lists every ingredient by name` | unit | PASS |
| 2 | On-hand quantity shows in the ingredient's own stock unit | `…:shows what each ingredient has on hand…` | unit | PASS |
| 3 | NUMERIC round-trip zeros are trimmed | `…:trims the trailing zeros…` | unit | PASS |
| 4 | An ingredient at its reorder level is announced as low | `…:flags an ingredient that has fallen to its reorder level` | unit | PASS |
| 5 | An exhausted ingredient is announced differently | `…:flags an exhausted ingredient differently…` | unit | PASS |
| 6 | A healthy ingredient gets no level marker | `…:says nothing about level for a healthy ingredient` | unit | PASS |
| 7 | Prep items are marked | `…:marks a prep item…` | unit | PASS |
| 8 | Only prep items offer a recipe | `…:offers a recipe only for prep items` / `…for a prep item` | unit | PASS |
| 9 | A retired ingredient is shown as inactive, not hidden | `…:marks a retired ingredient as inactive…` | unit | PASS |
| 10 | Both empty states explain themselves | `…:explains itself when there are no ingredients yet` / `…no units yet` | unit | PASS |
| 11 | Adding an ingredient is blocked with no units, and says why | `…:will not let a merchant add…` / `…says why the button is unavailable…` | unit | PASS |
| 12 | Switching to units lists them with their conversion | `…:lists the units once the merchant switches…` / `…shows how a unit converts to its base` | unit | PASS |
| 13 | All three dialogs open with the correct title | `…:opens an empty ingredient form…` / `…titled for editing…` / `…names the ingredient in the stock dialog` | unit | PASS |
| 14 | A new unit reaches the server with the typed values | `…:sends a new unit to the server` | unit | PASS |
| 15 | An invalid unit form never reaches the server | `…:does not call the server when the form is invalid` | unit | PASS |
| 16 | Deletion asks first, and is abandoned on cancel | `…:asks before deleting a unit…` / `…leaves the unit alone when the merchant cancels` | unit | PASS |
| 17 | The ingredient delete warning names the consequence | `…:asks before deleting an ingredient, warning that recipes lose the line` | unit | PASS |
| 18 | Recording a delivery sends a magnitude and adopts the server's figure | `inventory-stock-manager.test.tsx:records a delivery…` / `…shows the new on-hand figure…` | unit | PASS |
| 19 | The ledger is re-read every time the stock dialog opens | `inventory-stock-manager.test.tsx:re-reads the ledger every time the dialog opens` | unit | PASS |

## Coverage

```
File                     | % Stmts | % Branch | % Funcs | % Lines
All files                |   92.08 |       80 |    53.7 |   92.08
 ingredient-dialog.tsx   |     100 |      100 |   18.18 |     100
 ingredients-tab.tsx     |   87.28 |    73.07 |   68.75 |   87.28
 inventory-manager.tsx   |     100 |      100 |     100 |     100
 stock-alerts-banner.tsx |     100 |    88.88 |     100 |     100
 stock-dialog.tsx        |   99.35 |       75 |   33.33 |   99.35
 stock-level-cell.tsx    |     100 |      100 |     100 |     100
 units-tab.tsx           |   96.81 |    79.41 |   69.23 |   96.81
```

Statements and lines 92%, branches 80% — both at or above the 80% threshold.
**Function coverage is 53.7% and below it.** The shortfall is almost entirely
per-field `onChange` setters in the two form dialogs: eighteen one-line arrows
that only run when a test types into that specific field. `astryx-region.tsx`
is at 0% — it is a provider wrapper with no branching and no test.

Whole suite: `npx jest` → **231 suites, 2684 tests, all passing**.
`npx tsc --noEmit` → no errors in production files. `npx eslint` on every
changed file → clean. `npm run build` → compiles; inventory route 247 kB route
JS / 686 kB first load (Astryx adds roughly 220 kB to this one route).

## Known gaps

1. **Nothing has been seen rendering.** Every check here is jsdom and a compile.
   Astryx's visual result — spacing, dark/light, the table at narrow widths —
   has not been looked at in a browser, and jsdom cannot tell you it looks
   right.
2. **Still no real data.** Production has zero `inventory_items` rows, so this
   page has never rendered an actual ingredient.
3. **Function coverage below threshold**, as above.
4. **The merchant app is unchanged** and cannot use these components —
   `@astryxdesign/core` peers on `react-dom`. Its Stock screen keeps the warm
   cream theme, by your decision.
5. **Astryx is 0.1.8 and in beta.** `npx astryx upgrade --apply` exists for
   version bumps, but the API may move under you.
