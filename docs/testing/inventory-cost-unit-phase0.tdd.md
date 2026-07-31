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

**Still open from the review, untouched:** both admin inventory routes authorize
on role alone and skip `verifyTenantPermission`; `current_qty` has no
non-negative CHECK; stocktake is still a read-modify-write that a concurrent
sale can swallow. (The `FOR ALL` RLS hole is now closed — see Security C.)

**Not deployed.** The branch is ~540 commits ahead of `origin/main` with no
upstream, so none of this — Phase 0's correctness fixes included — is in front
of a merchant. The append-only migration is the exception: it is live on the
database now, because RLS is not shipped by deploying the app.
