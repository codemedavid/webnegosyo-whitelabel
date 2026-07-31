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

---

# Phase 1b — the read layer and the business day

## User journey

As a merchant, I want the report to cover *my* trading day, so that a dinner
service is not split across two reports and every day stops looking short.

## Execution

- **RED**: `Cannot find module '../../src/lib/inventory/business-day'` and
  `.../daily-report-read'` — `Tests: 0 total` in both cases.
- **GREEN**: `tests/unit/inventory-business-day.test.ts` → `9 passed`;
  `tests/unit/inventory-daily-report-read.test.ts` → `6 passed`; subsystem
  `Test Suites: 1 skipped, 49 passed, 49 of 50 total`,
  `Tests: 8 skipped, 511 passed, 519 total`. Lint clean, `src/` tsc clean.

**Why a fixed +08:00 offset, not `Intl`:** the Philippines has observed no
daylight saving since 1978 and the platform is single-market, so a fixed offset
is exact here and depends on no runtime timezone database. If the platform ever
ships outside PH this becomes a per-tenant setting, not a cleverer calculation —
recorded so the shortcut is a decision rather than an oversight.

The window is **half-open** (`>= start`, `< end`) so consecutive days tile the
timeline and no movement is counted on two reports.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 40 | A Manila day starts at 16:00 UTC the day before | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 41 | Consecutive day windows tile without overlapping | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 42 | A malformed day key throws rather than yielding an empty report | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 43 | A sale just after Manila midnight belongs to the new day, not the old | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 44 | `previousBusinessDayKey` crosses month and year boundaries | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 45 | Every read is scoped to the tenant (all three tables) | `tests/unit/inventory-daily-report-read.test.ts` | integration (module seam) | PASS |
| 46 | The ledger read is bounded to the Manila day, half-open | `tests/unit/inventory-daily-report-read.test.ts` | integration (module seam) | PASS |
| 47 | The read side never reaches for the service-role client | `tests/unit/inventory-daily-report-read.test.ts` | integration (module seam) | PASS |
| 48 | The day's reconciled report is returned with its stock units | `tests/unit/inventory-daily-report-read.test.ts` | integration (module seam) | PASS |
| 49 | A quiet day returns empty rather than failing | `tests/unit/inventory-daily-report-read.test.ts` | integration (module seam) | PASS |

Guarantee 45 is deliberately unlike its neighbours: the review found that across
~50 inventory suites exactly one asserts a tenant filter *argument*, because the
shared Supabase stubs record calls and discard what they were given — so deleting
`.eq('tenant_id', …)` leaves those suites green. This stub records arguments.

Guarantee 47 is enforced by making `createAdminClient` *throw* in the mock rather
than by trusting the convention, so the service-role client cannot creep onto a
read path later without a test failing.

## Phase 1c — the Reports tab (2026-07-30)

The report had been correct and completely unreachable: `getDailyInventoryReport`
had no caller and no tab offered it. This phase is the surface.

### RED

```
$ npx jest --config jest.config.cjs --testPathPatterns="inventory-daily-report-view"
Cannot find module '../../src/lib/inventory/daily-report-view'
Tests: 0 total

$ npx jest --config jest.config.cjs --testPathPatterns="inventory-daily-report-panel"
Cannot find module '../../src/components/admin/daily-report-panel'
Tests: 0 total

$ npx jest --config jest.config.cjs --testPathPatterns="inventory-business-day"
Tests: 6 failed, 9 passed, 15 total      # resolveReportDay missing; the 9 are Phase 1b

$ npx jest --config jest.config.cjs --testPathPatterns="inventory-reports-tab"
Tests: 2 failed, 2 passed, 4 total       # no Reports tab, no defaultTab
```

### GREEN

```
$ npx jest --config jest.config.cjs --testPathPatterns="inventory-daily-report-view"
Tests: 15 passed, 15 total

$ npx jest --config jest.config.cjs --testPathPatterns="inventory-daily-report-panel"
Tests: 11 passed, 11 total

$ npx jest --config jest.config.cjs --testPathPatterns="inventory-reports-tab|inventory-business-day"
Tests: 19 passed, 19 total

$ npx jest --config jest.config.cjs --testPathPatterns="inventory"
Test Suites: 1 skipped, 52 passed, 52 of 53 total
Tests:       8 skipped, 547 passed, 555 total

$ npx eslint <changed files>            # clean
$ npx tsc --noEmit | grep '^src/'       # no output
```

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 50 | Money always shows centavos and groups thousands without a locale | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 51 | Nothing spent renders as ₱0.00, not as an empty cell | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 52 | A negative amount keeps a readable sign | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 53 | Quantities carry their unit and trim NUMERIC(16,4) trailing zeros | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 54 | The day is labelled with its weekday, stably across month boundaries | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 55 | A malformed day key throws rather than rendering garbage | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 56 | An uncounted day says so, singular and plural | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 57 | An unpriced ingredient says so, singular and plural | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 58 | No caveat is shown when everything was counted and priced | `tests/unit/inventory-daily-report-view.test.ts` | unit | PASS |
| 59 | The panel names the day being reported | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 60 | Each row shows its usage quantity and its cost | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 61 | The day totals COGS, waste and shrinkage in money | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 62 | The panel preserves the core's worst-first ranking | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 63 | Both caveats surface on the screen, not just in the model | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 64 | Counted ingredients are marked as counted | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 65 | A day with no movement reads as "no stock moved", not an empty table | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 66 | Day links carry `tab=reports` so stepping a day keeps the tab | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 67 | No next-day link exists once the report reaches the latest day | `tests/unit/inventory-daily-report-panel.test.tsx` | unit (RTL) | PASS |
| 68 | The report defaults to yesterday, not today | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 69 | An explicit day is honoured, including today | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 70 | A malformed `?day=` falls back instead of throwing | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 71 | A future day is clamped to today | `tests/unit/inventory-business-day.test.ts` | unit | PASS |
| 72 | The Reports tab appears only when a report was loaded | `tests/unit/inventory-reports-tab.test.tsx` | unit (RTL) | PASS |
| 73 | `?tab=reports` opens straight onto the report | `tests/unit/inventory-reports-tab.test.tsx` | unit (RTL) | PASS |
| 74 | An unknown tab in the URL falls back rather than opening nothing | `tests/unit/inventory-reports-tab.test.tsx` | unit (RTL) | PASS |

### Decisions worth not re-deriving

- **The caveats render ABOVE the numbers.** A merchant has to learn why a report
  is clean before they trust that it is. An uncounted day and a genuinely tidy
  day produce the identical zero, and putting that in a footnote is how the
  feature becomes quietly reassuring instead of useful (guarantee 63).
- **`resolveReportDay` never throws.** The day arrives from `?day=`, so it is
  untrusted. A report is a read; a hand-edited or stale URL is a reason to show
  a sensible day, not to 500 the whole inventory page (guarantee 70).
- **A future day is clamped, not shown.** An empty future report is
  indistinguishable from a day whose data went missing (guarantee 71).
- **The panel does not sort.** The core already ranked rows worst-first by peso;
  re-sorting in the view would bury an expensive loss under a cheap one
  (guarantee 62).
- **No `toLocaleString` anywhere in `daily-report-view.ts`.** Month names and
  thousands grouping are done by hand. This repo has shipped SSR-locale
  hydration bugs twice; the existing `Timestamp` component in
  `inventory-overview.tsx` works around it with a mount flag, and the report
  avoids needing one at all.
- **`latestDayKey` is a prop, not a `new Date()` in render.** A clock read
  inside a component is a hydration mismatch waiting to happen; the page reads
  it once, server-side.
- **The tab column count is a lookup table, not `grid-cols-${n}`.** Tailwind
  scans for literal class names, so an interpolated one compiles to nothing and
  the tab bar silently stacks.
- **A failed report read hides the tab rather than failing the page.** The rest
  of inventory stays usable, and no empty report is shown that would read as a
  day with no trade.

## Phase 2 SHIPPED 2026-07-30 — does the day's revenue cover its stock?

The question the feature was asked for, in the merchant's own words: *"check if
the revenue today is just enough for the inventory that has been deducted."*
COGS was already on screen; this adds the other half of the ratio.

### The blocker was smaller than recorded

The Phase 1c report above states that Convex tenants could not supply revenue.
That was wrong. `convex-template/convex/orders.ts:514`
`getDashboardStatsByPeriod` takes **arbitrary `startDate`/`endDate` epoch
millis**, already excludes cancelled orders, and is **already deployed to every
Convex tenant** because the superadmin analytics fan-out calls it. The Manila
window maps straight onto it. **Phase 2 needed no Convex deploy and no
migration.**

### RED → GREEN

| Cycle | RED | GREEN |
|---|---|---|
| 1 — food cost arithmetic + wording | `ee0d89c` — `Cannot find module '@/lib/inventory/food-cost'`, `Tests: 0 total` | `f523333` — `Tests: 29 passed` (15 new + 14 pre-existing view tests) |
| 2 — revenue read across three backends | `a78a804` — `Cannot find module '@/lib/inventory/daily-revenue-read'`, `Tests: 0 total` | `a2d53aa` — `Tests: 15 passed, 15 total` |
| 3 — the screen | `2f4ea2b` — `Tests: 5 failed, 3 passed, 8 total` | `9022592` — `Tests: 23 passed, 23 total` |

Cycle 3's three passing-at-RED tests were the negative guards (no percentage
when revenue is unknown, no revenue card when the prop is absent). They passed
vacuously against a panel with no revenue support at all, and exist to keep the
feature honest once it had it — the five that failed are the additive ones.

**Validation after GREEN**

```
npx jest --testPathPatterns="inventory"
Test Suites: 1 skipped, 55 passed, 55 of 56 total
Tests:       8 skipped, 584 passed, 592 total
```

`npx eslint` clean on all six changed files. `npx tsc --noEmit | grep '^src/'`
produced no output.

### Guarantees added (75–97)

| # | What is guaranteed | Test | Type |
|---|---|---|---|
| 75 | Food cost is COGS ÷ sales × 100 | `inventory-food-cost.test.ts:divides cost of goods by sales` | unit |
| 76 | The pure function does not pre-round | `…:does not pre-round` | unit |
| 77 | **Unreadable revenue yields `null`, never `0`** | `…:returns null when revenue could not be read at all` | unit |
| 78 | Zero sales yields `null`, not `Infinity`/`∞%` | `…:returns null when the day took no money` | unit |
| 79 | Negative revenue yields `null` | `…:returns null rather than a negative percentage` | unit |
| 80 | A real 0% (sales, no recipes) is still reported as 0 | `…:reports a genuine zero` | unit |
| 81 | Negative COGS (voids > sales) stays visible, unclamped | `…:keeps a negative cost of goods visible` | unit |
| 82–84 | Percentage renders to 1 dp, rounds, keeps its sign | `…formatFoodCostPercent` ×3 | unit |
| 85–88 | The "unreadable" and "no sales" caveats are distinct sentences, absent on a normal day | `…describeRevenueCaveat` ×4 | unit |
| 89 | Platform backend sums the day's order totals | `inventory-daily-revenue-read.test.ts:sums the day's order totals` | unit |
| 90 | The query uses the half-open **Manila** window, not a UTC day | `…:asks for the half-open Manila window` | unit |
| 91 | Cancelled orders are excluded | `…:excludes cancelled orders` | unit |
| 92 | The read is tenant-scoped | `…:scopes to the tenant` | unit |
| 93 | A genuinely empty day returns `0`, distinct from `null` | `…:reports a genuine zero when the day sold nothing` | unit |
| 94 | A query error, an unbuildable client, or a misconfigured tenant project returns `null` | `…` ×3 | unit |
| 95 | A per-tenant-Supabase tenant reads its OWN project, never the platform one | `…:reads the tenant's own project` | unit |
| 96 | Convex is reached via `getDashboardStatsByPeriod` with the window's epoch bounds, routed on the deployment URL alone | `…` ×2 | unit |
| 97 | Convex error, timeout, missing key, or a response without `totalRevenue` all return `null` | `…` ×4 | unit |
| 98 | The screen shows sales and the percentage | `inventory-daily-report-revenue-panel.test.tsx` ×2 | unit |
| 99 | **The screen never prints a percentage when revenue is unknown** | `…:never prints a percentage when the takings could not be read` | unit |
| 100 | The stock figures survive an unreadable revenue | `…:still reports the stock cost when the takings are unknown` | unit |
| 101 | A caller supplying no revenue gets the original three-card report | `…:omits the takings entirely` | unit |

### Decisions worth not re-deriving

- **`null` ≠ `0`, at every layer.** A tenant whose order backend timed out has an
  unknown food cost, not a perfect one. The pure function, the read layer and
  the panel each preserve the distinction; the panel renders an em-dash and a
  sentence, never "0.0%".
- **Three-state revenue prop.** `number` = real money, `null` = tried and
  failed, **absent** = this caller does not deal in revenue. Absent renders the
  original stock-only report, so no existing caller gained an alarming
  "could not be read" notice.
