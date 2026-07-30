# TDD evidence — Phase 0: trustworthy inventory valuation

**Source plan**: the daily inventory report plan agreed in-session (COGS vs
revenue, theoretical-vs-actual usage, shrinkage). Phase 0 is its prerequisite:
every figure the report states is a quantity multiplied by a unit cost, so the
report cannot be built on a cost that is wrong by a factor of 1000.

Journeys were derived during this TDD run; no `*.plan.md` artifact was written.

## User journeys

1. As a merchant, I want to record a delivery in the unit I *buy* in (kg) at the
   price I *paid* (₱120/kg), so that my ingredient cost, dish margins and the
   daily report are right even though my shelf is measured in grams.
2. As a merchant, I want the receiving screen to tell me which unit the price is
   per, so that I can tell a correct entry from an incorrect one at the moment I
   make it rather than three screens away.

## Task report

### Task 1 — a delivery price is stored per stock unit

`inventory_items.unit_cost` and `stock_movements.unit_cost` are per STOCK unit:
every consumer pairs them with a quantity already converted to stock units. The
movement's *quantity* was converted (`resolveMovementDelta`) but its *price* was
written verbatim, so a gram-stocked ingredient received as `2 kg @ ₱120` stored
**₱120 per gram** — 1000× high — and then blended that figure into the moving
average against a per-gram existing cost.

- **Validation run**: `npx jest --config jest.config.cjs tests/unit/inventory-stock-cost-unit.test.ts tests/unit/inventory-unit-conversion.test.ts`
- **RED**:
  ```
  ● delivery price is stored per stock unit › 2 kg at P120/kg ... stores P0.12 per gram
      Expected: 0.12   Received: 120
  ● ... › the blended item cost is per stock unit, so 2 kg reads as P240 of stock
      Expected: 0.12   Received: 120
  Tests: 2 failed, 3 passed, 5 total

  ● convertUnitCost › ...
      TypeError: convertUnitCost is not a function
  Tests: 8 failed, 13 passed, 21 total
  ```
- **GREEN**:
  ```
  Test Suites: 2 passed, 2 total
  Tests:       26 passed, 26 total
  ```
- **Guaranteed**: a price entered in any unit of the same dimension is stored in
  the ingredient's stock unit; the moving-average blend uses the converted
  figure; a movement with no price still writes `null` and leaves the cost
  alone; a stocktake carries no price at all.

Note the 3 tests that passed in RED are the guard cases (no price, stock-unit
price, stocktake). They passed before the fix and after it — that is the point:
the change had to correct one interpretation without inventing a second bug.

### Task 2 — the screen names the unit the price is per

Converting silently is not enough. "Unit cost (₱, optional)" sat directly beneath
a unit dropdown and read as either unit, so the merchant had no way to know which
answer was wanted.

- **Validation run**: `npx jest --config jest.config.cjs tests/unit/inventory-stock-form.test.ts tests/unit/inventory-stock-manager.test.tsx`
- **RED**:
  ```
  ● describeDeliveryPriceUnit › names the entered unit in the label
      TypeError: describeDeliveryPriceUnit is not a function        (4 tests)
  ● InventoryManager delivery price unit › names the unit the price is per
      TestingLibraryElementError: Unable to find a label with the text of: /cost per g/i
  ```
- **GREEN**: `Tests: 13 passed, 13 total` (stock-form) and the manager suite green
  within the full inventory run below.
- **Guaranteed**: the label names the entered unit, falling back to the stock
  unit before one is picked; the conversion hint appears only when the two
  differ, so it stays worth reading.

