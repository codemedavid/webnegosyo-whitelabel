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

## Known gaps (deliberately not done)

1. **The customer-facing quantity stepper is not yet capped.** Checkout — the authoritative
   boundary that every backend (platform Supabase, Convex, tenant-owned Supabase) passes
   through — now refuses an over-large cart. The menu and cart UI still let a customer *type*
   a quantity they cannot have and learn about it at checkout. Capping the stepper needs a
   public per-item ceiling read exposed to the menu page; the arithmetic
   (`resolveProducibleUnits`) is already built and tested for exactly that caller.
2. **The register (POS) and the merchant app** place orders through their own paths and do
   not call this guard yet.
3. **Option/addon ingredients do not constrain**, per the base-recipe rule above.
4. **Tenants whose orders live in their own Supabase project** are guarded (the check runs
   before the write, on platform-held recipes) but were not exercised end to end here.
