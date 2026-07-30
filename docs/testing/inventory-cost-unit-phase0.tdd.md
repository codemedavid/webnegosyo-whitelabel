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

---

# Phase 0, task 3 — one order deducts stock exactly once

## User journey

As a merchant, I want a retried or replayed order to deduct my ingredients once,
so that a burst of duplicate requests cannot drive my stock negative and take my
whole menu off sale.

## Execution

Both ledger writers guarded themselves with SELECT-then-INSERT over
`stock_movements`. Under concurrency that is not a guard: N parallel calls all
read "none" and all insert. Reached through the PUBLIC
`/api/inventory/customer-order-stock` route — which is unauthenticated by design,
since a diner has no account — N deltas apply, `current_qty` has no non-negative
CHECK, and auto-86 then hides every dish touching those ingredients.

- **RED**: `Cannot find module '../../src/lib/inventory/order-stock-claim'` —
  `Tests: 0 total`, commit `test: add reproducer for concurrent order depletion`.
- **GREEN**: `npx jest --config jest.config.cjs --testPathPatterns="inventory"` →
  `Test Suites: 1 skipped, 46 passed, 46 of 47 total`,
  `Tests: 8 skipped, 479 passed, 487 total`.

## Correction to the subsystem review, now acted on

The review recommended `UNIQUE (tenant_id, order_id, reason)` on
`stock_movements`. **That constraint would reject every real order.** One order
writes one row per ingredient, all sharing those three values; and
`resolveOrderDepletions` keys totals on `inventory_item_id::unit_id`
(`order-depletion.ts:83`), so even a four-column variant would reject an order
whose base recipe uses grams and whose addon uses kilograms for the same
ingredient.

The constraint therefore lives on a separate claim row — one per
`(tenant_id, order_id, reason)` in `order_stock_applications` — and the ledger's
row shape is untouched.

## Claim lifecycle

The claim is taken BEFORE the ledger write and released on every exit that
writes nothing (no recipes, no depletions, all rows skipped, or any throw). A
claim outliving a depletion that never happened marks the order permanently done
with its stock still on the shelf — silent, and worse than the double-deduction
the claim exists to stop. `depleteClaimedOrder` was split out so the release has
exactly one place to live rather than five.

`releaseOrderStockApplication` never throws: the caller is already handling an
error when it gets there, and the cost of a leaked claim is a retry that no-ops.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 12 | A first claim succeeds and inserts into `order_stock_applications` | `tests/unit/inventory-order-stock-claim.test.ts` | unit | PASS |
| 13 | A 23505 duplicate is refused, not thrown | `tests/unit/inventory-order-stock-claim.test.ts` | unit | PASS |
| 14 | Any other DB error throws rather than reading as already-applied | `tests/unit/inventory-order-stock-claim.test.ts` | unit | PASS |
| 15 | Sale and void are claimed independently | `tests/unit/inventory-order-stock-claim.test.ts` | unit | PASS |
| 16 | A release is scoped to one tenant, order and direction | `tests/unit/inventory-order-stock-claim.test.ts` | unit | PASS |
| 17 | A failed release never sinks the caller | `tests/unit/inventory-order-stock-claim.test.ts` | unit | PASS |
| 18 | A lost claim stops depletion before it reads recipes | `tests/unit/inventory-order-stock-guards.test.ts` | integration (module seam) | PASS |
| 19 | A won claim proceeds to deplete | `tests/unit/inventory-order-stock-guards.test.ts` | integration (module seam) | PASS |
| 20 | An uncosted menu claims, finds nothing, and hands the claim back | `tests/unit/inventory-order-stock-besteffort.test.ts` | integration (module seam) | PASS |
| 21 | A lost claim stops a duplicate cancellation from restoring twice | `tests/unit/inventory-order-stock-reverse.test.ts` | integration (module seam) | PASS |
| 22 | A duplicate restore never reaches the alert path | `tests/unit/inventory-stock-alerts-wiring.test.ts` | integration (real modules) | PASS |
| 23 | A duplicate restore never re-enables a menu item | `tests/unit/inventory-alerts-integration.test.ts` | integration (real modules) | PASS |

Five suites stubbed the old SELECT guard. They were **rewritten to the claim,
not deleted** — the guarantees they encode are still the right guarantees; only
the mechanism beneath them changed.

