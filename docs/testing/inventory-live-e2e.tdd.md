# TDD evidence — the live end-to-end run

**Source plan:** the gap every inventory phase since 4B has carried forward, and
the one Phase 7 named explicitly: *"the chain test mocks Supabase … needs a
tenant with real inventory."* Tenant nominated by the user: `cafejuancho`,
with an assumed recipe.

## What was actually unproven

Phases 4B–7 proved the chain with Supabase mocked at one seam or another. The
last unmocked layer was the database itself — the ledger trigger, the FK graph,
PostgREST's treatment of the update payloads, and the order those three settle
in. Three of Phase 7's bugs lived in seams precisely because nothing exercised
the assembly, so the remaining seam was worth closing.

`tests/integration/inventory-live-e2e.test.ts` drives the **real** application
entry points — `applyOrderStockBestEffort`, `reverseOrderStockBestEffort` —
against the **real** platform Supabase.

## User journeys

- As a merchant, when a customer orders the last portion, I want the stock spent
  and the dish pulled automatically, so nobody can order what I cannot make.
- As a merchant, when that order is cancelled, I want the stock back, the alert
  closed, and the dish on sale again without touching anything.

## The assumed recipe

Cafe Juancho has 65 dishes and no ingredients, so the probe supplies its own —
nothing pre-existing is read or written:

| Thing | Value |
|---|---|
| Ingredient | `E2E_PROBE_Mozzarella`, reorder level 100 |
| Opening stock | 500, entered as a `receive` movement (never written directly) |
| Dish | `E2E_PROBE_Do Not Order`, ₱1, in an inactive category |
| Recipe | base recipe on that dish, 500 g of the ingredient per portion |

One portion eats the whole shelf, so a single order crosses `ok → out` in one
movement — the crossing that raises the alert and fires auto-86.

## Safety

This writes to production, so:

- **Opt-in.** Skipped unless `RUN_LIVE_INVENTORY_E2E=1`; `npm test` reports it
  as 8 skipped. It is not in CI.
- **Nothing pre-existing is touched.** The dish it 86s is one it created. Cafe
  Juancho's own 65 dishes have no recipes, so even with the flags temporarily
  on, nothing else could deplete, alert, or be hidden.
- **Everything is reverted** in `afterAll`, including the tenant's three
  inventory flags, restored to whatever they were rather than assumed `false`.
- **Chosen because it is dormant** — 3 orders ever, none since 2026-03-02.
- **Residual exposure, stated plainly:** the probe dish is `is_available = true`
  for the ~3 seconds between seeding and auto-86 hiding it. The storefront's
  "All" view does not filter by category, so an inactive category does *not*
  hide it — I verified that in `menu-client.tsx:129` rather than assuming it.
  A visitor hitting an ISR cache miss in that window could have seen a ₱1 item
  named "Do Not Order".

## Task report

| Task | Command | Result |
|---|---|---|
| Live chain, sale → 86 → cancel → recovery | `RUN_LIVE_INVENTORY_E2E=1 npx jest tests/integration/inventory-live-e2e.test.ts` | 8/8 PASS |
| Stays out of the normal suite | `npx jest` | 8 skipped |
| No regressions | `npx jest --maxWorkers=2` | 237 suites, 2766 passed |
| Tenant restored | `mcp__supabase__execute_sql` | verified identical |

```
RUN_LIVE_INVENTORY_E2E=1 npx jest tests/integration/inventory-live-e2e.test.ts

PASS tests/integration/inventory-live-e2e.test.ts (13.602 s)
  ✓ opens with the ledger trigger having set the stock from the receive movement
  ✓ depletes the ingredient when an order is placed
  ✓ raises an out-of-stock alert for the emptied ingredient
  ✓ takes the dish off the menu and stamps it as the system doing it
  ✓ gives the ingredient back when the order is cancelled
  ✓ resolves the alert, because the cancellation cleared the reorder level
  ✓ puts the dish back on sale and releases the marker
  ✓ leaves the tenant exactly as it was found
Tests: 8 passed, 8 total
```

Commit: `3bc83c8 test: prove the inventory chain end to end against a live tenant`

This run is **verification, not a bug fix** — there is no RED for it, because
the defects it would have caught were already found and fixed in Phase 7 with
their own RED/GREEN cycles. Recording that honestly matters: test 5 ("gives the
ingredient back") and test 7 ("puts the dish back on sale") are exactly the two
Phase 7 fixed. Before `77ddece` this run would have failed on both.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `current_qty` is maintained by the DB trigger from the ledger, not written | `inventory-live-e2e.test.ts:opens with the ledger trigger having set the stock` | e2e | PASS |
| 2 | A real order writes a real movement and empties the shelf | `…:depletes the ingredient when an order is placed` | e2e | PASS |
| 3 | Crossing to empty raises an unresolved `out` alert | `…:raises an out-of-stock alert for the emptied ingredient` | e2e | PASS |
| 4 | The dish is hidden and stamped `auto_disabled_at` | `…:takes the dish off the menu and stamps it as the system doing it` | e2e | PASS |
| 5 | Cancelling restores the exact quantity the sale took | `…:gives the ingredient back when the order is cancelled` | e2e | PASS |
| 6 | Restoring past the reorder level resolves the alert | `…:resolves the alert, because the cancellation cleared the reorder level` | e2e | PASS |
| 7 | The dish returns to sale and the marker is cleared | `…:puts the dish back on sale and releases the marker` | e2e | PASS |
| 8 | The probe's footprint is exactly what it created, nothing else moved | `…:leaves the tenant exactly as it was found` | e2e | PASS |

## Post-run verification

```
cafejuancho: inventory_enabled=f low_stock_alerts_enabled=f auto_86_enabled=f
menu_items 65 | available 65 | markers 0 | ingredients 0 | units 0
movements 0 | alerts 0 | recipes 0 | categories 12
probe_leftovers_platformwide 0
```

Byte-identical to how it was found. `brewdazeexpress` — the one tenant genuinely
live on inventory — was re-checked and untouched: `Mozzarela @ 20.0000`, one
movement, flags still on.

## What went wrong on the way

**`.env.test` beats `.env.local` under Next's jest loader.** The first live run
failed every test with an opaque `TypeError: fetch failed` from undici. It reads
as a network fault; it is a config one — `.env.test` sets
`NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co` for the unit suite, so the
run was resolving a host that does not exist. Two wrong theories were tested and
discarded first (sandbox networking, and the `supabase-js` browser/node export
condition) before a diagnostic printed the URL and showed `ENOTFOUND
test.supabase.co`. The test now loads the real credentials from `.env.local`
itself, and says why in a comment so the next person does not re-derive it.

## Known gaps

- **These tests are a sequence, not independent.** Each step depends on the
  previous one, which is normally an anti-pattern. It is deliberate here: the
  thing under test *is* a journey, and splitting it would mean re-seeding a live
  tenant per assertion. Documented rather than silently accepted.
- **Still a synthetic recipe.** It proves the machinery, not that any real
  merchant's menu is costed correctly. `brewdazeexpress` remains the only tenant
  live on inventory and still has 0 recipes.
- **The POS path is not covered here.** The register posts to
  `/api/inventory/order-stock` rather than `createOrderAction`; that route has
  its own suite but no live run.
- **`low` was never exercised live.** The probe goes straight to `out`. The
  `out → low` alert correction from Phase 7 is unit-proven only.
- Manual alert dismissal and push notification remain open from 5B.
