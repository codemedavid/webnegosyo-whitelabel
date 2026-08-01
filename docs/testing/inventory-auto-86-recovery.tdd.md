# TDD evidence — Phase 5C: auto-86 recovery

**Source plan:** inline plan agreed in session (next-tasks review of the
inventory build). Pilot tenant nominated by the user: `cafejuancho`.

## The gap this closes

Phase 5B could take a menu item off the menu when a base-recipe ingredient ran
out. Nothing ever put it back. `stock-alerts-service.ts` said so in a comment —
"deliberately one-way: un-86 stays a manual decision" — but the consequence in
practice was worse than the flapping it avoided:

1. The ingredient runs out → the dish is hidden, an alert is raised.
2. The merchant restocks → **the same movement auto-resolves the alert**, since
   recovery to `ok` closes open alerts.
3. The dish is still hidden, and the one screen that would have explained why
   is now empty.

So the merchant is left with a silently missing bestseller and no signal.

## User journeys

- As a merchant, when I restock an ingredient, I want the dishes that were
  hidden because it ran out to go back on sale, so I stop losing orders on
  something I have already fixed.
- As a merchant, I want a dish **I** turned off to stay off, so a delivery
  never puts something back on sale against my decision.
- As a merchant, when a dish needs two ingredients, I want it to stay off until
  **both** are back, so customers cannot order what I still cannot make.

## Why a new column was needed

`is_available = false` means the same thing whether auto-86 hid the item or the
merchant did. Re-enabling without knowing which is which would override the
merchant's own decision — a worse failure than leaving an auto-86'd item
hidden. Migration `20260729120000_menu_items_auto_disabled_at.sql` adds the
marker: set when auto-86 hides an item, cleared when it goes back on.

Ownership is enforced **inside the UPDATE** (`... AND auto_disabled_at IS NOT
NULL`), not by reading first and writing after, so a merchant toggling
availability between the two statements cannot have their choice overwritten.

## Task report

| Task | Summary | Command | Result |
|---|---|---|---|
| Pure re-enable rule | `resolveMenuItemsToReEnable` — mirror of the disable rule, asking whether EVERY base ingredient is stocked rather than whether ANY ran out | `npx jest tests/unit/inventory-auto-86.test.ts` | RED (not a function) → GREEN |
| Marker on disable | Disable stamps `auto_disabled_at` and skips items already unavailable | `npx jest tests/unit/inventory-stock-alerts-service.test.ts` | RED → GREEN |
| Recovery wiring | `applyAuto86Recovery` in `processStockLevelChanges`, gated on the same `auto_86_enabled` flag | same | RED (`menuItemsReEnabled` undefined) → GREEN |
| Live schema probe | Marker semantics against Cafe Juancho, in a rolled-back transaction | `mcp__supabase__execute_sql` | 9/9 PASS |

### RED evidence

```
npx jest tests/unit/inventory-auto-86.test.ts tests/unit/inventory-stock-alerts-service.test.ts
Tests:       16 failed, 19 passed, 35 total

● resolveMenuItemsToReEnable › brings back a menu item whose only base ingredient is stocked again
  TypeError: (0 , _auto86.resolveMenuItemsToReEnable) is not a function
● processStockLevelChanges — auto-86 › does not claim an item the merchant had already turned off
  Expected value: ["is_available", true]
  Received array: [["tenant_id", "t1"]]
● processStockLevelChanges — auto-86 recovery › brings a menu item back when its ingredient is restocked
  Expected: ["menu-1"]   Received: undefined
```

Commit: `134dd8d test: add reproducer for auto-86 never bringing an item back after restock`

### GREEN evidence

```
npx jest tests/unit/inventory-auto-86.test.ts tests/unit/inventory-stock-alerts-service.test.ts
Tests:       35 passed, 35 total

npx jest --testPathPatterns="inventory|stock"
Test Suites: 31 passed, 31 total
Tests:       292 passed, 292 total
```

Commit: `d87ba8f feat: bring auto-86'd menu items back when their ingredients are restocked`

