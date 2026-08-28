# TDD evidence — inventory verification & the producible-quantity guard

**Source plan:** none. Journeys were derived during this TDD run from the request:
*"test our current inventory — make sure we are able to add recipes properly, have proper
costing and margins, have low stock alert, and we should not be able to add to cart more
than what we can produce or checkout."*

**Branch:** `main` · **Date:** 2026-08-29

---

## User journeys

1. As a merchant, I want to attach a recipe to a dish and have it stick, so stock moves when
   that dish sells.
2. As a merchant, I want a dish's cost and margin computed from its recipe, so I know what
   I actually earn on it.
3. As a merchant, I want to be told when an ingredient runs low, so I can reorder before I
   run out.
4. **As a merchant, I do not want a customer to buy more of a dish than my ingredients can
   make**, so I never have to phone someone back and cancel.

## What the audit found

Journeys 1–3 were already implemented and exhaustively tested. Journey 4 **was not
implemented at all.**

Every stock guard in the codebase was **binary and retrospective**:

| Guard | Question it asks | Why that is not enough |
|---|---|---|
| `auto-86.ts` | "Did an ingredient reach zero?" | Fires *after* an order emptied the shelf — the order that did it was accepted in full. |
| `loyverse/stock-check.ts` | "Is this variant above zero?" | Loyverse tenants only, and 1 unit in stock accepts a cart of 50. |
| `menu-availability.ts` | "Is the dish flagged available?" | Renders a decision; does not make one about quantity. |

A grep across `src`, `mobile`, and `webnegosyo-app` for `producible|canProduce|maxQty|
stockCeiling|availableQty` returned **zero hits**. Nothing anywhere converted "how much
stock is on the shelf" into "how many of this dish can be made". Flour for two burgers
accepted a cart of fifty, on the web, in the branded app, and at the register.

---

## Task report

### Task A — verify journeys 1–3 (no code change)

| Area | Command | Result |
|---|---|---|
| Recipes | `npx jest --testPathPatterns="recipe"` | 11 suites, **87 passed** |
| Costing & margins | `npx jest --testPathPatterns="costing\|cost-\|food-cost\|margin"` | 8 suites, **81 passed** |
| Low-stock alerts | `npx jest --testPathPatterns="low-stock\|stock-alerts"` | 7 suites, **100 passed** |
| Whole inventory area (baseline) | `npx jest --testPathPatterns="(inventory\|recipe\|stock)"` | 115 suites, **1256 passed**, 8 skipped |

Guaranteed by those passing suites: recipes attach to dishes/addons/prep items and persist
their components; recipe cost rolls up recursively through prep items with cycle guards and
unit conversion; food cost and margin derive from that rollup; low-stock evaluates level as
a *state* and alerts only on a *crossing*, so one alert is raised per crossing rather than
per sale.

### Task B — close journey 4 (TDD)

**RED 1** — `tests/unit/inventory-producible.test.ts`, 22 cases.

```
npx jest --testPathPatterns="inventory-producible"
● Test suite failed to run
  Cannot find module '../../src/lib/inventory/producible'
Tests: 0 total
```

Compile-time RED: the reproducer names the arithmetic that does not exist. Checkpoint
`7e97230`.

**GREEN 1** — `src/lib/inventory/producible.ts`.

```
npx jest --testPathPatterns="inventory-producible"
Tests: 22 passed, 22 total
```

Checkpoint `2483b01`.

**RED 2** — `tests/unit/inventory-checkout-stock-guard.test.ts`, 8 cases.

```
npx jest --testPathPatterns="inventory-checkout-stock-guard"
● Test suite failed to run
  Cannot find module '../../src/lib/inventory/checkout-stock-guard'
```

Checkpoint `835b872`.

**GREEN 2** — `src/lib/inventory/checkout-stock-guard.ts` + wiring in
`src/app/actions/orders.ts` (immediately after the branch is resolved, so the guard judges
against the shelf of the branch actually fulfilling the order).

```
npx jest --testPathPatterns="inventory-checkout-stock-guard"
Tests: 8 passed, 8 total
```

Checkpoint `0c18de9`.

