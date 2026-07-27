# TDD evidence — Phase 7: integration, RLS, and three seam bugs

**Source plan:** inline plan agreed in session (`5C → 7 → 8 → 9 → 10`). Phase 7
was scoped as "integration + RLS + E2E".

## What changed about the situation

Phase 5C closed with "production has ZERO `inventory_items` rows". That is no
longer true. **`brewdazeexpress` is live on inventory** — the first tenant with
all three flags on:

```
slug=brewdazeexpress  inventory_enabled=t  low_stock_alerts_enabled=t  auto_86_enabled=t
ingredient: Mozzarela, 20 on hand, reorder_level 0, received 2026-07-27 05:43
recipes: 0   components: 0   menu_items: 51
```

Platform-wide: 1 of 166 tenants has any inventory flag on. They have no recipes
yet, so nothing is wired to a dish and no depletion, alert, or 86 can fire — but
`auto_86_enabled` is already on, so the moment they add a recipe the paths below
go live for a real shop. That is what made Phase 7 worth doing before Phase 8.

## User journeys

- As a merchant, when I cancel an order, I want the dishes it took off the menu
  to come back, so a cancellation does not silently cost me the rest of the
  night's sales.
- As a merchant, when a delivery arrives that is smaller than I ordered, I want
  to be able to sell the dish again — I can cook it — while still being told to
  reorder.
- As a merchant, I want the alert banner to describe the shelf as it is now, not
  as it was when the alert was raised.
- As a merchant of one tenant, I must never see or touch another tenant's stock.

## The three bugs, and why nothing caught them

All three lived in **module seams**, and every existing suite mocked across the
seam it needed to see:

- the wiring tests stub `processStockLevelChanges`
- the service tests stub the depletion that calls it
- the reversal tests stub both

So each module was correct on its own and the assembly was not. The fourth
commit below adds the test that runs the real chain.

### 1. A cancelled order never reached the alert path

`reverseOrderStockMovements` wrote the restoring ledger rows and returned. It
never called the alert path — unlike depletion and unlike manual movements.

Every real cancellation goes through it: `orders-service.ts` on a status change,
`/api/inventory/order-stock` from the merchant app, and `restoreOrderStock` on
the web admin. So an order that emptied an ingredient hid the dish, and
cancelling that order put every gram back while leaving the dish hidden and the
alert open.

### 2. Auto-86 and its recovery disagreed on where the line is

Auto-86 fires on `out` and nothing else. Recovery was gated on reaching `ok`.
A delivery landing below the reorder level therefore returned the ingredient to
the kitchen and left the dish hidden — cookable, unorderable, with the banner
saying only "low" and nothing anywhere saying the dish was off.

Fixed by **splitting the question, not loosening the threshold**: availability
asks "can this be made?", the alert asks "should more be ordered?". A partial
delivery answers only the first, so the dish returns and the alert stays open.

### 3. An open alert went stale and told the merchant something untrue

An alert row snapshots `level` and `quantity` when raised, and nothing revised
it. After bug 2 was fixed the dish came back — but the banner still read
**"Flour is out of stock"** over a shelf with 10 g on it, because
`describeStockAlert` renders the stored level.

Fixed by rewriting `out` → `low` on the open row. Deliberately narrow: a
downward move is a crossing and raises its own alert; reaching `ok` resolves
rather than rewrites.

## Task report

| Task | Command | Result |
|---|---|---|
| RLS on `stock_alerts` / `stock_movements` | `mcp__supabase__execute_sql`, `BEGIN … ROLLBACK` | 9/9 PASS |
| Cancellation reaches the alert path | `npx jest tests/unit/inventory-stock-alerts-wiring.test.ts` | RED (0 calls) → GREEN |
| Recovery threshold matches the disable threshold | `npx jest tests/unit/inventory-stock-alerts-service.test.ts` | RED (`[]` vs `['menu-1']`) → GREEN |
| Whole chain, only the DB mocked | `npx jest tests/unit/inventory-alerts-integration.test.ts` | 4 PASS (found bug 3) |
| Stale open alert corrected | `npx jest tests/unit/inventory-stock-alerts-service.test.ts` | RED (no update) → GREEN |
| Superadmin flag toggles | `npx jest tests/unit/tenant-inventory-flags.test.ts` | already covered — see below |