- **The figure is order `total`, deliberately including delivery fees.** That
  makes the percentage slightly optimistic for a delivery-heavy tenant. Accepted
  because every other revenue surface in the product (dashboard, merchant app
  daily stats, superadmin analytics) uses `total` — an inventory screen quoting a
  different "revenue today" than the dashboard is a worse bug, since a merchant
  reconciling two disagreeing figures trusts neither. Revisit only by changing
  all surfaces together.
- **Convex needs no new function.** `getDashboardStatsByPeriod` already takes
  arbitrary epoch bounds. Deploying a new Convex query would have required
  prebundling, bumping `CURRENT_SCHEMA_VERSION`, and every tenant redeploying.
- **The Convex read is time-boxed** (6s default) with the same `withTimeout`
  shape as `convex-platform-aggregator.ts`, so one asleep deployment cannot hang
  an admin page render.
- **The per-tenant-Supabase path mirrors `tenant-order-queue.ts`** — the
  established admin-read pattern for that backend.
- A **test-only bug** cost one cycle: the fake Supabase client was itself a
  thenable, so `async () => client` unwrapped it into the query result before the
  caller ever saw a client. Only the builder returned by `from()` may be
  awaitable, which is also how the real client behaves.

## Phase 3a SHIPPED 2026-07-30 — the verdict, and refusing to give one

Turns the day's figures into a claim. The `inventory_counts` session table
(Phase 3b) is deliberately NOT built — see below.

The measurement is the trade's standard **actual-versus-theoretical (AvT)**:
shrinkage cost as a share of theoretical usage cost. Benchmarks are the
industry's — ≤2% well run, ≤5% worth watching, above 5% worth investigating.
Note this needs **no revenue**, so the verdict survives an unreadable order
backend.

### RED → GREEN

| Cycle | RED | GREEN |
|---|---|---|
| 1 — `judgeVariance` (pure) | `4fbbfb4` — `Cannot find module '@/lib/inventory/variance-verdict'`, `Tests: 0 total` | `bdd9b0c` — `Tests: 14 passed, 14 total` |
| refactor | — | `2860e12` — level computed once; `Tests: 14 passed` |
| 2 — the verdict on screen | `f369fcd` — `Tests: 7 failed, 2 passed, 9 total` | `e97b921` — `Tests: 9 passed, 9 total` |

Cycle 2's two passing-at-RED tests were the back-compat guards (no verdict when
coverage is unknown; figures survive a refusal). They passed vacuously against a
panel with no verdict at all and exist to keep it honest now that it has one.

**Validation after GREEN**

```
npx jest --testPathPatterns="inventory"
Test Suites: 1 skipped, 59 passed, 59 of 60 total
Tests:       8 skipped, 615 passed, 623 total
```

`npx eslint` clean on all four changed files. `npx tsc --noEmit | grep '^src/'`
reported six errors in `src/lib/outlets/supabase-outlet-menu-repository.ts` —
an **untracked file from a concurrent session in this shared working tree**,
present in no commit of this sequence and not touched by this work.

### Guarantees added (102–116)

| # | What is guaranteed | Test | Type |
|---|---|---|---|
| 102 | 1% shortfall grades `good`, and the percentage is variance ÷ usage | `inventory-variance-verdict.test.ts:calls a 1% shortfall well run` | unit |
| 103–104 | 4% grades `watch`, 8% grades `investigate` | `…` ×2 | unit |
| 105 | Exactly 2% is still `good` (top of the "well run" band) | `…:treats exactly 2% as still well run` | unit |
| 106 | Exactly 5% is `watch`, not `investigate` | `…:treats exactly 5% as watch` | unit |
| 107 | A spotless day is graded `good`, not withheld | `…:reports a spotless day as good` | unit |
| 108 | Every verdict carries a non-empty headline and detail | `…:always carries a headline` | unit |
| 109 | **No recipes ⇒ no verdict**, and the detail names recipes | `…:refuses when no dish has a recipe` +1 | unit |
| 110 | **Nothing counted ⇒ no verdict**, and the detail names counting | `…:refuses when nothing was physically counted` +1 | unit |
| 111 | Missing recipes are blamed before a missing count | `…:blames the missing recipes first` | unit |
| 112 | Zero usage ⇒ no verdict (no denominator) | `…:refuses when recipes exist but the day used nothing` | unit |
| 113 | A refusal still explains itself | `…:still explains itself` | unit |
| 114 | The screen states the verdict and its percentage | `inventory-verdict-panel.test.tsx` ×2 | unit |
| 115 | **The screen shows no percentage at all when it refused** | `…:never shows a percentage when it refused to judge` | unit |
| 116 | The day's figures survive a refusal; an unknown coverage omits the verdict entirely; the manager counts only dishes that really have a recipe | `…` ×4 | unit |

### Decisions worth not re-deriving

- **The refusal is the feature.** Guarantees 109–112 exist because a tenant with
  no recipes deducts nothing, so usage is 0, shrinkage is 0, and the day grades
  perfectly *forever*. `brewdazeexpress` is exactly this shape today: inventory
  on, 51 dishes, 0 recipes.
- **Refusals are ordered by depth: recipes → count → usage.** Counting a shelf
  whose usage is never deducted still yields a meaningless comparison, so the
  recipe fault is named first when several apply.
- **An EMPTY `coverageRows` yields `undefined`, not `0`.** The prop defaults to
  `[]`, so passing `0` would let a caller that simply did not supply coverage
  masquerade as the finding "no dish has a recipe" — a missing prop must never
  become a claim about the kitchen.
- **Three-state props throughout**, matching Phase 2's revenue: value / explicit
  "cannot" / absent. Absent renders the earlier report unchanged, which is why
  every pre-existing panel test still passes untouched.
- **Verdict wording lives with the verdict logic**, not in `daily-report-view.ts`
  like the other wording. A grade and its justification are one statement; split
  apart they can drift into contradicting each other.
- **The verdict needs no revenue**, because AvT measures against usage, not
  sales. A tenant whose order backend is unreachable still gets a verdict.
- **The verdict leads the panel**, above the caveats and figures: it is the
  answer, and the numbers are the working.
- `formatFoodCostPercent` now delegates to a general `formatPercent` so the two
  percentages on the screen cannot render differently.

## Phase 4a SHIPPED 2026-07-30 — the merchant app's copy, drift-guarded

The app cannot import the web app's `src/`, so the pure core is **copied** into
`webnegosyo-app/lib/daily-report/`. Copies rot — this repo already carries three
hand-synced copies of the staff-permission registry — and a report that graded a
day differently on the phone than on the web would leave a merchant holding two
verdicts about one day with no way to choose.

So the guardrail is mechanical, not a matter of care: **every ported module must
be textually identical to its web original**, ignoring only `import` lines
(`@/lib/inventory/x` here being `./x`). Five modules are ported:
`business-day`, `daily-report`, `daily-report-view`, `food-cost`,
`variance-verdict`.

### RED → GREEN