---

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The scarcest ingredient sets the ceiling (flour for 5, cheese for 10 → 5) | `inventory-producible.test.ts:returns the whole units the scarcest ingredient allows` | unit | PASS |
| 2 | A partial unit is floored — half a pizza is not sellable | `…:floors a partial unit` | unit | PASS |
| 3 | An exhausted ingredient yields a ceiling of 0 | `…:is zero once an ingredient is exhausted` | unit | PASS |
| 4 | Recipe units convert into the ingredient's stock unit (2 kg / 200 g → 10) | `…:converts recipe units into the unit the ingredient is stocked in` | unit | PASS |
| 5 | Floating-point dust never costs a sellable unit (0.1×3 → 3, not 2) | `…:does not lose a whole unit to floating-point dust` | unit | PASS |
| 6 | A dish with no base recipe has no ceiling | `…:reports no ceiling for a dish with no base recipe` | unit | PASS |
| 7 | An empty recipe shell has no ceiling | `…:reports no ceiling for a recipe shell that lists no ingredients` | unit | PASS |
| 8 | An ingredient with no stock row is passed over, not read as zero | `…:passes over an ingredient the tenant does not stock` | unit | PASS |
| 9 | An inactive ingredient is passed over | `…:passes over an ingredient that is no longer tracked` | unit | PASS |
| 10 | An unconvertible unit (g of something stocked by the piece) is passed over | `…:passes over a component whose unit cannot convert` | unit | PASS |
| 11 | A cart within stock produces no shortfalls | `…:says nothing when the cart is within what the kitchen can make` | unit | PASS |
| 12 | A cart of 50 against stock for 5 is refused, reporting `producible: 5` | `…:refuses a line asking for more than the ingredients allow` | unit | PASS |
| 13 | Two dishes sharing an ingredient cannot both be granted it (3+3 vs stock for 5) | `…:spends shared stock once across lines` | unit | PASS |
| 14 | Two lines of the same dish are merged before judging (3+3 = 6) | `…:merges two lines of the same dish before judging it` | unit | PASS |
| 15 | An untracked dish is never reported | `…:never reports a dish that is not stock-tracked` | unit | PASS |
| 16 | The refusal names the dish and how many are left | `…:names the dish and how many are left` | unit | PASS |
| 17 | Zero is spelled "sold out", never "0 left" | `…:says sold out rather than "0 left"` | unit | PASS |
| 18 | Checkout refuses a cart the kitchen cannot fill | `inventory-checkout-stock-guard.test.ts:refuses a cart asking for more` | integration | PASS |
| 19 | Checkout lets a coverable cart through | `…:lets a cart through when the ingredients cover it` | integration | PASS |
| 20 | Inventory-off tenants are never charged a read | `…:has no opinion when the tenant has not turned inventory on` (asserts `recipes` is never queried) | integration | PASS |
| 21 | A failed read never blocks a sale | `…:has no opinion when the read fails` | integration | PASS |
| 22 | A branch order is judged against that branch's shelf, not the roll-up | `…:judges a branch order against that branch's own shelf` | integration | PASS |
| 23 | An ingredient with no row at a branch is passed over, not treated as empty | `…:passes over an ingredient the branch has no row for` | integration | PASS |
| 24 | A store-wide order uses the roll-up | `…:uses the store-wide roll-up when the order names no branch` | integration | PASS |

## Design decisions worth recording

**Silence is the default.** Inventory off, a failed read, an empty cart, a dish with no
recipe, an ingredient with no row at this branch — every one returns "no opinion" rather
than a refusal. A wrongly refused order costs a real sale and a customer who does not come
back; a wrongly accepted one costs an apology from a merchant who already knew their shelf
was thin. This is the same trade `resolveOrderDepletions` and `findOutOfStockLines` make.

**A missing branch stock row is ignorance, not an empty shelf.** This is deliberately the
*opposite* of what the admin screens do (`multi-branch-inventory`: no row = zero). There the
number tells an owner what is really on the branch's shelf. Here it decides whether a paying
customer is turned away, and refusing on "this branch never set up per-branch stock" is how
a merchant would discover this feature by losing a day of orders.

**Only a base recipe constrains**, matching `auto-86.ts`: an ingredient used solely by a
variation option or addon leaves the dish sellable in its other configurations, and
option-level ceilings need per-option availability that does not exist yet.

**The cart is judged as a whole**, in cart order: an earlier line is served in full and the
shortfall lands on the later one — the order the kitchen would fill them in.

## Coverage

```
npx jest --testPathPatterns="inventory-(producible|checkout-stock-guard)" --coverage \
  --collectCoverageFrom="src/lib/inventory/{producible,checkout-stock-guard}.ts"

