# Inventory management — table redesign (TDD evidence)

## Source

No `*.plan.md`. Journeys were derived during this TDD run from a reference
design supplied by the user: a data table with `Item Code · Photo · Item Name ·
Item Group · Last Purchase · On Hand · Actions`, a search box, an Export
control, an "Add Item" button, row selection checkboxes, sortable headers and a
`Showing X - Y of N entries` footer with a page-size picker.

## User journeys

1. As a merchant with dozens of ingredients, I want to see them as a table so I
   can scan codes, groups and stock levels without reading a paragraph per item.
2. As a merchant, I want to search, sort and page through ingredients so a long
   pantry stays usable.
3. As a merchant, I want to see when each ingredient was last received so I know
   what is due for reordering.
4. As a merchant, I want to select rows and export what is on screen so I can
   work on the list elsewhere.
5. As a merchant, I still want every action the card list offered — add, edit,
   record stock, edit a prep recipe, delete — reachable from the table.

## Task report

### 1. Table view model (search / sort / paginate / select / export)

Pure functions in `src/lib/inventory/inventory-table.ts`. RED first: the test
file imported a module that did not exist.

- RED: `npx jest tests/unit/inventory-table.test.ts`
  → `Cannot find module '../../src/lib/inventory/inventory-table'` (compile-time
  RED — the intended missing implementation).
- GREEN: same command → `Tests: 33 passed, 33 total`.

Guaranteed: placeholder code/group for blank SKU and category; NUMERIC trailing
zeros trimmed off the on-hand label; low/out levels derived from the existing
`evaluateStockLevel`; never-purchased rows sort last in *both* directions;
pagination clamps out-of-range pages and reports an empty result honestly;
selection is immutable and page-changes do not drop off-page selections; CSV
quoting survives commas and embedded quotes.

### 2. Table component

`src/components/admin/inventory-table.tsx`.

- RED: `npx jest tests/unit/inventory-table-view.test.tsx`
  → `Cannot find module '@/components/admin/inventory-table'`.
- First implementation ran 20/23; three failures showed the table pre-sorting by
  name on mount, which disagreed with the order the server already returns.
  Fixed by leaving `sortKey` null until the merchant sorts.
- GREEN: `Tests: 26 passed, 26 total` (after two added coverage cases).

### 3. Manager wired onto the table

`src/components/admin/inventory-manager.tsx` — the card list is gone; the recipe
editor moved from an inline expansion into a dialog; stock/recipe/delete moved
behind a per-row actions menu.

- RED: `npx jest tests/unit/inventory-manager-table.test.tsx
  tests/unit/inventory-stock-manager.test.tsx tests/unit/inventory-prep-recipe.test.tsx`
  → `Tests: 21 failed, 4 passed, 25 total` (manager still rendered cards).
- GREEN: same command → `Tests: 25 passed, 25 total`.

The two pre-existing manager suites were rewritten to the new spec (open stock
and recipe through the row menu; assert the on-hand cell and the low-stock
`aria-label` rather than card text). No assertion was weakened — each still
covers the same behaviour through the new door.

### 4. Last purchase

`src/lib/inventory/last-purchase.ts` reads the newest `receive` movement per
ingredient and the page passes it to the manager as a plain record. The
reduction (`toLastPurchaseMap`) is covered in task 1; the read itself returns
`{}` on error so a missing date costs a blank cell, never the page.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | An ingredient projects into code / photo / name / group / last purchase / on hand | `tests/unit/inventory-table.test.ts:buildInventoryRows` | unit | PASS |
| 2 | Blank SKU and category render as placeholders, not empty cells | `tests/unit/inventory-table.test.ts` | unit | PASS |
| 3 | Low and out-of-stock rows are flagged from the reorder level | `tests/unit/inventory-table.test.ts`, `inventory-table-view.test.tsx` | unit | PASS |
| 4 | Only the most recent receive per ingredient survives the lookup | `tests/unit/inventory-table.test.ts:toLastPurchaseMap` | unit | PASS |
| 5 | Search matches name, code and group, case-insensitively | `tests/unit/inventory-table.test.ts`, `inventory-table-view.test.tsx` | unit | PASS |
| 6 | Sorting is numeric on quantity and puts never-purchased items last both ways | `tests/unit/inventory-table.test.ts:sortInventoryRows` | unit | PASS |
| 7 | Pagination clamps out-of-range pages and reports `Showing X - Y of N` | `tests/unit/inventory-table.test.ts`, `inventory-table-view.test.tsx` | unit | PASS |
| 8 | A search that shrinks the result returns the merchant to page 1 | `tests/unit/inventory-table-view.test.tsx` | unit | PASS |
| 9 | Header checkbox selects visible rows without dropping off-page selections | `tests/unit/inventory-table.test.ts`, `inventory-table-view.test.tsx` | unit | PASS |
| 10 | Export downloads the filtered rows as CSV, with RFC 4180 quoting | `tests/unit/inventory-table.test.ts`, `inventory-table-view.test.tsx` | unit | PASS |
| 11 | Add is disabled until the tenant has a unit to price against | `tests/unit/inventory-manager-table.test.tsx` | unit | PASS |
| 12 | Edit, record stock, recipe and delete all still open from a row | `tests/unit/inventory-manager-table.test.tsx`, `inventory-stock-manager.test.tsx`, `inventory-prep-recipe.test.tsx` | unit | PASS |
| 13 | Recipe is offered for prep items only, and not loaded until asked for | `tests/unit/inventory-table-view.test.tsx`, `inventory-prep-recipe.test.tsx` | unit | PASS |
| 14 | Recording stock still writes a magnitude and adopts the server's total | `tests/unit/inventory-stock-manager.test.tsx` | unit | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom='src/lib/inventory/inventory-table.ts' \
  --collectCoverageFrom='src/components/admin/inventory-table.tsx' \
  tests/unit/inventory-table.test.ts tests/unit/inventory-table-view.test.tsx \
  tests/unit/inventory-manager-table.test.tsx

All files             |     100 |    93.96 |   96.87 |     100
  inventory-table.tsx |     100 |    96.61 |   95.23 |     100
  inventory-table.ts  |     100 |    91.22 |     100 |     100
```

Full suite: `npx jest` → `Test Suites: 234 passed`, `Tests: 2748 passed`.
Lint: `npx next lint --file src/components/admin/inventory-table.tsx` → clean
(an initial `aria-sort`-on-button warning was fixed by moving the attribute to
the `<th>`).

## Known gaps

- `src/lib/inventory/last-purchase.ts` has no test of its own — it is a thin
  Supabase read whose only logic (`toLastPurchaseMap`) is covered directly. Its
  2000-row cap means a pantry with more receive movements than that can lose a
  date on a very old ingredient; the cell reads "Never" rather than wrong.
- Row selection is wired and counted but has no bulk action behind it yet.
- The units tab still uses the card list; only ingredients were redesigned.
- No E2E coverage — the change is presentational over already-covered actions.