**Correction to the 5B/5C notes:** those recorded the superadmin inventory flag
toggles as "untested form plumbing". They are not —
`tests/unit/tenant-inventory-flags.test.ts` covers the schema parse and all four
write sites. That Phase 7 item was already done.

### RED / GREEN evidence

```
# bug 1
npx jest tests/unit/inventory-stock-alerts-wiring.test.ts
● cancellation restore reaches the alert path › reports the pre-restore ingredients …
  Expected number of calls: 1
  Received number of calls: 0
Tests: 2 failed, 8 passed, 10 total          → 10 passed, 10 total

# bug 2
npx jest tests/unit/inventory-stock-alerts-service.test.ts
● … › brings the dish back, because an ingredient that is merely low can still be cooked
  - Array [ "menu-1" ]   + Array []
Tests: 1 failed, 21 passed, 22 total         → 22 passed, 22 total

# bug 3
● … › corrects the open alert from 'out' to 'low' instead of leaving it stale
  Received has value: undefined
Tests: 1 failed, 22 passed, 23 total         → 23 passed, 23 total

# regression
npx jest --testPathPatterns="inventory|stock|order"
Test Suites: 53 passed, 53 total
Tests:       633 passed, 633 total
```

Commits (all on `feat/platform-supabase-order-parity`):

| Stage | Commit |
|---|---|
| RED | `7f0cc40 test: add reproducer for cancellation restore never reaching the alert path` |
| GREEN | `77ddece fix: report a cancelled order's restored stock to the alert path` |
| RED | `90d5ab2 test: add reproducer for a partially restocked dish staying auto-86'd` |
| GREEN | `93258eb fix: bring a dish back as soon as its ingredient is no longer empty` |
| harness | `3d6aa58 test: run the whole alert chain with only the database mocked` |
| RED | `ed1f3cb test: add reproducer for an open alert going stale after a partial delivery` |
| GREEN | `3fdfae1 fix: correct an open alert that a partial delivery has made untrue` |

Two assertions written earlier in this run were **tightened, not deleted**: both
said "the alert row is never written", conflating *not resolved* with *not
touched*. Bug 3's fix writes a correction, so they now assert the absence of
`resolved_at` specifically.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A cancellation reports its restored ingredients and positive deltas to the alert path | `inventory-stock-alerts-wiring.test.ts:reports the pre-restore ingredients and the deltas the cancellation gave back` | unit | PASS |
| 2 | Deltas are summed when the sale recorded one ingredient on several lines | `…:sums the deltas when the sale recorded one ingredient on several lines` | unit | PASS |
| 3 | No alert run when there was no sale to reverse | `…:does not run the alert path when there was no sale to reverse` | unit | PASS |
| 4 | No alert run when the order was already restored | `…:does not run the alert path when the order was already restored` | unit | PASS |
| 5 | The restoring movements are still written when alerting throws | `…:still records the restoring movements when the alert path throws` | unit | PASS |
| 6 | A partial restock brings the dish back, because a low ingredient can still be cooked | `inventory-stock-alerts-service.test.ts:brings the dish back, because an ingredient that is merely low can still be cooked` | unit | PASS |
| 7 | A partial restock does not resolve the alert | `…:leaves the low-stock alert open, because the merchant still needs to reorder` | unit | PASS |
| 8 | A partial restock corrects the open alert to `low` with the real quantity | `…:corrects the open alert from 'out' to 'low' instead of leaving it stale` | unit | PASS |
| 9 | A delivery clearing the reorder level still resolves the alert | `…:still resolves the alert once the delivery clears the reorder level` | unit | PASS |
| 10 | Selling the last portion writes the ledger row, raises an `out` alert, and stamps the dish auto-disabled | `inventory-alerts-integration.test.ts:records the depletion, raises an alert, and takes the dish off the menu` | integration | PASS |
| 11 | A sale that only makes an ingredient low never touches the menu | `…:leaves the menu alone when the sale only makes the ingredient low` | integration | PASS |
| 12 | Cancelling returns the stock, puts the dish back, and corrects (not resolves) the alert | `…:gives the flour back and puts the dish on sale again, alert still open` | integration | PASS |
| 13 | A repeated cancellation touches nothing | `…:does not touch the menu when the order was already restored` | integration | PASS |
| 14 | A tenant admin sees only their own alerts and movements | live RLS probe | integration | PASS |
| 15 | A tenant admin cannot write or resolve another tenant's alerts | live RLS probe | integration | PASS |
| 16 | An anonymous visitor sees no alerts or movements and cannot insert | live RLS probe | integration | PASS |