File                     | % Stmts | % Branch | % Funcs | % Lines
All files                |   98.47 |    85.26 |     100 |   98.47
 checkout-stock-guard.ts |   96.27 |    72.22 |     100 |   96.27
 producible.ts           |     100 |    93.22 |     100 |     100
```

Both above the 80% floor. Uncovered lines are the `catch` arms and `?? []` null-guards on
the Supabase reads.

**No regression:** `npx jest` → 533 suites / **6310 passed**, 8 skipped (was 532 / 6302
before this work). `npx tsc --noEmit` reports **no new errors**; the errors it does report
are pre-existing, in `tests/integration/inventory-live-e2e.test.ts`,
`tests/product-detail-content.test.tsx`, and `tests/product-detail-theme.test.ts`, none of
which this work touched. `npx eslint` on all five changed files is clean.

---

# Round 2 — the stepper cap and the register

Gaps 1 and 2 below were closed in a second TDD pass. Journeys added:

5. As a customer, I want the quantity picker to stop where the kitchen does, so I do not
   fill in a whole checkout only to be turned away on the last screen.
6. As a cashier, I want to be *told* when a sale outruns the shelf — not *stopped* — so I
   can use what I can see and they cannot.

## Task report (round 2)

**RED 3** — `tests/unit/inventory-stepper-cap.test.ts` (13) and
`tests/unit/inventory-menu-ceilings.test.ts` (8).

```
npx jest --testPathPatterns="inventory-(stepper-cap|menu-ceilings)"
Cannot find module '../../src/lib/inventory/stepper-cap'
Cannot find module '../../src/lib/inventory/menu-ceilings'
Test Suites: 2 failed, 2 total ·  Tests: 0 total
```

**GREEN 3** — `stepper-cap.ts` (pure), `menu-ceilings.ts`, and `stock-graph-read.ts`, which
**extracts the read the checkout guard already did** so both callers share one graph. The
guard's 8 tests stayed green through that refactor, which is what proves the extraction was
behaviour-preserving. `npx jest …` → **49 passed**.

**RED 4 / GREEN 4** — `tests/unit/inventory-ceilings-route.test.ts` (6) for
`GET /api/inventory/ceilings`. RED: `Cannot find module '@/app/api/inventory/ceilings/route'`.
The suite needed `@jest-environment node` — jsdom has no `Request`. → **6 passed**.

**The stepper wiring caught a real bug.** Adding `useStockCeilings` to
`product-detail-content.tsx` turned 9 existing tests red with *"No QueryClient set"*. The
test harness had been rendering the storefront **without** the `QueryClientProvider` that
`src/app/layout.tsx` actually supplies, and its `useCart` mock omitted `items`. Both were
fixed to mirror production — the component was never wrong, the harness was.

**RED 5 / GREEN 5 (register)** — `webnegosyo-app/lib/pos-stock-warning.test.ts` (8) and
`pos-stock-ceilings.test.ts` (7). RED captured by moving the implementation aside:

```
lib/pos-stock-warning.test.ts:15:40 - error TS2307: Cannot find module './pos-stock-warning'
Test Suites: 1 failed, 1 total ·  Tests: 0 total
```

→ **15 passed**, then wired into `app/(main)/pos.tsx` as an amber banner above the cart.

## Why the register warns and the web refuses

This divergence is the design, not an omission. Online, nobody is standing over the
customer and they can fix the cart themselves in the seconds it takes to read the message.
At the register a cashier is facing a paying customer with a queue behind them, can see the
shelf with their own eyes, and routinely knows things the ledger does not — a delivery that
arrived and was not keyed in, a stocktake nobody ran, a recipe overstating a portion.
Turning a best-effort software estimate into a refused, in-person, cash-in-hand sale is a
far worse trade than overselling by one. So the register is told, and the human decides.

## Test specification (round 2)

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 25 | An untracked dish keeps the old unlimited stepper | `inventory-stepper-cap.test.ts:allows the hard maximum when the dish has no ceiling` | unit | PASS |
| 26 | The stepper subtracts what the cart already holds of that dish | `…:subtracts what the cart already holds` | unit | PASS |
| 27 | The stepper never offers more once the ceiling is reached | `…:allows nothing once the cart already holds the whole ceiling` | unit | PASS |
| 28 | A cart that outran the shelf yields 0, never a negative | `…:never goes negative` | unit | PASS |
| 29 | The hard 99-item cap still applies above any ceiling | `…:still respects the hard maximum` | unit | PASS |
| 30 | No hint when there is plenty — a stepper must not nag | `…:says nothing when there is plenty left` | unit | PASS |
| 31 | "Only N left" appears only under the threshold | `…:warns how many are left once stock is short` | unit | PASS |
| 32 | Zero is never spelled "0 left" | `…:says the maximum is reached rather than "0 left"` | unit | PASS |
| 33 | Each tracked dish gets its producible ceiling | `inventory-menu-ceilings.test.ts:reports how many of each tracked dish` | unit | PASS |
| 34 | Untracked dishes are absent from the map, never zero | `…:leaves an untracked dish out of the map entirely` | unit | PASS |
| 35 | An addon or prep recipe never puts a ceiling on a dish | `…:does not let an addon or prep recipe put a ceiling on a dish` | unit | PASS |
| 36 | A branch sees its own shelf | `…:uses the branch's own shelf when a branch is named` | unit | PASS |
| 37 | Inventory-off and failed reads yield no ceilings | `…:is empty when the tenant has not turned inventory on` / `…when the read fails` | unit | PASS |
| 38 | The route returns one integer per dish and 400s without a tenant | `inventory-ceilings-route.test.ts` | integration | PASS |
| 39 | The route never errors — a failed read answers `{}` | `…:answers with no ceilings rather than an error` | integration | PASS |
| 40 | Ceilings are never cached | `…:is not cached` | integration | PASS |
| 41 | The register warns, naming dish and number | `pos-stock-warning.test.ts:warns when a line outruns the shelf` | unit | PASS |
| 42 | Separate lines of one dish are added up first | `…:adds up separate lines of the same dish before judging` | unit | PASS |
| 43 | No ceilings known → the register says nothing | `…:says nothing when the register knows no ceilings` | unit | PASS |
| 44 | The register's read never throws and never blocks the till | `pos-stock-ceilings.test.ts:knows no ceilings when the request fails` | unit | PASS |