**Deviation recorded**: two originally-written component tests drove the Radix
`Select` to change the unit and assert the label followed. Radix `Select` cannot
be driven under jsdom (it needs pointer-capture APIs jsdom does not implement)
and the repo has no precedent for doing so. Rather than assert a weaker thing
through the widget, the wording was extracted to a pure rule in `stock-form.ts`
and tested there — the same treatment `menu-availability.ts` and
`stock-history.ts` already receive. The component test that remains proves the
component is wired to that rule.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | A price per kg converts to a smaller price per g, and back without drift | `tests/unit/inventory-unit-conversion.test.ts:convertUnitCost` | unit | PASS |
| 2 | Price conversion is the inverse of quantity conversion, so total stock value is preserved | `tests/unit/inventory-unit-conversion.test.ts:is the inverse of convertQuantity` | unit | PASS |
| 3 | A cross-dimension or non-finite price throws rather than inventing a figure | `tests/unit/inventory-unit-conversion.test.ts:throws...` | unit | PASS |
| 4 | Receiving 2 kg @ ₱120 on a gram-stocked item writes ₱0.12/g to the ledger | `tests/unit/inventory-stock-cost-unit.test.ts` | integration (module seam) | PASS |
| 5 | The blended `inventory_items.unit_cost` is per stock unit, so 2 kg reads as ₱240 | `tests/unit/inventory-stock-cost-unit.test.ts` | integration (module seam) | PASS |
| 6 | A price already in the stock unit is stored unchanged | `tests/unit/inventory-stock-cost-unit.test.ts` | integration (module seam) | PASS |
| 7 | A delivery with no price writes null and does not touch the item cost | `tests/unit/inventory-stock-cost-unit.test.ts` | integration (module seam) | PASS |
| 8 | A stocktake stores the discrepancy as the delta and carries no price | `tests/unit/inventory-stock-cost-unit.test.ts` | integration (module seam) | PASS |
| 9 | The price field names the entered unit, defaulting to the stock unit | `tests/unit/inventory-stock-form.test.ts:describeDeliveryPriceUnit` | unit | PASS |
| 10 | The conversion hint appears only when the units differ | `tests/unit/inventory-stock-form.test.ts:describeDeliveryPriceUnit` | unit | PASS |
| 11 | The dialog renders the unit-aware label | `tests/unit/inventory-stock-manager.test.tsx:names the unit the price is per` | component | PASS |

## Coverage and known gaps

Whole-subsystem run:

```
npx jest --config jest.config.cjs --testPathPatterns="inventory"
Test Suites: 1 skipped, 45 passed, 45 of 46 total
Tests:       8 skipped, 472 passed, 480 total
```

`npx eslint` clean on all four changed files. `npx tsc --noEmit` reports errors
only in the ~11 pre-existing test files documented as the untyped `jest.Mock`
pattern; `src/` is clean and neither new suite appears.

**Existing rows are not backfilled.** Any `unit_cost` written before this change
by a merchant who entered a non-stock unit is still wrong in the database, and
nothing distinguishes it from a correct one — the entered unit is recorded on
the movement, but `inventory_items.unit_cost` is a blend with no provenance. A
backfill would have to replay the ledger per ingredient and is deliberately not
attempted here. Only one tenant (`brewdazeexpress`) has inventory switched on
with a single ingredient, so the live exposure is one row.

**The `stock_movements` stocktake path is unchanged.** The read-modify-write in
which a concurrent sale can swallow a merchant's physical count is a separate
finding and is not addressed here.

## Correction to the subsystem review

`.claude/reviews/inventory-system-review.md` recommends closing the duplicate
depletion hole with `UNIQUE (tenant_id, order_id, reason)` on `stock_movements`.
**That constraint is wrong and would reject every real order.** One order writes
one row per ingredient, all sharing `(tenant_id, order_id, reason)`; and
`resolveOrderDepletions` keys its totals on `inventory_item_id::unit_id`
(`order-depletion.ts:61`, `:83`), so even a four-column variant including the
ingredient would reject an order whose base recipe uses grams and whose addon
uses kilograms for the same ingredient.

The claim-check shape — a separate table holding one row per
`(tenant_id, order_id, reason)` with a UNIQUE constraint, inserted before the
ledger write, where `23505` means "already applied" — achieves the same
idempotency without constraining the ledger's row shape at all. Not yet built.