One 5B test was **replaced, not deleted**: `never re-enables a menu item when
stock comes back` asserted the old one-way spec. Phase 5C reverses that
decision, so the assertion was rewritten to the new spec rather than left
passing against behaviour we no longer want.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A dish comes back when its only base ingredient is restocked | `inventory-auto-86.test.ts:brings back a menu item whose only base ingredient is stocked again` | unit | PASS |
| 2 | A dish stays off while another base ingredient is still out | `inventory-auto-86.test.ts:leaves a menu item off while another base ingredient is still out` | unit | PASS |
| 3 | A dish comes back once every base ingredient is stocked | `inventory-auto-86.test.ts:brings back a menu item once every base ingredient is stocked` | unit | PASS |
| 4 | Recovering an option-only ingredient re-enables nothing (only a base recipe can 86, so only a base recipe can un-86) | `inventory-auto-86.test.ts:ignores a recovery that only a variation option needed` | unit | PASS |
| 5 | Every dish sharing the restocked ingredient comes back | `inventory-auto-86.test.ts:brings back every menu item sharing the restocked ingredient` | unit | PASS |
| 6 | A prep recipe names no menu item to bring back | `inventory-auto-86.test.ts:ignores a prep recipe, which names no menu item to bring back` | unit | PASS |
| 7 | Disabling stamps the item as auto-disabled | `inventory-stock-alerts-service.test.ts:stamps the item as auto-disabled so it can be told apart later` | unit | PASS |
| 8 | Disabling never claims an item the merchant had already turned off | `inventory-stock-alerts-service.test.ts:does not claim an item the merchant had already turned off` | unit | PASS |
| 9 | Restocking brings the dish back and clears the marker | `inventory-stock-alerts-service.test.ts:brings a menu item back when its ingredient is restocked` | unit | PASS |
| 10 | Ownership is filtered in the UPDATE, not read-then-write | `inventory-stock-alerts-service.test.ts:only brings back items this system disabled itself` | unit | PASS |
| 11 | Recovery does nothing for a tenant with auto-86 off | `inventory-stock-alerts-service.test.ts:leaves the menu alone on recovery when auto-86 is switched off` | unit | PASS |
| 12 | Nothing is reported when the UPDATE matched no marked row | `inventory-stock-alerts-service.test.ts:reports nothing when the update matched no auto-disabled row` | unit | PASS |
| 13 | A second still-empty base ingredient keeps the dish off, reading the untouched ingredient from the DB but trusting the applied delta for the one that just moved | `inventory-stock-alerts-service.test.ts:keeps a dish off the menu while a second base ingredient is still out` | unit | PASS |

## Live probe — Cafe Juancho (`f277633b-2c58-47b8-a68f-9fa00ef12b94`)

Run through `mcp__supabase__execute_sql` inside `BEGIN … ROLLBACK`. Cafe
Juancho has 65 live menu items and, before and after, **zero** inventory rows.

| # | Step | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | Trigger maintains `current_qty` from the ledger | 500 / 500 | 500 / 500 | PASS |
| 2 | The sale empties the flour | 0 | 0 | PASS |
| 3 | Auto-86 claims only the live dish | Probe Dish | Probe Dish | PASS |
| 4 | The merchant-hidden dish carries no marker | unclaimed | unclaimed | PASS |
| 5 | Recovery brings back only what auto-86 hid | Probe Dish | Probe Dish | PASS |
| 6 | The merchant-hidden dish is still hidden | hidden | hidden | PASS |
| 7 | Recovery clears the marker so a later manual hide sticks | cleared | cleared | PASS |
| 8 | A repeat recovery matches nothing | 0 | 0 | PASS |
| 9 | The partial index exists for the marker lookup | yes | yes | PASS |

Post-rollback verification — nothing leaked:

```
menu_items 65 | available 65 | marked_anywhere 0 | ingredients 0 | movements 0 | probe_rows 0
```

`marked_anywhere` is platform-wide, not tenant-scoped: no row in any tenant
carries the new marker.

## Migration

`20260729120000_menu_items_auto_disabled_at.sql` — **APPLIED 2026-07-27** via
MCP as `menu_items_auto_disabled_at`. Verified in
`information_schema`: `timestamp with time zone`, nullable. Additive and
reversible; rollback block in the file. Remote migration versions are renamed,
so the local list was diffed by NAME against `list_migrations` before applying.

## Coverage

```
npx jest --testPathPatterns="inventory|stock" --coverage \
  --collectCoverageFrom="src/lib/inventory/{auto-86,stock-alerts-service,low-stock}.ts"

File                     | % Stmts | % Branch | % Funcs | % Lines
auto-86.ts               |     100 |    96.42 |     100 |     100
low-stock.ts             |     100 |      100 |     100 |     100
stock-alerts-service.ts  |     100 |    85.91 |     100 |     100
```

Uncovered branches are the `?? []` / `=== true` defensive defaults on Supabase
responses.

## Known gaps

- **No end-to-end run through application code.** The probe proves the schema
  and the SQL the service issues; it does not exercise
  `processStockLevelChanges` against a live tenant. That still needs a tenant
  with real `inventory_items` — Cafe Juancho has none, and platform-wide there
  are still zero. Both tenant flags remain `false` for Cafe Juancho, so nothing
  in this phase is live for it.
- **No merchant-facing signal that a dish was auto-hidden.** The marker exists
  in the database but no screen reads it. A merchant still cannot tell an
  auto-86'd dish from one they hid themselves. Worth a badge on the admin menu
  list and the merchant app.
- Manual dismissal of alerts and push notification of alerts remain open from
  5B.