## Coverage (round 2)

```
File                     | % Stmts | % Branch | % Funcs | % Lines
checkout-stock-guard.ts  |     100 |      100 |     100 |     100
menu-ceilings.ts         |     100 |    81.81 |     100 |     100
producible.ts            |     100 |    93.22 |     100 |     100
stepper-cap.ts           |     100 |      100 |     100 |     100
stock-graph-read.ts      |   96.82 |    69.69 |     100 |   96.82
```

Statements 100% on four of five. Uncovered branches are the `catch` arms and `?? []`
null-guards on Supabase reads.

**Platform suite:** `npx jest` → 536 passed of 537 (1 skipped), 6337 passed of 6345 tests
(8 skipped). **Merchant app:** 215 suites / 3052 passed,
`npx tsc --noEmit` clean (0 errors).

## Known gaps (still deliberately not done)

1. **Option/addon ingredients do not constrain a dish**, per the base-recipe rule — matching
   auto-86. Per-option availability does not exist yet.
2. **The register's warning is per-dish, not per-cart.** The shared-ingredient arithmetic
   the online guard runs needs the whole recipe graph; for a warning, "you have more of this
   than we can make" is the useful half.
3. **The white-labeled customer app (`mobile/`)** has its own stepper and is not capped; its
   orders are still guarded server-side at depletion time.
4. **Tenants whose orders live in their own Supabase project** are guarded (the check runs
   before the write, on platform-held recipes) but were not exercised end to end.
5. **A concurrent session** was editing `staff-permissions.ts` in this shared worktree
   during round 2; one failure in `tests/unit/staff-permissions.test.ts` belongs to that work,
   not this. No file of theirs was staged or modified here.