## Live RLS probe

Run through `mcp__supabase__execute_sql` inside `BEGIN … ROLLBACK`, using two
**real** tenants and their real admin users rather than synthetic ones, so the
policies are exercised against the same `app_users` rows production uses.

Tenant A = `acir-cafe`, Tenant B = `aling-lydia-tapsilogan`.

| # | Step | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | Admin sees own-tenant alerts | 1 | 1 | PASS |
| 2 | Admin sees NO other-tenant alerts | 0 | 0 | PASS |
| 3 | Admin sees own-tenant movements | 1 | 1 | PASS |
| 4 | Admin sees NO other-tenant movements | 0 | 0 | PASS |
| 5 | Admin cannot insert an alert for another tenant | BLOCKED | BLOCKED (42501) | PASS |
| 6 | Admin cannot resolve another tenant's alert | 0 rows | 0 rows | PASS |
| 7 | Anon sees no alerts | 0 | 0 | PASS |
| 8 | Anon sees no movements | 0 | 0 | PASS |
| 9 | Anon cannot insert an alert | BLOCKED | BLOCKED (42501) | PASS |

Post-rollback verification — nothing leaked:

```
stock_alerts 0 | probe inventory_units 0 | inventory_units 12 (unchanged)
```

The only surviving `inventory_items` / `stock_movements` rows are
`brewdazeexpress`'s real Mozzarela, which predates the probe.

RLS is enabled on all five inventory tables; `relforcerowsecurity` is false
everywhere, which is why the service-role write path works as designed.

## Coverage

```
npx jest --testPathPatterns="inventory|stock|order" --coverage \
  --collectCoverageFrom="src/lib/inventory/{stock-alerts-service,order-stock-service,auto-86,low-stock}.ts"

File                     | % Stmts | % Branch | % Funcs | % Lines
All files                |   97.84 |    83.25 |   95.65 |   97.84
 auto-86.ts              |     100 |    96.42 |     100 |     100
 low-stock.ts            |     100 |      100 |     100 |     100
 order-stock-service.ts  |   93.63 |    70.42 |   83.33 |   93.63
 stock-alerts-service.ts |     100 |    86.36 |     100 |     100
```

`order-stock-service.ts`'s uncovered branches are the skip-and-report paths for
an unresolvable unit and a cross-dimension conversion, both already covered
behaviourally in `inventory-order-stock-guards.test.ts` against a different
entry point.

## Known gaps

- **Still no run against a live tenant's real data.** The RLS probe is real; the
  chain test mocks Supabase. `brewdazeexpress` has an ingredient but no recipes,
  so there is still nothing on the platform that connects a dish to stock. A
  true end-to-end pass needs their recipes, or a deliberately seeded tenant —
  not something to create inside a live storefront without asking.
- **No screen reads `auto_disabled_at`** (carried over from 5C). A merchant
  still cannot tell an auto-hidden dish from one they hid themselves. This is
  now the most valuable remaining gap: three of this phase's bugs were about
  dishes silently off the menu, and a badge is what makes that visible.
- **`brewdazeexpress` has `reorder_level = 0`** on their only ingredient, so
  `low` can never fire for them — only `out`. Their configuration, not a bug,
  but it means the `low` paths above are unexercised in production.
- Manual dismissal of alerts and push notification remain open from 5B.
- Phase 8 (customer mobile app option-aware depletion) is untouched.