| Cycle | RED | GREEN |
|---|---|---|
| 1 — port + parity guardrail | `84cc11c` — compile-time RED, all five modules and `./movement-reason` unresolvable, `Tests: 0 total` | (with cycle 2's port commit) `Tests: 11 passed, 11 total` |
| 2 — the read layer | `e958db4` — `Cannot find module './daily-report-service'`, `Tests: 0 total` | `fb063d0` — `Tests: 8 passed, 8 total` |

**The guardrail was proven to bite.** Changing `GOOD_MAX_PERCENT` from `2` to
`3` in the app copy alone produced:

```
✕ variance-verdict.ts has not drifted from src/lib/inventory
Tests: 1 failed, 10 passed, 11 total
```

The change was reverted and green re-confirmed. A drift guard that cannot fail
is worthless, so this check is part of the evidence rather than an assumption.

**Validation after GREEN**

```
webnegosyo-app$ npx jest
Test Suites: 90 passed, 90 total
Tests:       1469 passed, 1469 total

$ npx jest --testPathPatterns="inventory"     # web, unchanged
Test Suites: 1 skipped, 59 passed, 59 of 60 total
Tests:       8 skipped, 615 passed, 623 total
```

`npx tsc --noEmit -p webnegosyo-app/tsconfig.json` reported nothing under
`lib/daily-report`.

### Guarantees added (117–135)

| # | What is guaranteed | Test | Type |
|---|---|---|---|
| 117–121 | Each of the five ported modules is textually identical to its web original, imports aside | `webnegosyo-app/lib/daily-report/parity.test.ts` (`test.each`) | unit |
| 122 | The app's movement-reason union matches the web ledger's `StockMovementReason` exactly — including `sale` and `void` | `…:covers every reason the web ledger can write` | unit |
| 123–127 | The ported core runs: reconciles a day, grades one, refuses a recipe-less one, omits food cost on unknown takings, uses the Manila day | `…the ported core actually runs` ×5 | unit |
| 128 | The read reconciles through the shared core | `daily-report-service.test.ts:reconciles the day` | unit |
| 129 | It asks for the half-open **Manila** window | `…:asks for the half-open Manila window` | unit |
| 130 | Every one of the three reads is tenant-scoped | `…:scopes every read to the tenant` | unit |
| 131 | An empty tenant returns null **without querying at all** | `…:returns null without querying` | unit |
| 132–133 | An unreadable ledger or ingredient list returns `null`, never an empty report | `…` ×2 | unit |
| 134 | An unreadable unit catalog costs the suffix, not the day's figures | `…:survives an unreadable unit catalog` | unit |
| 135 | A nonsense day returns `null` rather than throwing | `…:returns null rather than throwing` | unit |

### Decisions worth not re-deriving

- **Parity is asserted on the TEXT, not on behaviour.** Behavioural mirroring
  would need the whole web suite duplicated; comparing sources catches drift the
  moment it is written, and the five smoke tests confirm the copies are wired
  rather than merely present.
- **`null`, never an empty report.** An empty report reads as "nothing moved
  today", which on a phone with a poor connection is the most misleading thing
  the screen could say. Same reasoning as `null`-not-`0` in Phase 2.
- **`movement-reason.ts` is app-local and deliberately NOT reused from
  `lib/inventory-movement.ts`**, whose `ManualMovementReason` lists only the
  three a merchant types by hand. A report blind to `sale` and `void` would show
  a day of pure deliveries and grade it immaculate. Guarantee 122 locks it to
  the web ledger.
- **An unreadable unit catalog degrades to a missing suffix**, matching
  `loadInventoryStock` — the numbers matter more than the "g".
- The test mocks `./supabase` at module scope because the real client imports
  `expo-constants`, which this jest setup cannot transform. Established pattern
  from `inventory-service.test.ts`.

## Security C SHIPPED 2026-07-31 — the ledger becomes append-only

The first item taken from the review rather than the phase plan, and taken
*before* Phase 4b deliberately: this one makes the report lie. Putting the same
falsifiable number onto a second surface first would have shipped the flaw
twice.

**The journey.** *As a merchant, I want yesterday's report to still say
yesterday's numbers tomorrow, so that a figure I acted on cannot be rewritten
behind me.*

`20260726120000` created both `stock_movements` policies `FOR ALL`, which
includes DELETE and UPDATE. That matters more than it first looks:
`apply_stock_movement()` is a **BEFORE INSERT** trigger with no counterpart on
the way out. Deleting a movement therefore leaves `inventory_items.current_qty`
exactly where that movement put it while erasing the row that explains it. The
day no longer reconciles — `opening + received − sold − waste ± count` stops
reaching `closing` — and the verdict banner grades the new answer with the same
confidence it gave the old one. An UPDATE is the same wound with better aim.

### RED

`tests/unit/inventory-ledger-append-only.test.ts` replays every migration in
filename order and asserts on the policies still standing at the end. Replaying
rather than reading the newest file is the point: a lockdown a later migration
silently undid would still pass a test that looked at one file.

```
npx jest --testPathPatterns="inventory-ledger-append-only"
● every surviving policy grants only SELECT or INSERT
● someone can still read and write the ledger
    Expected value: "SELECT"
    Received set:   Set {"ALL"}
Tests: 2 failed, 1 passed, 3 total
```

Backed by a **live probe** as a real tenant admin, inside a transaction aborted
on purpose via `RAISE EXCEPTION` so nothing was actually written:

```
PROBE_RESULT rows_deleted=1 (aborted on purpose, nothing was really deleted)
PROBE_RESULT rows_updated=1 (aborted on purpose)
```

Checkpoint: `3f8e05c test: add reproducer for the deletable stock ledger`.

### GREEN

`supabase/migrations/20260807120000_stock_ledger_append_only.sql` replaces the
two `FOR ALL` policies with a `FOR SELECT` and a `FOR INSERT`. Applied to the
live database, then the identical probes re-run:

```
PROBE_RESULT rows_deleted=0 rows_readable=1 (aborted on purpose)
PROBE_RESULT rows_updated=0 rows_inserted=1 (aborted on purpose)

npx jest --testPathPatterns="inventory-ledger-append-only"
Tests: 3 passed, 3 total

npx jest --testPathPatterns="inventory|stock|daily-report"
Test Suites: 1 skipped, 63 passed, 63 of 64 total
Tests: 8 skipped, 649 passed, 657 total
```

Checkpoint: `729ece0 fix: make the stock ledger append-only`.

### Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 136 | No surviving policy on `stock_movements` grants ALL, UPDATE or DELETE, across the whole migration corpus | `inventory-ledger-append-only.test.ts:every surviving policy grants only SELECT or INSERT` | unit | PASS |
| 137 | The lockdown did not simply remove every policy — RLS denies by default, which would make the ledger unusable | `…:the ledger still has policies at all` | unit | PASS |
| 138 | SELECT and INSERT both survive, so the report can read and the register can write | `…:someone can still read and write the ledger` | unit | PASS |

### Decisions worth not re-deriving

- **Only the verbs changed.** The predicate deciding WHO may act is carried over
  byte-for-byte from `20260726120000`. A one-axis change is verifiable by
  reading; bundling a who-change into it would not have been.
- **Inert on apply, and that was checked before applying, not assumed.** Every
  call site in `src/`, `webnegosyo-app/`, `supabase/functions/`, `mobile/`,
  `scripts/` and `convex-template/` is `.insert()` or `.select()` — grep found
  zero DELETE or UPDATE against this table. Order depletion writes through the
  service-role client, which bypasses RLS entirely.
- **The probe is the real evidence; the jest test is the regression guard.** RLS
  lives in the database, so a repo-only assertion could pass against a database
  that had drifted. Both were run.
- **`RAISE EXCEPTION` to force the rollback**, rather than `BEGIN`/`ROLLBACK`.
  The probe deletes production rows if the rollback does not happen, so the
  abort had to be structurally guaranteed rather than trusted to the client.
- **Corrections still work, the accounting way**: write a compensating movement.
  That leaves the mistake and the fix both on the record, which is the property
  the report needs.

## Phase 4b SHIPPED 2026-07-31 — the report reaches the merchant's phone

**The journey.** *As a merchant standing at my shelf before service, I want to
ask my phone whether yesterday's stock went where the orders say it went, so
that I find out what is missing while I can still do something about it.*

Three RED/GREEN cycles.

### Cycle 1 — the wiring guardrail

`webnegosyo-app/lib/daily-report-screen-mount.test.ts`, following
`inventory-screen-mount.test.ts`: jest here only runs pure-logic roots, so the
guardrail asserts on the screen SOURCE. It pins what a unit test of the pure
modules cannot see — tab registration, permission gate, tenant gate, and that
no judgement is re-derived beside the JSX.

```
npx jest lib/daily-report-screen-mount
RED:  ENOENT app/(main)/daily-report.tsx        Tests: 0 total
GREEN:                                          Tests: 20 passed
```

Checkpoints: `50007ca` (RED) → `7a56235` (GREEN).

### Cycle 2 — the recipe count the verdict needs

The verdict refuses to grade a day when no dish has a recipe. The app had no
way to answer that, and passing `undefined` forever would have meant a screen
that never showed a verdict at all.

```
npx jest lib/daily-report-service
RED:  TS2305: Module './daily-report-service' has no exported member
      'countDishesWithRecipe'                   Tests: 0 total
GREEN:                                          Tests: 16 passed (was 8)
```

### Cycle 3 — stepping forward a day

The day control walks day by day. `nextBusinessDayKey` did not exist, and the
parity guard forbids adding it to the app copy alone, so it went into the WEB
module and was mirrored.

```
npx jest --testPathPatterns="inventory-business-day"
RED:  Tests: 5 failed, 15 passed
GREEN: Tests: 20 passed
```

### Validation

```
webnegosyo-app: npx jest        → Test Suites: 92 passed, Tests: 1518 passed
web:  npx jest --testPathPatterns="inventory|stock|daily-report"
                                → 63 passed, 8 skipped, 654 passed / 662
npx tsc --noEmit -p webnegosyo-app/tsconfig.json   → 0 errors
npx eslint src/lib/inventory/business-day.ts …     → clean
```

### Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 139 | The route is registered as a tab and gated through `show()` | `daily-report-screen-mount.test.ts:registers…` / `:gates the tab…` | unit | PASS |
| 140 | The tab belongs to exactly one workspace, and it is Products | `…:belongs to exactly one workspace` / `:sits in Products` | unit | PASS |
| 141 | The tab requires a permission rather than defaulting to allowed | `…:requires a permission rather than defaulting to allowed` | unit | PASS |
| 142 | It rides the same grant as the inventory tab | `…:rides the same grant as the inventory tab` | unit | PASS |
| 143 | The screen reads through the shared service, never inline Supabase | `…:loads through the shared read` | unit | PASS |
| 144 | The screen waits for a tenant before loading | `…:waits for a tenant before loading` | unit | PASS |
| 145 | The verdict comes from `judgeVariance`, never re-derived beside the JSX | `…:takes its verdict from the shared rules` | unit | PASS |
| 146 | Wording and money formatting come from the shared view module; no `toLocaleString` | `…:takes its wording and its money formatting…` | unit | PASS |
| 147 | Verdict renders above caveats, which render above the figures | `…:leads with the verdict` | unit | PASS |
| 148 | A failed read offers a retry rather than an empty day | `…:offers a retry when the read fails` | unit | PASS |
| 149 | Only dishes whose recipe lists an ingredient are counted as covered | `daily-report-service.test.ts:counts only dishes whose recipe actually lists an ingredient` | unit | PASS |
| 150 | A dish with a many-ingredient recipe counts once | `…:counts a dish once even when its recipe lists many ingredients` | unit | PASS |
| 151 | Recipes attached to variation/modifier options are not dishes | `…:ignores recipes attached to something other than a dish` | unit | PASS |
| 152 | No recipes at all reports `0` — a finding the verdict states out loud | `…:reports zero when the tenant has written no recipes` | unit | PASS |
| 153 | An unreadable recipe read reports `undefined`, withholding the verdict | `…:returns undefined when the recipes cannot be read` | unit | PASS |
| 154 | Both recipe reads are tenant-scoped, and neither runs without a tenant | `…:scopes both reads` / `:returns undefined without querying` | unit | PASS |
| 155 | `nextBusinessDayKey` steps across months, years and leap days | `inventory-business-day.test.ts:nextBusinessDayKey…` | unit | PASS |
| 156 | Stepping forward undoes stepping back | `…:undoes previousBusinessDayKey` | unit | PASS |
| 157 | Each row card formats through the shared module and names an uncounted ingredient | `…:daily report row card` (3 tests) | unit | PASS |

### Decisions worth not re-deriving

- **No revenue on the phone, deliberately.** The food-cost percentage needs the
  tenant's order backend — `resolveOrderBackend`, and for some tenants a Convex
  client. The verdict was built in Phase 3a to need no revenue at all, so the
  phone gets an honest subset and the web keeps the percentage. Porting the
  backend router is a separate piece of work, not a detail of this screen.
- **The tab sits in Products, not Insights.** The registry's own rule already
  puts `inventory` there — "the merchant who 86s an item and the merchant who
  reorders its flour are the same person". The report is that shelf reconciled,
  and with no revenue on it, it is not a sales analytic.
- **`daily-report: "menu"` had to be mapped at all.** `TAB_PERMISSIONS` defaults
  an unmapped tab to ALLOWED — the trap its own comments already record for
  `branches`. This report names what went missing and what it cost, so leaving
  it unmapped would have made it the one tab every cashier keeps.
- **`countDishesWithRecipe` returns `undefined`, never `0`, on failure.** `0` is
  the finding "no dish has a recipe", which the verdict says out loud; a dropped
  connection must not make it say that. Same `null`-≠-`0` discipline as Phase 2.
- **A dish counts only if its recipe lists an ingredient**, mirroring
  `hasRecipe: ingredientCount > 0` in the web's `recipe-coverage.ts`. An empty
  recipe deducts nothing — it is a recipe nobody finished.
- **`nextBusinessDayKey` went into the WEB module first.** Adding it to the app
  copy alone would have failed `parity.test.ts`, which is the guard doing its
  job. Both directions go through the epoch so leap days cannot be skipped.
- **The day is resolved once per mount**, not per render: a default derived from
  the clock that rolled over mid-session would silently swap the report the
  merchant was reading.
- **Two failing assertions in cycle 1 were the TEST's bugs, not the code's** —
  `permissions` is an array (a `null` there means owner, not "no grants"), and
  the render-order check was comparing positions in the import list. Both fixed
  in the test; the implementation was correct.

## Phase 3b SHIPPED 2026-07-31 — every hand-typed movement names who typed it

**The journey.** *As a merchant whose report says ₱500 of beef went missing on
Tuesday, I want to know who counted that shelf, so that I can ask them rather
than guess.*

`stock_movements.created_by` has existed since the ledger's first migration
(`20260726120000:41`) and had **zero writers**. Shrinkage is only actionable
against a person and a time; without attribution the report can name a loss but
never begin an investigation.

**Scope note.** The plan called Phase 3b an `inventory_counts` session table.
Attribution is its prerequisite and needs no migration — the column is already
there — so it was taken first and shipped whole. The session table (grouping a
count into one event, so a half-finished count is visible as half-finished) is
NOT built and remains open.

### RED → GREEN

```
npx jest --testPathPatterns="inventory-movement-attribution"
RED:   5 failed — created_by is `undefined` on every insert
GREEN: 5 passed

npx jest --testPathPatterns="inventory-activity-feed"
RED:   5 failed, 8 passed        GREEN: 13 passed

npx jest --testPathPatterns="inventory-overview-layout"
RED:   1 failed, 7 passed        GREEN: 8 passed

npx jest --testPathPatterns="inventory|stock"
  Test Suites: 1 skipped, 64 passed / 65   Tests: 8 skipped, 666 passed / 674
npx tsc --noEmit / npx eslint             → clean
```

Checkpoints: `660f1eb` (RED, write path) → `b5316a4` (GREEN, all three layers),
with the feed reproducer at the commit between them.

### Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 158 | A hand-entered movement is stamped with the acting user | `inventory-movement-attribution.test.ts:stamps the acting user` | unit | PASS |
| 159 | A movement written with no session stays anonymous | `…:leaves the movement anonymous` | unit | PASS |
| 160 | An identity lookup that errors still records the stock | `…:still records the stock when the identity lookup errors` | unit | PASS |
| 161 | An identity lookup that throws still records the stock | `…:still records the stock when the identity lookup throws` | unit | PASS |
| 162 | Deliveries are attributed as readily as counts | `…:attributes a delivery as readily as a count` | unit | PASS |
| 163 | The feed names the person behind a manual movement | `inventory-activity-feed.test.ts:names the person who entered` | unit | PASS |
| 164 | An order-driven movement is never attributed | `…:leaves an automatic movement unattributed` | unit | PASS |
| 165 | A pre-attribution row still renders, unnamed | `…:leaves the entry unattributed when the movement names nobody` | unit | PASS |
| 166 | A departed staff member costs the entry a name, not the entry | `…:when the person is no longer on the roster` | unit | PASS |
| 167 | Callers that do not deal in actors keep working (`actorName` optional) | `…:still builds a feed for a caller that does not deal in actors` | unit | PASS |
| 168 | The merchant sees the name in the activity feed | `inventory-overview-layout.test.tsx:names the person who entered` | unit | PASS |
| 169 | Unattributed entries show nothing, never "Unknown" | `…:says nothing at all when the movement names nobody` | unit | PASS |

### Decisions worth not re-deriving

- **Attribution is secondary to the count.** `resolveActingUserId` never throws
  and never blocks the insert. Refusing to record a stocktake because the
  identity lookup failed would trade a gap in the audit trail for a wrong
  quantity on the shelf — the worse of the two.
- **Order-driven movements stay anonymous, checked explicitly.** `sale` and
  `void` are written by the pipeline; `resolveActorName` returns null whenever
  `order_id` is set, even if a `created_by` somehow reached the row. Naming an
  actor there puts a person against a row nobody typed.
- **Unattributed renders NOTHING, not "Unknown".** Every row written before this
  phase has a null `created_by`. An "Unknown" label on all of them reads as a
  system that lost the name rather than one that never recorded it.
- **`actorName` is an OPTIONAL context function**, so every existing caller of
  `buildActivityFeed` kept working untouched — the same three-state discipline
  used for the report's revenue prop.
- **`display_name || email || null`.** An email is a poor label but a true one;
  a blank string would render as an entry claiming nobody entered it.
- **An unreadable roster costs names, not the feed** — the same degradation as
  the unit catalog in the daily report read.

## Security D SHIPPED 2026-07-31 — a staff grant now holds at the API door

**The journey.** *As an owner, I want only the people I gave stock duties to be
able to change my stock, so that a cashier's account cannot rewrite my shelf.*

`POST /api/inventory/movement` authorized on ROLE alone —
`role === 'admin' && tenant_id === tenantId`. But every staff member of a tenant
is `role='admin'` in this codebase (the deliberate choice from the staff work: a
new role string would have had to be taught to every existing admin check), and
per-feature reach lives in `app_users.permissions`.

So a cashier holding only `pos` passed. The web sidebar hides inventory from
them and the merchant app does not register the tab — but **neither is a
boundary**, and this route is reachable with the token the app already holds. A
stocktake from that caller rewrites the shelf figure and surfaces in the daily
report as someone else's shrinkage.

### RED → GREEN

```
npx jest --testPathPatterns="inventory-movement-authz"
RED:   1 failed, 6 passed — the cashier got 200 and the movement was recorded
       (Expected: 403, Received: 200)
GREEN: 7 passed

npx jest --testPathPatterns="inventory|stock"
  Test Suites: 1 skipped, 66 passed / 67   Tests: 8 skipped, 693 passed / 701
npx tsc --noEmit / npx eslint  → clean
```

The six passing tests at RED matter as much as the failing one: they show the
pre-existing boundaries (other tenant, no `app_users` row) already worked, so
exactly one was missing.

Checkpoints: `a7d3655` (RED) → `d143862` (GREEN).

### Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 170 | A staff member without the `menu` grant is refused, and nothing is written | `api/inventory-movement-authz.test.ts:refuses a staff member who does not hold the menu grant` | integration | PASS |
| 171 | A staff member holding `menu` is admitted | `…:admits a staff member who holds the menu grant` | integration | PASS |
| 172 | An owner is admitted regardless of the grants on their row | `…:admits the owner` | integration | PASS |
| 173 | A legacy admin with `permissions: null` keeps full access | `…:admits a legacy admin whose permissions were never set` | integration | PASS |
| 174 | A superadmin is admitted | `…:admits a superadmin` | integration | PASS |
| 175 | An admin of another tenant is still refused | `…:still refuses an admin of another tenant` | integration | PASS |
| 176 | A caller with no `app_users` row is refused | `…:refuses a caller with no app_users row at all` | integration | PASS |

### Decisions worth not re-deriving

- **`permissions: null` still means full access.** It predates staff management;
  reading it as "no grants" would lock every pre-existing merchant out of their
  own inventory. Guarantee 173 exists solely to pin that.
- **`menu` was chosen because the UI already uses it** — the web sidebar entry
  and the app's inventory tab both gate on it. The door and the UI now agree
  rather than merely appearing to.
- **`/api/inventory/order-stock` was examined and deliberately NOT changed.**
  The review lists it alongside this one, but it is the register's path: it runs
  when a cashier rings up or cancels a sale, so `menu` would be the wrong key
  and requiring it would break the POS mid-service. Guessing at the right grant
  (`pos`? `orders`? both?) and getting it wrong is a worse outcome than the
  current state, where the caller must still be an authenticated staff member of
  that tenant and the effect is bounded to one order's own lines by the
  `order_stock_applications` claim. It needs the caller set established first,
  not a speculative edit.

## Security E SHIPPED 2026-07-31 — a stocktake no longer swallows a sale

**The journey.** *As a merchant, I want the shelf to end up holding what I
counted, so that the one number I measured by hand is the one the system keeps.*

`resolveMovementDelta` computes a stocktake as `counted − currentQty`, where
`currentQty` came from a SELECT earlier in the same request. Anything landing in
that gap is absorbed silently.

This is worse than an ordinary lost update. A stocktake exists to be the
authority on what is physically there, so the single movement that must never be
wrong was the one that quietly was — and the merchant is standing in front of
the shelf that disagrees with the screen.

### RED

A live probe, in a transaction aborted on purpose:

```
PROBE_RESULT counted=900 shelf_ended_at=850 lost=50 (aborted on purpose)
```

And at the repo level:

```
npx jest --testPathPatterns="inventory-stock-cost-unit"
RED: 1 failed, 7 passed — no target_qty is sent for a stocktake
```

Checkpoint: `ccc199c`.

### GREEN

`20260807130000_stocktake_resolved_at_insert.sql` adds `target_qty` and moves
the subtraction inside the row lock the trigger already takes. The original
migration's own comment claimed movements "serialize on the item row rather than
racing through a read-modify-write in application code" — true for every reason
EXCEPT the one computing its delta from a prior read.

Applied, then the identical interleaving re-probed, plus the guard rails:

```
PROBE_RESULT counted=900 shelf_ended_at=900 lost=0 stored_delta=930
PROBE_RESULT receive_with_target_rejected=t legacy_stocktake_delta=7

npx jest --testPathPatterns="inventory|stock"
  Test Suites: 1 skipped, 68 passed / 69   Tests: 8 skipped, 721 passed / 729
```

Checkpoint: `8d33b09`.

### Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 177 | A stocktake sends the counted quantity in stock units | `inventory-stock-cost-unit.test.ts:sends the counted quantity in stock units` | unit | PASS |
| 178 | A delivery carries no target, so it stays relative | `…:leaves a delivery with no target` | unit | PASS |
| 179 | Waste carries no target | `…:leaves waste with no target` | unit | PASS |
| 180 | A concurrent sale is no longer swallowed by a stocktake | live probe, GREEN above | db | PASS |
| 181 | A relative movement carrying a target is rejected | live probe (`check_violation`) | db | PASS |
| 182 | A stocktake with no target still applies the old way | live probe (`legacy_stocktake_delta=7`) | db | PASS |

### Decisions worth not re-deriving

- **The trigger OVERWRITES `quantity_delta` rather than rejecting it.** A client
  that has not shipped the `target_qty` change keeps working with the old (racy)
  behaviour instead of failing outright — which matters because the web and the
  merchant app deploy separately.
- **Only `stocktake` may carry a target**, enforced by CHECK. A delivery is a
  RELATIVE movement; letting it state an absolute would make two deliveries in a
  row overwrite each other instead of accumulating.
- **`quantity_delta` keeps its exact meaning** — the signed change actually
  applied — so `balance_after`, the daily report, and every existing reader are
  untouched. Only its *provenance* changed.
- **`FOR UPDATE` on the read inside the trigger** is what makes it atomic; the
  subsequent UPDATE alone would not have been enough, since the delta has to be
  computed from the locked value.

## Fix F SHIPPED 2026-07-31 — branch transfers stop breaking the row's arithmetic

**The journey.** *As a merchant, I want the figures on a row to add up to the
closing balance, so that I can check the report by eye instead of taking it on
faith.*

`transfer_out` and `transfer_in` were added to `StockMovementReason` by the
branch-transfer work AFTER this report was built. They fell through the report's
reason switch entirely and landed in no bucket — while `opening` and `closing`
are read from `balance_after`, which the trigger moved for them like any other
movement. The identity the whole report rests on silently stopped holding, with
nothing on screen to explain the difference.

**How it surfaced.** Not by review — the Phase 4a parity guard failed on the
other session's change, which is what drew attention to the new reasons at all.
That is the drift guard doing its job on a change it did not anticipate.

### RED → GREEN

```
npx jest --testPathPatterns="inventory-daily-report"
RED:   3 failed, 58 passed — row.transferred undefined, identity evaluates to NaN
GREEN: 61 passed

npx jest --testPathPatterns="inventory-daily-report-panel"
RED:   2 failed, 12 passed — no transfer badge rendered
GREEN: 14 passed

npx jest lib/daily-report-screen-mount   (merchant app)
RED:   1 failed, 20 passed        GREEN: 21 passed

web:  npx jest --testPathPatterns="inventory|stock"  → 71 passed / 72, 755 passed
app:  npx jest                                        → 96 suites, 1588 passed
npx tsc --noEmit -p webnegosyo-app/tsconfig.json      → 0 errors
```

Checkpoints: `498bb8b` (RED) → `449e780` (GREEN).

### Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 183 | A transferred-out day still reconciles to closing | `inventory-daily-report.test.ts:still reconciles when stock is transferred out` | unit | PASS |
| 184 | A transferred-in day still reconciles to closing | `…:still reconciles when stock is transferred in` | unit | PASS |
| 185 | Out and in net against each other | `…:nets a transfer out against a transfer in` | unit | PASS |
| 186 | A transfer is never usage, waste or shrinkage, and never enters COGS | `…:never counts a transfer as usage, waste or shrinkage` | unit | PASS |
| 187 | A transfer-only day still appears on the report | `…:reports a transfer-only day rather than hiding it` | unit | PASS |
| 188 | The web panel names stock sent out / received in | `inventory-daily-report-panel.test.tsx:names stock that left / arrived` | unit | PASS |
| 189 | No transfer badge on a day with none | `…:says nothing on a day with no transfers` | unit | PASS |
| 190 | The app card names transfers too | `daily-report-screen-mount.test.ts:names stock moved to or from another branch` | unit | PASS |

### Decisions worth not re-deriving

- **Transfers get their OWN bucket.** Folding them into usage would make a
  branch that supplies the others look like it is haemorrhaging stock; folding
  them into shrinkage would accuse someone of losing what is sitting on another
  shelf.
- **Kept SIGNED, unlike `sold` and `waste`.** Out and in genuinely cancel: a
  branch that sent 200 and received 50 moved 150 net, and reporting two
  magnitudes would obscure that.
- **Displayed only when non-zero**, on both surfaces. A permanent column of
  zeros would cost every single-branch tenant a column to describe something
  that never happens to them — but an unexplained gap on a stock report invites
  exactly the wrong conclusion, so when it does happen it is named.
- **Named in the app card's accessibility sentence too**, since the closing
  balance moves either way and a spoken row must still account for itself.
- **Two testing traps hit and worth avoiding:** `getByText(/moved/i)` collided
  with the existing caveat "1 ingredient moved today…", so the assertion moved
  to a `data-testid`; and a python-patched test insert silently no-opped on a
  quote-style mismatch, producing a "passing" test that had never been added —
  caught only because a RED that passes immediately is not a RED.

## Still not built

**The food-cost percentage on the phone.** The web report shows it; the app
report does not. Needs `getDailyRevenue`'s backend routing ported, including a
Convex client. Until then the two surfaces answer slightly different questions.
The phone claims nothing about revenue — it shows stock figures and a verdict
that never depended on revenue — so nothing on it is misleading, but a merchant
who uses both will notice the web has a number the phone does not.

**The `inventory_counts` session table.** Still NOT built. Attribution (above)
answered "who counted this", which was the urgent half. The session table
answers a different question: which ingredients belonged to ONE count, so a
half-finished count is visible as half-finished rather than as a shelf where
most things happened to match.

**Known gap:** `page.tsx` wiring remains un-unit-tested (async server
component), matching the Phase 1c precedent — the passthrough is covered at the
`InventoryManager` level instead.

**Deliberately out of scope:** per-branch inventory. `inventory_items` and
`stock_movements` have no `outlet_id`, so a multi-branch tenant gets one merged
shelf — while revenue CAN be branch-scoped. Any future per-branch report must fix
the ledger first, or the two halves of the ratio describe different shops.

**Still open from the review:** `current_qty` has no non-negative CHECK — and
deliberately so for now: stock legitimately goes negative when a sale lands
before its delivery is recorded, which `movingAverageUnitCost` already handles
explicitly, so a blanket CHECK would reject real movements.
(The `FOR ALL` RLS hole is closed — Security C. The movement route's role-only
authorization is closed — Security D. The stocktake race is closed —
Security E. `/api/inventory/order-stock` is examined and deliberately
unchanged; see Security D's last note.)

**RESOLVED 2026-07-31:** the `target_qty` change in
`src/lib/inventory/stock-service.ts` was left unstaged because another session's
in-flight branch-scope work occupied that file. It landed in `b426287`
("record a manual stock movement against its branch") when that session
committed, and guarantee 177 now passes at `HEAD` (730 passed / 69 suites).
Both halves of Security E are therefore live: the trigger resolves the count,
and the app sends one.

**Not deployed.** The branch is ~540 commits ahead of `origin/main` with no
upstream, so none of this — Phase 0's correctness fixes included — is in front
of a merchant. The append-only migration is the exception: it is live on the
database now, because RLS is not shipped by deploying the app.

---

## Phase 4c — the food cost percentage on the phone (2026-07-31)

**Journeys.** As an owner I want the day's food cost percentage on my phone, so
I know whether the takings covered the stock they consumed — the question the
whole report was originally asked for. As a branch manager I want that figure
*withheld* rather than computed from mismatched scopes.

**What made this tractable.** Not a ported backend router. The merchant app
addresses its order backend by STRING REF, so `orders:getDashboardStatsByPeriod`
is served by Convex or by the platform Supabase adapter with the screen knowing
neither. The web's `daily-revenue-read.ts` — `resolveOrderBackend`, a Convex
server client, a timeout — has no counterpart here and needed none.

**The scope mismatch, now mitigated.** The note above ("any future per-branch
report must fix the ledger first, or the two halves of the ratio describe
different shops") is exactly what this unit had to handle. `loadDailyReport`
reads `stock_movements` store-wide; `useSafeQuery` narrows orders to the branch
the ACCOUNT is confined to. Dividing one by the other yields a food cost
percentage inflated by roughly the branch count — which reads as a costing
emergency and is purely an artefact of two scopes. A branch-scoped account is
therefore shown NOTHING, and the query is skipped rather than merely ignored.
This is a mitigation, not a fix: the ledger is still store-wide. Making
`stock_movements.outlet_id` (added by `20260808120000`) part of the report read
is what would actually let a branch manager see this figure.

| Stage | Commit | Evidence |
|---|---|---|
| RED | `2fb3dce` | `TS2307: Cannot find module './daily-report-revenue'` — 1 suite failed, 96 passed |
| GREEN | `cb52ac4` | 97 suites, 1596 passed |
| RED | (folded) | screen guardrails: 5 failed, 22 passed |
| GREEN | `71660a7` | 97 suites, 1602 passed; `tsc` exit 0; eslint exit 0 |

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 191 | The takings are reported when the account sees the whole store | `daily-report-revenue.test.ts` | unit | PASS |
| 192 | A genuinely empty day passes through as `0`, not as unknown | `daily-report-revenue.test.ts` | unit | PASS |
| 193 | Nothing is stated while the query is still in flight | `daily-report-revenue.test.ts` | unit | PASS |
| 194 | A settled query with no figure reports unknown | `daily-report-revenue.test.ts` | unit | PASS |
| 195 | A backend answering without `totalRevenue` reports unknown | `daily-report-revenue.test.ts` | unit | PASS |
| 196 | A branch-scoped account is told nothing at all | `daily-report-revenue.test.ts` | unit | PASS |
| 197 | "Not comparable" outranks "not readable" for a branch account | `daily-report-revenue.test.ts` | unit | PASS |
| 198 | A negative total is rejected rather than rendered | `daily-report-revenue.test.ts` | unit | PASS |
| 199 | The screen reads takings through the shared string ref | `daily-report-screen-mount.test.ts` | guardrail | PASS |
| 200 | Takings use the SAME Manila window as the ledger | `daily-report-screen-mount.test.ts` | guardrail | PASS |
| 201 | The screen defers the decision instead of dividing inline | `daily-report-screen-mount.test.ts` | guardrail | PASS |
| 202 | The percentage comes from the parity-guarded core | `daily-report-screen-mount.test.ts` | guardrail | PASS |
| 203 | A withheld figure is explained, not left blank | `daily-report-screen-mount.test.ts` | guardrail | PASS |
| 204 | No `revenue ?? 0` can turn an unreadable day into a perfect one | `daily-report-screen-mount.test.ts` | guardrail | PASS |

**Honest note on 204.** It passed the moment it was written — there was no `?? 0`
to remove. It is a regression guard, not evidence of a bug fixed. The other
five screen guarantees were genuinely RED.

**Decisions worth not re-deriving.**
- The three-state contract (`undefined` = this caller does not deal in revenue /
  `null` = unknown / number = the takings) is the web panel's vocabulary,
  reused verbatim so the two surfaces cannot drift in what they mean by a
  missing figure.
- Loading returns `undefined`, not `null`. `null` renders "sales could not be
  read", which would flash on every cold mount and be a lie about a slow query.
- The branch check runs FIRST, ahead of the failure cases, so a branch manager
  is never told the sales "could not be read" — which would imply the figure
  would otherwise have been theirs.
- `resolveReportRevenue` lives OUTSIDE `lib/daily-report/` and is absent from
  `PORTED_MODULES`. It is app-only by nature: it encodes a mismatch that exists
  because of how the app scopes its queries, and has no web original to match.

---

## Phase 3b (second half) SHIPPED 2026-07-31 — a count becomes one act

**Journeys.** As an owner I want a stock count that stopped halfway to *look*
half-finished, so I do not read a shelf nobody examined as a clean shelf. As a
merchant I want to be told which ingredients a count never reached, in
ingredients rather than in percent, so I know where to go and look.

**The gap this closes.** Attribution (Phase 3b, first half) answered "who
counted this". The ledger still could not say where a count STOPPED, and that
omission has one specific cost: an ingredient nobody looked at and an ingredient
that reconciled perfectly produce the identical row — no discrepancy, no
shrinkage, nothing to answer for. A count abandoned at the fourth shelf
therefore read as a spotless store.

### RED → GREEN

| Cycle | Stage | Commit | Evidence |
|---|---|---|---|
| 1 — the judgement | RED | `972175d` | `Cannot find module '@/lib/inventory/count-session'` (1 suite failed, 0 tests run) |
| 1 | GREEN | `ebfbbb9` | `15 passed / 1 suite` |
| 2 — the schema | applied + probed | `9909336` | 8 live probes, all rolled back (below) |
| 3 — the report says it | RED | `e698d18` | `2 failed, 17 passed (19 total)` |
| 3 | GREEN | `a1f2e60` | `19 passed`; app suite `97 suites / 1603 passed` |

### Schema probes (live, all rolled back)

| # | Probe | Result |
|---|---|---|
| 1 | an open count can be created | OK |
| 2 | a second open count on the same shelf | REJECTED (unique index) |
| 3 | `status='closed'` with no `closed_at` | REJECTED (check) |
| 4 | negative `expected_item_count` | REJECTED (check) |
| 5 | a count opened against another store's branch | REJECTED (trigger) |
| 6 | a `receive` filed under a count session | REJECTED — *"Only a stocktake may belong to a count session"* |
| 7 | a `stocktake` filed under its own session | ACCEPTED |
| 8 | a `stocktake` naming another store's session | REJECTED (trigger) |

Residue check after the probes: `0` sessions, `0` linked movements.

### Guarantees added (205–223)

`tests/unit/inventory-count-session.test.ts` — 19 unit guarantees:

| # | What is guaranteed |
|---|---|
| 205 | A count still running is `open`, not `partial` — nothing is missing until someone claims to be finished |
| 206 | A closed count that reached every ingredient is `complete`, coverage 100 |
| 207 | A closed count that stopped halfway is `partial`, and reports 4 of 40 |
| 208 | A count closed with nothing counted is `abandoned`, not merely small |
| 209 | Recounting one sack three times is one ingredient, not three |
| 210 | 0 of 0 yields a `null` coverage figure, never a flattering 100% |
| 211 | An ingredient added mid-count cannot push coverage past 100% |
| 212 | Coverage rounds DOWN, so 299 of 300 reads 99% and never "finished" |
| 213 | An uncounted ingredient's silence counts as evidence only after a complete count |
| 214 | An open count never counts as accounting for the shelf |
| 215 | A corrupt negative snapshot costs the coverage figure, not the report |
| 216 | Partial wording names ingredients ("4 of 40"), not a percentage |
| 217 | Partial wording says outright that the rest were not counted |
| 218 | A complete count produces no caveat at all |
| 219 | A running count is described as running, not warned about |
| 220 | The count caveat renders ABOVE the ingredients it left unexplained |
| 221 | A complete count adds nothing to the caveat list |
| 222 | A day with no session behaves exactly as before — no invented "abandoned count" |
| 223 | A partial count is named even when nothing else was wrong that day |

### Decisions worth not re-deriving

**`expected_item_count` is a SNAPSHOT, not a live count.** Recomputing the
denominator at read time rewrites history: an ingredient added next month would
quietly demote last month's finished count to a partial one. The column is
written once, when the count opens.

**Coverage rounds down, and `0 of 0` is `null`.** 299 of 300 is 99.67%, and
rounding that to "100%" on a shelf with an uncounted ingredient is precisely the
reassurance this whole unit exists to withhold. `0 of 0` is arithmetically 100%
and factually meaningless — a store with nothing to count has not achieved a
perfect count.

**`abandoned` is a separate state from `partial`.** Closed-with-nothing-counted
says something different about the shift than closed-early, and collapsing them
would lose it.

**Guarantee 222 is the compatibility guarantee.** `countSession` is an optional
parameter, and omitting it is correct for every day before this table existed
and every tenant who counts without opening a session. An absent session must
never be read as an abandoned one — that would accuse a merchant of a count they
never started.

**Guarantee 223 is why the session caveat cannot be folded into
`uncountedCount`.** That figure only covers ingredients that MOVED today, so a
count which skipped the entire dry store would otherwise leave the report with
nothing at all to say.

**Honest note on the RED for cycle 3.** Only 2 of the 4 new caveat tests failed.
The other two (221, 222) passed immediately, because an extra argument to
`describeReportCaveats` was simply ignored at runtime. They are regression
guards, not evidence of a defect fixed.

**The import in `daily-report-view.ts` is deliberately on one line.** The app's
parity guard strips whole `import` lines; a wrapped import would leave its
continuation lines behind and read as drift between two identical files.

### Still not built for this unit

The **write path**. Nothing opens, attaches to, or closes a session yet:
`inventory_count_id` is written by no code, so in production every session
reader will find nothing and the report behaves exactly as it did before
(guarantee 222). The schema, the judgement, and both report surfaces are ready;
the service and the count screen are not.

The **read wiring**. `daily-report-read.ts` does not yet load the day's session,
so `describeReportCaveats` is still called with one argument everywhere.

---

# Count sessions, part two — the write path and the read wiring

**SHIPPED 2026-07-31.** Source: the inline plan produced by `/ecc:plan` earlier
this session (Tasks A and B). No `*.plan.md` artefact was written; the plan was
conversational and is reproduced in the task table below.

The previous unit built the `inventory_counts` schema and the pure judgement,
and closed with an honest admission: **nothing wrote to it.** `inventory_count_id`
was written by no code, so in production every reader found nothing and the
report behaved exactly as before. This unit closes that loop.

## User journeys

- As a merchant, I want to start a stock count and have my entries belong to it,
  so that the report can tell a finished count from one that stopped at the
  fourth shelf.
- As a merchant with two people counting, I want the second person to join the
  count already running rather than open a rival one, so that one shelf produces
  one document.
- As a merchant, I want the day's report to say the count stopped early, so that
  I do not read a shelf nobody looked at as a shelf that reconciled.
- As a merchant using both the phone and the web, I want one verdict about one
  day, so that I never have two accounts of the same shelf and no way to choose.

## The gap this closes

A count with no movements attached reads as `abandoned` however thoroughly it
was performed — which is a *different* lie from the one sessions were built to
stop, but a lie all the same. The session table and the ledger had to point at
each other before either was worth anything.

## RED → GREEN

| Cycle | RED commit | RED evidence | GREEN commit |
|---|---|---|---|
| Service (open/join/close) | `85fe05c` | compile-time: `Cannot find module '../../src/lib/inventory/count-session-service'` — 1 suite failed, 0 tests run | `bf45e0c` (32 passed) |
| Ledger attachment | `76ac0f3` | runtime: **3 failed**, 3 passed | `c6fc66e` (6 passed) |
| Report read wiring (web) | `f92422b` | runtime: **5 failed**, 6 passed | `e31a301` |
| Panel caveat (web) | `5ca7510` | runtime: **1 failed**, 15 passed | `e31a301` |
| Report read wiring (phone) | `138761d` | compile-time: `TS2339: Property 'countSession' does not exist on type 'DailyReportForDay'` ×5 | `e31a301` (20 passed) |
| Server actions | `6d5634b` | compile-time: `Cannot find module '@/app/actions/inventory-counts'` | `1c07eb0` (45 passed) |

## Guarantees

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 224 | A count captures its denominator when it OPENS, never recomputed | `inventory-count-session-service:captures how many ingredients were in scope` | PASS |
| 225 | A retired ingredient is outside the denominator, so a complete count is not permanently partial | `…:leaves a retired ingredient out of the denominator` | PASS |
| 226 | A count opens with no closing timestamp, so nothing reads it as finished | `…:opens with no closing timestamp` | PASS |
| 227 | A count is filed under a Manila business day, so a 23:40→00:20 count is one count | `…:files the count under a Manila business day` | PASS |
| 228 | Opening a count on another branch is refused and writes nothing | `…:refuses to open a count on another branch` | PASS |
| 229 | A second opener JOINS the running count rather than starting a rival, and the original denominator survives | `…:joins the count already running on this shelf` | PASS |
| 230 | Closing writes status and timestamp together | `…:writes the status and the timestamp together` | PASS |
| 231 | A closed count cannot be re-closed, so `closed_at` cannot move | `…:refuses to close a count that is already closed` | PASS |
| 232 | Progress is judged from the movements filed under the session | `…:judges progress from the movements filed under the session` | PASS |
| 233 | A recounted ingredient counts once | `…:counts a recounted ingredient once` | PASS |
| 234 | A count belonging to another store reads as nothing | `…:returns nothing for a count this store does not own` | PASS |
| 235 | A stocktake carries its session id onto the ledger row | `inventory-count-attach:carries the session id onto the ledger row` | PASS |
| 236 | A movement with no session writes null — every pre-session caller untouched | `…:records no session when the count was a one-off` | PASS |
| 237 | A delivery or waste naming a session is refused in words, before the database says so | `…:refuses a delivery/waste that names a count session` | PASS |
| 238 | A movement naming no count is never rejected, for any reason | `…:leaves every movement that names no count alone` | PASS |
| 239 | The web report reports how far the day's count got | `inventory-daily-report-read:reports how far the day's count actually got` | PASS |
| 240 | A stocktake belonging to no session is not credited to the count | `…:ignores a stocktake that belonged to no session` | PASS |
| 241 | A day nobody counted yields `null`, never an invented abandoned count | `…:says nothing about a day nobody counted` | PASS |
| 242 | The session read is scoped to the tenant AND the day | `…:scopes the session read to the tenant and the day` | PASS |
| 243 | The web panel names the unfinished count above the ingredients it left uncounted | `inventory-daily-report-panel:names how far the count got` | PASS |
| 244 | The phone reaches the same verdict as the web | `daily-report-service:the day's count session` (4 tests) | PASS |
| 245 | A failed session read costs the caveat, not the day's figures | `…:keeps the day's figures when the session read fails` | PASS |
| 246 | The actions take the tenant from the server argument, never from client input | `inventory-count-actions:takes the tenant from the server argument` | PASS |
| 247 | A refusal returns as a readable message, not an unhandled throw | `…:hands back a refusal as words`, `…:explains a double close` | PASS |
| 248 | The store pool (`null` branch) is a real shelf, not a missing one | `…:treats the store pool as a real shelf` | PASS |

## Decisions worth not re-deriving

**Joining, not refusing.** Two people tapping "start count" within a minute are
counting one shelf. Two open sessions would each report partial coverage of a
shelf that was actually counted twice over. The partial unique index enforces
this at the database; `openCount` makes the common case pleasant instead of an
error.

**The counted ingredients come from the movements already read**, not a second
query. `daily-report-read` had them in hand; filtering by `inventory_count_id`
costs one pass over an array instead of a round trip.

**A stocktake with no session is deliberately not credited.** A one-off
correction made during a count is not part of the count, and crediting it would
raise coverage for an ingredient nobody counted.

**Validation is duplicated between zod and the trigger on purpose.** The zod
rule can be bypassed by any other writer; the trigger cannot explain itself to a
merchant. Neither is redundant.

**A failed session read yields `null` rather than throwing.** The stock figures
are independently true. Losing the whole report because its caveat could not be
computed is the worse trade.

## Honest notes on evidence quality

- The ledger-attachment cycle was **3 of 6 genuinely RED**. The other three
  passed immediately because zod strips unknown keys, so a movement naming no
  count already behaved correctly. They are recorded as regression guards, not
  as defects fixed.
- The panel cycle was **1 of 2 genuinely RED**; the "complete count adds nothing"
  case passed trivially because that fixture renders no caveats at all.
- One assertion was **mutation-tested**: deleting `.eq('is_active', true)` from
  `countIngredientsInScope` makes guarantee 225 fail, and restoring it makes it
  pass. The row-count assertion alone would NOT have caught the deletion — the
  stub decides how many rows come back — so the filter assertion was added
  specifically to hold the rule.

## Validation

```
npx jest                        → 361 passed, 1 skipped, 4480 tests (web)
cd webnegosyo-app && npx jest   → 97 suites, 1607 passed (incl. parity guard)
npx tsc --noEmit                → clean for every file in this unit
npx eslint <changed files>      → clean
```

`src/types/supabase.ts` gained the `inventory_counts` table and
`stock_movements.inventory_count_id` by hand, matching the generated shape. An
earlier attempt used a regex broad enough to add the column to every table with
an `inventory_item_id`; it was reverted and redone as three explicit edits, and
the file now contains exactly three occurrences (Row, Insert, Update).

## Still not built

**The count screen.** The service and the actions exist and are tested; nothing
renders them. A merchant cannot yet open a count from the UI, so in production
`inventory_count_id` is still written by nobody and the report still behaves
exactly as it did before. This is the same honest caveat as the previous unit,
moved one layer up: the seam is now reachable from a component rather than
absent entirely.

**Branch-aware ledger read** (plan Task C). `daily-report-read.ts` still reads
`stock_movements` store-wide despite `outlet_id` existing since `20260808120000`.
Until that is fixed the branch food-cost % stays withheld, because revenue can
be branch-scoped and stock cannot — the two halves of the ratio would describe
different shops.

**Food cost % on the phone** (plan Task D). Unchanged.

**`current_qty` non-negative CHECK.** Recommended AGAINST, and this stands:
stock legitimately goes negative when a sale lands before its delivery is
recorded, which `movingAverageUnitCost` already handles explicitly. If wanted it
belongs on the alerts surface as a warning, not in the schema.

---

# The count screen — the feature becomes reachable

**SHIPPED 2026-07-31.** Journeys derived during this TDD run, continuing the
inline plan's Task A (the count screen, explicitly deferred from the previous
unit).

Everything beneath this was correct and invisible. The schema, the judgement,
the service and the actions all existed and nothing rendered them, so in
production `inventory_count_id` was written by nobody. This unit closes that.

## User journeys

- As a merchant, I want to start a stock count from the ingredients screen, so
  that the entries I am about to make belong to one count.
- As a merchant mid-count, I want my counts filed under it **without being asked
  to tag each one**, so that a busy shift does not leave the count reading as
  half-finished.
- As a merchant about to finish early, I want to be told what that leaves
  unaccounted for, so that I decide it deliberately rather than discover it in
  next week's report.

## RED → GREEN

| Cycle | RED commit | RED evidence | GREEN commit |
|---|---|---|---|
| Form seam | `aa51170` | runtime: **1 failed**, 15 passed | `bb9706c` |
| Panel copy (pure) | `dc77f8e` | compile-time: `Cannot find module '@/lib/inventory/count-panel'` | `4b36c2c` (11 passed) |
| Panel component | `86cb905` | compile-time: `Cannot find module '@/components/admin/stock-count-panel'` | `7177513` (10 passed) |
| Screen wiring | `1873fb9` | runtime: **3 failed**, 1 passed | `967c263` (4 passed) |
| Page read | — | (async server component; see known gaps) | `66879c6` |

## Guarantees

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 249 | A stocktake made while a count runs is filed under it | `inventory-stock-form:files a stocktake under the count that is running` | PASS |
| 250 | A delivery mid-count is NOT filed under it | `…:leaves a delivery out of the count even while one is running` | PASS |
| 251 | A stocktake with no count running stays a one-off | `…:records a one-off stocktake when no count is running` | PASS |
| 252 | With no count running, the panel offers to start one and shows no progress figure | `inventory-count-panel-view:when no count is running` (3 tests) | PASS |
| 253 | Progress is stated in ingredients, not percent | `…:counts the shelf in ingredients, not percent` | PASS |
| 254 | The panel names how many are still untouched, so the merchant need not subtract | `…:names how many are still untouched` | PASS |
| 255 | Finishing early warns what it leaves behind | `…:warns that finishing early leaves the rest unaccounted for` | PASS |
| 256 | The warning disappears once every ingredient is reached | `…:drops the warning once every ingredient has been reached` | PASS |
| 257 | The remainder is never negative when more was counted than scoped | `…:never reports a negative remainder` | PASS |
| 258 | A closed count offers a NEW count, never a reopen | `…:offers to start a new one rather than reopening the old` | PASS |
| 259 | Starting a count targets the shelf being viewed | `inventory-count-panel:starts the count on the shelf being viewed` | PASS |
| 260 | Starting refreshes, so the next entry lands in the new count | `…:refreshes so the merchant's next entry lands in the new count` | PASS |
| 261 | A failure to start or close is SHOWN, never swallowed | `…:says so when the count could not be started/closed` | PASS |
| 262 | The panel appears on the ingredients screen | `inventory-count-wiring:offers a count when none is running` | PASS |
| 263 | A running count shows its progress there | `…:shows the running count instead` | PASS |
| 264 | **Recording mid-count files under it with nothing asked of the merchant** | `…:files the stocktake under the count` | PASS |
| 265 | With no count running, behaviour is exactly as before | `…:records a one-off when no count is running` | PASS |

## Decisions worth not re-deriving

**Attaching is automatic, not a checkbox.** If joining were a thing to remember,
the entries a busy kitchen forgot to tag would leave the count reading as
partial — and a coverage figure that under-reports honest work is how merchants
learn to ignore it. `buildStockMovementInput` takes the open count id and
ignores it for every reason but `stocktake`.

**Only a stocktake joins.** Stock still arrives during a count. A delivery filed
under one would raise coverage for an ingredient nobody counted, and the schema
refuses it outright — so attaching indiscriminately would have broken the
delivery form for the whole duration of a count.

**The panel sits ABOVE the table**, because the warning about finishing early
has to be read before the merchant reaches the finish button.

**The page reads the store pool (`outletId: null`), not a branch.** Per-branch
counts wait for the branch-aware ledger read: until the report can be scoped to
one shelf, a branch-scoped count would describe a narrower shelf than the report
that judges it.

**A failed count-session read costs the panel, not the page.** The merchant can
still see stock, record deliveries and read the report; the panel falls back to
offering a count, which is also what starting a second one would resolve to,
since `openCount` joins rather than duplicates.

## Honest notes on evidence quality

- The screen-wiring cycle was **3 of 4 genuinely RED**. The fourth ("records a
  one-off when no count is running") passed immediately — it is a regression
  guard on behaviour that already worked.
- My first version of that test failed for the **wrong reason**: the reason
  picker is labelled "Counted" and the submit button "Record count", and my
  selectors matched neither. A test failing on a bad selector is not a RED gate,
  so the selectors were corrected and the gate re-run before any production code
  was touched. Only then were 3 of 4 failing for the intended reason.
- One copy string was changed to satisfy a regex (`not counted` → `uncounted`).
  The test was written first and the wording bent to it, not the reverse.

## Validation

```
npx jest                        → 367 passed, 1 skipped, 4534 tests (web)
cd webnegosyo-app && npx jest   → 97 suites, 1607 passed
npx tsc --noEmit                → clean for every file in this unit
npx eslint <changed files>      → clean
```

Note: `tests/unit/inventory-stock-alerts-service.test.ts` failed mid-run with 3
tests red. It is `bd48a92`, a **concurrent session's committed RED reproducer**
for branch-blind alerts, landed between two of my runs and fixed by them before
the final validation. Not this unit's, and green by the end.

## Still not built

**The merchant app has no count panel.** `count-panel.ts` is pure and ready to
port, but the phone can read a count session and cannot start one. The parity
guard does not yet cover `count-panel.ts` because there is no app copy to
compare against.

**Per-branch counts.** The page opens counts against the store pool only. This
is blocked on the branch-aware ledger read, not on the count session.

**Branch-aware ledger read** (plan Task C) and **food cost % on the phone**
(plan Task D) remain, unchanged.

---

# The branch-blind reconciliation — a live bug, not a missing feature

**SHIPPED 2026-07-31.** This was picked up as plan Task C ("branch-aware ledger
read"), framed there as an unblock for the branch food-cost %. Reading the
migration first changed what it was: **the daily report has been producing rows
that do not add up for every multi-branch tenant.**

## What was actually wrong

Migration `20260808120000` redefined `stock_movements.balance_after` — it is the
running total **at that movement's branch**, not the store total. Its own
comment says so:

> `balance_after now means the balance AT THAT BRANCH, not the store total. For
> a single-location tenant the two are the same number, so nothing changes for
> them; for a branched one, a branch's history that reported the chain's total
> would be unreadable.`

`buildDailyInventoryReport` never learned this. It read a day's movements for an
ingredient as ONE stream:

```ts
const opening = first.balanceAfter - first.quantityDelta
const closing = last.balanceAfter
```

So the opening came from whichever branch moved first and the closing from
whichever moved last. Two consequences, the second worse than the first:

1. **The row stops adding up.** `opening + received − sold − waste + transferred
   ± count = closing` is the identity that lets a merchant check this report by
   eye rather than merely believe it. A row that fails it is worse than no row.
2. **Offsetting counts hide a real loss.** `countAdjustment` summed across
   branches, so North being 40 short and South being 40 long netted to zero and
   the day reported **zero shrinkage** while a shelf was genuinely missing 40.
   That is precisely the failure the shrinkage figure exists to surface.

Single-shop tenants were unaffected throughout — branch total and store total
are the same number — which is why this survived.

## User journeys

- As a multi-branch merchant, I want the day's row to add up, so that I can
  check the report rather than take it on faith.
- As a multi-branch merchant, I want a shortfall at one branch to be reported
  even when another branch counted long, so that a real loss is never netted
  away.

## RED → GREEN

| Cycle | RED commit | RED evidence | GREEN commit |
|---|---|---|---|
| Per-branch reconciliation | `dca1def` | runtime: **3 failed**, 22 passed | `88c97e7` (75 passed) |
| Fixture repair | — | `tsc` TS2322 on a fixture missing `countSession` | `b4f0884` |

## Guarantees

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 266 | Opening and closing sum the branches instead of reading them as one stream | `inventory-daily-report:adds the branches up` | PASS |
| 267 | Every row satisfies the reconciliation identity across branches | `…:keeps every row checkable by eye` | PASS |
| 268 | A single-shop day is unchanged — absent `outletId` means "the one shelf" | `…:still reconciles a single-shop day` | PASS |
| 269 | **A shortfall at one branch is not netted away by a long count at another** | `…:sums shrinkage across branches` | PASS |

## Decisions worth not re-deriving

**Summed, not filtered.** The report could have been fixed by making the
merchant pick a branch. Summing per-branch openings and closings keeps the
store-wide report meaningful AND correct, and asks nothing of the merchant.

**Branches that did not move today contribute to neither figure**, so the
identity still holds — their stock is simply outside the day's story.

**Shrinkage is judged per branch and then summed**, never netted. Only the short
side of each branch counts, for the same reason only the short side counts
within one.

**`outletId` is optional on `DailyReportMovement`.** Absent means the store pool,
which is what every pre-branch row and every single-shop tenant's rows carry.
`null` and `undefined` deliberately key to the same shelf.

## Honest notes

- 3 of 4 tests genuinely RED; the single-shop case is a regression guard that
  passed immediately, which is the point of including it.
- I predicted the opening/closing break. I did **not** predict the shrinkage
  netting — that test was written on the same suspicion and turned out to expose
  a second, more expensive failure. Recorded because the value came from testing
  the branch dimension broadly rather than from foresight.
- Re-porting `daily-report.ts` to the app with a blind
  `sed 's#@/lib/inventory/#./#g'` **broke the app copy**: it rewrote
  `./stock-ledger` over the app's deliberate `./movement-reason` import. The
  parity guard ignores import lines precisely so those may differ, so the guard
  could not catch it — `tsc` did. Re-port by hand, or fix the import after.

## Validation

```
npx jest                        → 366 passed, 1 skipped, 4548 tests (web)
cd webnegosyo-app && npx jest   → 97 suites, 1607 passed (parity guard green)
npx tsc --noEmit                → clean for every file in this unit
```

`tests/unit/inventory-stock-alerts-read.test.ts` failed during this run: it is
`9ce07a0`, another **concurrent session's committed RED reproducer** for the
alert read dropping the branch. Not this unit's.

## Still not built — and why the branch VIEW is blocked

The report is now correct store-wide. Showing **one branch's** report is a
separate thing, and it is blocked on the other half of the ratio:
`getDailyRevenue` takes no branch parameter and filters by none, and for Convex
tenants the revenue read is a Convex query that would need its own branch
filter.

Scoping the stock read to a branch without scoping revenue would produce a
branch-scoped numerator over store-wide takings — the same scope mismatch the
report has been deliberately withholding the branch food-cost % to avoid, merely
inverted. **The revenue side must be branch-scoped first.**

Also outstanding: the merchant app has no count panel, and counts still open
against the store pool only.

---

# Phase 5 — the phone can run a stock count

**Source plan**: the inline plan of 2026-07-31 ("Remaining Daily Inventory
Report Work"), Phase 5. Chosen first because it is self-contained and needs no
Convex deploy, unlike the branch work it sits beside.

## User journey

> As a merchant standing at my shelf, I want to start and finish a stock count
> from my phone, so that the count is recorded as one act and the report can say
> honestly how much of the shelf was actually looked at.

Until now the app could **read** that a count was running but not start or
finish one. That meant walking to a laptop — and the walk is where a count gets
abandoned, which is the precise failure the session table exists to make visible.

## Task report

### Task 1 — the pure copy, the service, and the payload seam

RED (`ecab7da`) — 3 suites failed:

```
parity.test.ts        ENOENT lib/daily-report/count-panel.ts        (runtime)
count-session-service TS2307 cannot find './count-session-service'  (compile)
inventory-movement    TS2554 expected 2 arguments, but got 3        (compile)
```

GREEN (`51f4f33`) — `count-session-service` 13/13, the other two 30/30.

**Why the session writes straight to Supabase** while a movement deliberately
does not (`lib/inventory-movement-service.ts` refuses to): a movement needs the
server, because the signed delta is resolved against the on-hand quantity read
in the same request, a delivery blends into the moving average, and crossing the
reorder line raises alerts and can 86 a dish. A session records the **act** of
counting, not its effect — `stock_movements` still records that — and
`inventory_counts` RLS already confines a writer to the branches they may reach.
A route would have added a hop and no boundary.

**Two defects the tests found rather than confirmed:**

1. *The service rethrew Supabase's error object.* Supabase rejects with a plain
   object, not an `Error`. Rethrown as-is it reached the screen with no
   `message` to render — a merchant would get an empty alert for a write that
   did not happen. Now wrapped by `asError`, keeping the reason: "new row
   violates row-level security policy" tells them they are on the wrong branch.
   Found because `rejects.toThrow()` does not match a non-`Error`.
2. *The test stub keyed results by table alone*, so `findOpenCount` always found
   a count and `openCount` never reached its insert — three assertions were
   passing over a code path that never ran. The stub now takes a per-table
   **queue**.

### Task 2 — the movement route dropped the count

RED (`48a501c`) — 3 failed / 10 passed. GREEN (`c265441`) — 13/13.

The route never forwarded `inventory_count_id`. Without it the phone could open
and close a count while every entry made during it arrived untagged, so a fully
counted shelf would report as **completely uncounted** — worse than having no
session, because the report would then actively assert that nobody looked.

**One reproducer was rewritten rather than made to pass.** It asserted a 400 for
a delivery naming a count. That refusal lives in `stockMovementInputSchema`,
which this suite mocks away, so the assertion could only have been satisfied by
adding a **fourth** copy of the rule at the door. It now pins that the route does
not silently *drop* the pairing; the refusal stays pinned against the real schema
in `tests/unit/inventory-count-attach.test.ts` and by the trigger in migration
`20260812120000`.

### Task 3 — the panel at the shelf

RED (`5f20664`) — suite failed to run, ENOENT `components/StockCountPanel.tsx`.
GREEN (`e9e68ab`) — 24/24.

The panel is on the **inventory** screen, not the report screen: the count
happens where the merchant is standing, and putting the control elsewhere would
mean opening a count somewhere other than where it is run.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 270 | The running count's coverage is reported, counting a sack recounted twice once | `count-session-service.test.ts` | PASS |
| 271 | The store pool is asked for with IS NULL, not `= NULL` | `count-session-service.test.ts` | PASS |
| 272 | A branch manager's count is scoped to their own branch | `count-session-service.test.ts` | PASS |
| 273 | A failed read yields null, never a phantom count | `count-session-service.test.ts` | PASS |
| 274 | The denominator is snapshotted at open, excluding retired ingredients | `count-session-service.test.ts` | PASS |
| 275 | Opening JOINS a running count instead of starting a second | `count-session-service.test.ts` | PASS |
| 276 | A failed open or close surfaces, with a message worth showing | `count-session-service.test.ts` | PASS |
| 277 | A stocktake is filed under the running count automatically | `inventory-movement.test.ts` | PASS |
| 278 | A delivery or waste is never filed under a count | `inventory-movement.test.ts` | PASS |
| 279 | The movement route forwards the session; a non-string is ignored | `api/inventory-movement-authz.test.ts` | PASS |
| 280 | The panel's every word comes from the shared copy | `inventory-screen-mount.test.ts` | PASS |
| 281 | Finishing an incomplete count warns first | `inventory-screen-mount.test.ts` | PASS |
| 282 | The count is scoped to the branch whose shelf is on screen | `inventory-screen-mount.test.ts` | PASS |
| 283 | `count-panel.ts` has not drifted from the web original | `daily-report/parity.test.ts` | PASS |

## Validation

```
npx jest (webnegosyo-app)  → 98 suites, 1649 passed
npx tsc --noEmit (app)     → clean
npx jest (web)             → 367 suites, 4553 passed, 1 skipped
```

`npx tsc --noEmit` on the web reports errors in
`tests/integration/inventory-live-e2e.test.ts` — a **concurrent session's**
file (`3bc83c8`), untouched here and unrelated to this unit.

## Known gaps

- The panel offers a count of the branch on screen. Per-branch counts are
  therefore live on the phone but still store-pool-only on the **web**
  (`getOpenCount(tenant.id, null)`).
- The branch report VIEW remains blocked on branch-scoped revenue, unchanged
  from the previous unit.

---

# Phase 1 — the branch manager's own report

**Source plan**: the inline plan of 2026-07-31, Phase 1. Taken next because it
needs no Convex deploy, unlike the branch work on the web.

## User journey

> As a branch manager, I want the day's report to cover MY branch, so that the
> food cost I am shown describes the shop I actually run.

Before this, a branch manager's food cost was withheld **entirely**: the ledger
read was store-wide while the orders read was not, and the module that withheld
it said so in its own header.

## The finding that changed the shape of this task

The plan assumed a single mismatch to close. There are two, and they run in
opposite directions depending on the order backend:

| Backend | `orders:getDashboardStatsByPeriod` | Branch stock ÷ these takings |
|---|---|---|
| Platform Supabase | narrowed via `scopeToBranch` (`supabase-adapter.ts:537`) | correct |
| Convex | takes `startDate`/`endDate` only; **absent** from `CONVEX_BRANCH_SCOPED_REFS` | branch numerator over store-wide takings |

So scoping the ledger and lifting the withholding wholesale would have published
a food cost that is far too **LOW** on every Convex tenant. That is the dangerous
direction: an inflated figure looks like a crisis and gets investigated, a
flattering one gets believed.

It also means the premise recorded in `daily-report-revenue.ts` — that the
figure would come out "inflated by roughly the number of branches" — was only
ever true of the platform backend. The withholding was right; its stated reason
was half wrong.

## Task report

RED (`b788f72`) — 3 suites failed, 2 tests failed / 27 passed:

```
daily-report-revenue      TS2561 'isRevenueBranchScoped' does not exist in ReportRevenueInput
daily-report-service      TS2554 loadDailyReport expected 2-3 arguments, but got 4
daily-report-screen-mount 2 assertions failed (no branch argument, no backend split)
```

GREEN (`7b0ddd5`) — app 98 suites / 1658 tests, `tsc` clean; web 367 / 4553.

**One implementation attempt was reverted mid-GREEN.** A generic
`forBranch<T>(query)` helper sent `tsc` into `TS2589: type instantiation is
excessively deep and possibly infinite` on Supabase's builder types. Replaced
with plain conditional chaining, the same shape `count-session-service.ts` uses.

**One assertion was widened rather than satisfied.** The mount guard looked for
`/loadDailyReport\([^)]*outletId/`; the call site passes `reportOutletId`, so the
wiring was present and the regex was merely case-sensitive. Widened to
`[Oo]utletId` with the reason recorded inline, rather than renaming production
code to match a test.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 284 | The ledger narrows to the branch when one is named | `daily-report-service.test.ts` | PASS |
| 285 | The day's count session narrows to the SAME branch | `daily-report-service.test.ts` | PASS |
| 286 | An owner's report acquires no branch filter by accident | `daily-report-service.test.ts` | PASS |
| 287 | A branch manager sees their takings when the backend scoped them | `daily-report-revenue.test.ts` | PASS |
| 288 | The figure is still withheld when the backend could not narrow it | `daily-report-revenue.test.ts` | PASS |
| 289 | A store-wide account is unaffected whatever the backend does | `daily-report-revenue.test.ts` | PASS |
| 290 | Silence about narrowing means NO, never "assume yes" | `daily-report-revenue.test.ts` | PASS |
| 291 | The screen passes the account's branch to the ledger read | `daily-report-screen-mount.test.ts` | PASS |
| 292 | The screen decides withholding on the backend, not the account alone | `daily-report-screen-mount.test.ts` | PASS |

## Validation

```
npx jest (webnegosyo-app)  → 98 suites, 1658 passed
npx tsc --noEmit (app)     → clean
npx jest (web)             → 367 suites, 4553 passed, 1 skipped
```

## Known gaps

- **Convex tenants' branch managers still see no food cost.** Closing that means
  teaching the Convex `getDashboardStatsByPeriod` an `outletId` and adding the
  ref to `CONVEX_BRANCH_SCOPED_REFS` — which blanks the screen on any deployment
  below the version that ships it. That is a deploy-gated change, not a code one.
- The WEB report is still store-wide on both halves; `getDailyRevenue` there
  still takes no branch parameter.
- Web counts still open against the store pool only.

---

# Phase 1b — the WEB report answers for one branch

**Source plan**: the inline plan of 2026-07-31, Phases 2–4, reshaped. The plan
split these across "branch-scoped revenue", "web branch view" and "per-branch
counts"; they turned out to be one change, because each was blocked only by the
others.

## User journey

> As a branch admin on the web, I want the daily report to cover MY branch, so
> that I am not shown the whole chain's stock as though it were my shelf.

## The bug this closes

The merchant app **withheld** a branch manager's food cost when the two halves
were incomparable. The web did not withhold anything — it read
`stock_movements` store-wide and presented the result to a branch admin as their
day. Same mismatch, worse handling: the app declined to answer, the web answered
wrongly.

## Task report

RED (`bf9917d`) — 4 failed / 29 passed:

```
inventory-report-scope     Cannot find module '@/lib/inventory/report-scope'
daily-report-read          no outlet_id filter on stock_movements or inventory_counts
daily-revenue-read         no outlet_id filter on either Supabase path
```

GREEN (`256c571`) — 369 suites / 4574 tests; lint clean; `tsc` clean for every
file in this unit.

**Why a new module.** `resolveReportScope` exists because the decision it makes
sat in a server component, which cannot be unit-tested — and it is the decision
that determines whether the two halves of the food-cost ratio describe the same
business. An unrecognised or absent `order_backend` counts as **unnarrowable**,
so a backend added later cannot start publishing incomparable figures merely by
not being listed.

**Why `undefined` rather than `null` for a withheld figure.** The panel omits
the card entirely for `undefined`; `null` renders "the takings could not be
read", which tells a branch admin the figure would otherwise have been theirs to
see. It would not be — it does not exist for them at all.

**Per-branch counts came free.** `getOpenCount(tenant.id, null)` had a comment
explaining it was pinned to the store pool *until the report could be scoped to
one shelf*. That is now true, so it passes the branch.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 293 | An owner's report covers the whole store | `inventory-report-scope.test.ts` | PASS |
| 294 | A branch admin's report covers their own branch | `inventory-report-scope.test.ts` | PASS |
| 295 | A branch admin on Supabase may be shown a food cost | `inventory-report-scope.test.ts` | PASS |
| 296 | A branch admin on Convex may not | `inventory-report-scope.test.ts` | PASS |
| 297 | An owner on Convex keeps the food cost they always had | `inventory-report-scope.test.ts` | PASS |
| 298 | An unknown backend is treated as unnarrowable | `inventory-report-scope.test.ts` | PASS |
| 299 | The web ledger read narrows to the branch | `inventory-daily-report-read.test.ts` | PASS |
| 300 | The day's count session narrows to the same branch | `inventory-daily-report-read.test.ts` | PASS |
| 301 | An owner's ledger read acquires no branch filter | `inventory-daily-report-read.test.ts` | PASS |
| 302 | The platform order read narrows to the branch | `inventory-daily-revenue-read.test.ts` | PASS |
| 303 | A per-tenant Supabase order read narrows the same way | `inventory-daily-revenue-read.test.ts` | PASS |
| 304 | An owner's order read stays unfiltered | `inventory-daily-revenue-read.test.ts` | PASS |
| 305 | Narrowing filters the query without disturbing the sum | `inventory-daily-revenue-read.test.ts` | PASS |

## Validation

```
npx jest          → 369 suites, 4574 passed, 1 skipped
npx eslint <unit> → clean
npx tsc --noEmit  → clean for every file in this unit
```

Pre-existing `tsc` errors remain in `tests/integration/inventory-live-e2e.test.ts`
(concurrent session, `3bc83c8`), `tests/unit/api/inventory-order-stock.test.ts`,
`tests/product-detail-*.test.*`, and at lines 199/216 of
`inventory-daily-revenue-read.test.ts` — all outside the lines this unit added
(verified: additions begin at line 243).

## Known gaps

- **The page wiring itself has no automated guard.** The merchant app has
  source-text mount tests for this; the web has no such convention, so
  `resolveReportScope` is tested and its *use* in
  `src/app/[tenant]/admin/inventory/page.tsx` is covered only by `tsc` and
  review.
- **Convex tenants' branch admins still get no food cost**, on either surface.
  Closing that requires the Convex `getDashboardStatsByPeriod` to accept an
  `outletId` and a bundle push reaching tenants — deploy-gated, not code.
- There is still no branch **selector**: the report follows the account's own
  scope. An owner wanting one branch's report cannot ask for it.

---

# Phase 2 — the Convex half (schema v18)

**Source plan**: the inline plan of 2026-07-31, Phase 2 — the one flagged as
**high risk** because the hazard is a deployment, not a diff.

## User journey

> As a branch manager on a Convex tenant, I want a food cost for my branch, so
> that the figure is not withheld from me forever because of where my orders
> happen to live.

## The hazard, and how it is handled

A Convex validator **rejects** an argument it does not know. `hooks.ts` reads
that rejection as "this store needs a backend update" and renders a placeholder
instead of the figures. So switching branch narrowing on for everyone would
blank the dashboard for every tenant below the new bundle — and most tenants run
several versions behind head.

Handled three ways:

1. The argument is `v.optional`. A required one would break every caller of that
   query at once.
2. The client **omits the key entirely** rather than sending `outletId:
   undefined` — a validator still sees the key.
3. Narrowing is **version-gated per ref**. `getDashboardStatsByPeriod` needs
   >= 18; the two v15 refs stay ungated, because gating them now would *remove*
   narrowing from tenants whose version this app has never had to know.

An unrecorded version counts as the **oldest**, never as current.

## Task report

### Web + template

RED (`810647d`) — 2 failed / 29 passed, 1 suite unable to run
(`Cannot find module './orderStats'`). GREEN (`0f9c3ea`) — 370 suites / 4595.

**Two bugs fell out of extracting `summarizeOrderStats`.** Both handlers carried
near-identical copies with no coverage at all:

- The status tally indexed blind (`statusCounts[order.status]++`). A status
  added by a later schema turned the count into `NaN` and took the whole
  dashboard query down with it.
- A branch read that took only `QUERY_LIMIT` rows *before* filtering would
  silently drop the older half of a busy day. It now widens to
  `BRANCH_SCAN_LIMIT`, as `getOrders` already does.

**The bundle guard caught a real omission.** `tests/unit/convex-push-bundle.test.ts`
failed with `orderStats.ts` missing: the Deploy Schema button ships the
pre-built `src/lib/convex-push-bundle.json`, so a module present in the source
tree but absent there is code no tenant runs. Fixed by `npm run convex:prebundle`.

### App

RED (`103462a`) — 2 failed / 21 passed, plus a compile-time failure.
GREEN (`4f6f5fd`) — 98 suites / 1666 tests, `tsc` clean.

Two pre-existing tests demanded deliberate updates rather than passing quietly,
which is what they are for:

- The `CONVEX_BRANCH_SCOPED_REFS` lock required the new ref to be added by hand.
  It was also **strengthened**: membership alone cannot see a ref registered at
  the wrong minimum version, so the versions are now pinned through behaviour.
- `exitTenant`'s round-trip test failed until its fixture learned the field —
  proving the version is cleared on exit, so none survives a tenant switch.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 306 | The dashboard figures exclude cancelled orders but still tally them | `orderStats.test.ts` | PASS |
| 307 | An empty day reports zero, never NaN | `orderStats.test.ts` | PASS |
| 308 | An unknown status no longer corrupts the tally | `orderStats.test.ts` | PASS |
| 309 | A branch read counts only that branch's takings | `orderStats.test.ts` | PASS |
| 310 | A branch order predating the `outletId` column is still found | `orderStats.test.ts` | PASS |
| 311 | An unbranched order is not credited to a branch | `orderStats.test.ts` | PASS |
| 312 | A store-wide read counts every branch | `orderStats.test.ts` | PASS |
| 313 | The web states a Convex food cost only at >= v18 | `inventory-report-scope.test.ts` | PASS |
| 314 | An unknown deployment version keeps it withheld | `inventory-report-scope.test.ts` | PASS |
| 315 | The web forwards the branch to Convex | `inventory-daily-revenue-read.test.ts` | PASS |
| 316 | A store-wide Convex read sends no branch KEY at all | `inventory-daily-revenue-read.test.ts` | PASS |
| 317 | The app narrows the stats query only at >= v18 | `convex-order-scope.test.ts` | PASS |
| 318 | The v15 refs stay ungated, unchanged from today | `convex-order-scope.test.ts` | PASS |
| 319 | Each ref's minimum version is pinned, not just its membership | `convex-order-scope.test.ts` | PASS |
| 320 | The session carries the tenant's deployed bundle version | `session-resolve.test.ts` | PASS |
| 321 | An absent version reads as unknown, not as zero-and-fine | `session-resolve.test.ts` | PASS |
| 322 | Leaving a tenant clears the version | `impersonation.test.ts` | PASS |

## Validation

```
npx jest (web)             → 371 suites, 4598 passed, 1 skipped
npx jest (webnegosyo-app)  → 98 suites, 1666 passed
npx tsc --noEmit (app)     → clean
npx eslint <unit>          → clean
```

## NOT DONE — this ships nothing to tenants

`CURRENT_SCHEMA_VERSION` is 18 and the bundle is rebuilt, but **no tenant is
running it**. Every deployment is still on its existing bundle, so today every
Convex branch manager still sees the withheld figure — exactly as before this
change, which is the intended safe state.

Reaching them requires the **Deploy Schema** button per tenant. Until a tenant
is redeployed, `convex_schema_version` stays below 18 and the gate holds. That
step is deliberately left to the operator: it is an outward-facing action per
store, not something to fan out unattended.

Also still open: there is no branch **selector** on either surface — the report
follows the account's own scope, so an owner cannot ask for one branch's report.

---

# Phase 6 — the spinner that would not end

**Source**: a merchant report — "loading takes too much time" — with a
screenshot of the stock sheet stuck on its spinner while recording a count for
Brew Daze Express.

## User journey

> As a merchant recording a count at the shelf, I want the write to complete
> quickly, and to be told something if it cannot, so that I am never left unable
> to tell whether my count was recorded.

## What was actually wrong

Two separate faults, one slow and one unbounded.

**1. The same identity resolved three times.** A single stocktake made three
sequential `supabase.auth.getUser()` calls and read `app_users` twice:

| # | Where | Call |
|---|---|---|
| 1 | route | `auth.getUser()` to authorize |
| 2 | route | `app_users` for the permission check |
| 3 | service | `auth.getUser()` inside `resolveActingBranchScope` |
| 4 | service | `app_users` again, for the branch |
| 5 | service | `auth.getUser()` inside `resolveActingUserId`, for `created_by` |

`auth.getUser()` is **not** a local token decode — it calls the auth server to
verify the JWT. Five round trips, in sequence, before the write begins, from a
phone on mobile data to a serverless function that is itself round-tripping to
Supabase.

Fixed by having the route pass the actor it already resolved. Nothing is
loosened: the scope is still the SERVER's answer from `app_users`, never the
phone's, which is the property that stops one shop moving another's stock.

**2. `fetch` had no timeout.** A stalled connection left the sheet spinning with
no error, no confirmation, and no way out but killing the app — and the merchant
could not tell whether the count had been recorded, which is the one thing that
screen exists to make certain.

## Task report

RED (`ffd2bc3`, `f1a0d99`) — 4 failed / 2 passed on the actor reproducer;
compile-time RED (`TS2554`) on the timeout option.

GREEN (`4e4b50e`) — web 374 suites / 4634 tests; app 101 suites / 1698 tests;
`tsc` and lint clean.

**One implementation attempt failed and was replaced.** Aborting via
`AbortController` alone did not end the test's hung request: the stub `fetch`
ignores the signal. Real `fetch` honours it, but React Native's has not always
propagated an abort as a rejection — so relying on it is exactly how a spinner
outlives the timeout meant to end it. The final version **aborts and races**:
the abort releases the socket, the race guarantees the function returns.

**The timeout message deliberately does not say "try again."** A timeout is not
a failed write — the request may well have landed. "Try again" is the one
instruction that could make it worse, because a re-entered count is recorded
twice. It says the count may have been saved and to check the shelf first.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 323 | A write with a known actor asks the auth server nothing | `inventory-movement-actor.test.ts` | PASS |
| 324 | It does not re-read `app_users` | `inventory-movement-actor.test.ts` | PASS |
| 325 | The movement is still attributed to that person | `inventory-movement-actor.test.ts` | PASS |
| 326 | It is booked to the branch the caller resolved | `inventory-movement-actor.test.ts` | PASS |
| 327 | A branch outside the acting scope is still refused | `inventory-movement-actor.test.ts` | PASS |
| 328 | With no actor, it resolves one itself as before | `inventory-movement-actor.test.ts` | PASS |
| 329 | The route hands on the user it authorized | `api/inventory-movement-authz.test.ts` | PASS |
| 330 | The scope handed on comes from `app_users`, not the request | `api/inventory-movement-authz.test.ts` | PASS |
| 331 | A stalled write gives up instead of spinning forever | `inventory-movement-service.test.ts` | PASS |
| 332 | Its message says the count may already have been saved | `inventory-movement-service.test.ts` | PASS |

## Known gaps

- **Not measured in production.** The round trips removed are counted from the
  code, not from a trace. If the spinner is still slow, the remaining suspects
  are serverless cold start and the write's own sequential reads
  (`inventory_items`, `inventory_units`, insert, cost update, refresh).
- The order pipeline's path is unchanged — it passes no actor and still resolves
  one itself, which is correct: a `sale` is deducted by the system, not a person.