## Live database

Migration `20260805120000_order_stock_applications` **APPLIED 2026-07-30** via
MCP. Post-apply probe:

```
claims_backfilled: 0   distinct_order_directions: 0
unique_index: 1        policies: 2
```

Zero backfilled because no order has ever depleted stock platform-wide — the one
tenant with inventory enabled (`brewdazeexpress`) still has 0 recipes, so nothing
has ever reached the ledger through an order. The backfill is written and correct
for the moment that changes.

Constraint probed in-database and rolled back: a duplicate
`(tenant, order, 'sale')` raised `unique_violation`, the same order's `'void'`
stayed independently claimable, and `leftover: 0` rows remained.

## Known gaps

- The `stock_movements` RLS policies are still `FOR ALL`, so an admin can DELETE
  ledger rows without restoring `current_qty`. Unchanged by this work.
- Both admin inventory API routes still authorize on role alone and skip the
  `verifyTenantPermission` the web path enforces. Unchanged by this work.
- `current_qty` still has no non-negative CHECK. The claim removes the
  concurrency route to negative stock but not an oversell against thin stock.

---

# Phase 1 — the daily inventory report (pure reconciliation)

## User journeys

1. As a merchant, I want to see what today's ingredients cost against what I
   sold, so that I know whether the day's revenue actually covered it.
2. As a merchant, I want tomorrow's physical count compared against what the POS
   says I sold, so that anything missing is named and priced rather than
   discovered a month later as an unexplained margin gap.

## Execution

`sale` rows are recipe-derived, never counted — that is precisely *theoretical
usage*. A stocktake already stores the *discrepancy* as its delta. So both sides
of the comparison were already in the ledger with no reader; this adds the
reader and no migration.

- **RED**: `Cannot find module '../../src/lib/inventory/daily-report'` —
  `Tests: 0 total`.
- **GREEN**: `npx jest --config jest.config.cjs tests/unit/inventory-daily-report.test.ts`
  → `Tests: 16 passed, 16 total`; whole subsystem
  `Test Suites: 1 skipped, 47 passed, 47 of 48 total`,
  `Tests: 8 skipped, 496 passed, 504 total`.

One intermediate failure was `Expected: 0, Received: -0` — negating a zero sum
yields `-0`, which formats as "-0" and reads on a report as a loss too small to
name rather than as nothing at all. Fixed with a `magnitude` helper rather than
by loosening the assertion.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 24 | Opening is the balance before the first movement, not zero | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 25 | `opening + received − sold − waste ± count = closing` holds | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 26 | A void nets off its sale, so a cancelled order consumed nothing | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 27 | Usage is reported as a positive magnitude, never `-0` | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 28 | Theoretical usage valued at unit cost gives COGS | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 29 | Waste is valued separately from COGS | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 30 | A short count is shrinkage, priced as a positive loss | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 31 | A long count is NOT negative shrinkage | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 32 | Rows rank by peso shrinkage, not percentage | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 33 | Ingredients that did not move are left out | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 34 | A zero-variance count still appears, flagged as counted | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 35 | Counted vs uncounted are reported, so a clean report is not mistaken for a checked one | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 36 | An unpriced ingredient contributes quantities but no money, and is counted as uncosted | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 37 | A movement naming a deleted ingredient is dropped, not crashed on | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 38 | An empty day reports nothing rather than zeroes | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |
| 39 | Opening/closing come from time order, not array order | `tests/unit/inventory-daily-report.test.ts` | unit | PASS |

## Known gaps — Phase 1 is the ARITHMETIC only

- **No reader, no screen.** `daily-report-read.ts` (RLS server client, Asia/Manila
  day boundary) and the Reports tab are not built. Nothing renders this yet.
- **No revenue.** The COGS side is complete; food-cost % needs the order backend
  and is Phase 2. The ledger is always platform-side but ORDERS are not, so
  Convex tenants need the `platform-analytics-merge.ts` fan-out.
- **No verdict or threshold.** Ranking exists; the 1–2% / 3–5% / >5% judgement
  and the count-session table are Phase 3.
- **Recipe coverage is not consulted.** A tenant with no recipes produces a
  report showing zero usage and zero shrinkage, which reads as a perfect day.
  The report must state its coverage before it states a verdict — this is the
  single most important thing Phase 3 must not omit.
