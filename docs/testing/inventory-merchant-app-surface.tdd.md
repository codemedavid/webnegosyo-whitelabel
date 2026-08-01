# TDD Evidence — Inventory Phase 6: the merchant app shelf

**Source plan**: journeys derived during this TDD run. This closes gap #1 from
`inventory-stock-alerts-surface.tdd.md` — "the merchant app still has no alerts
surface".

**Branch**: `feat/unified-modifier-groups`

## Design decision worth recording

The web admin surfaces stock as **alerts**: rows written by
`stock-alerts-service.ts` when an ingredient *crosses* its reorder level, shown
as a banner above the inventory table. The app does something different — it
shows the **whole shelf**, healthy ingredients included, with the trouble sorted
to the top and counted in the header.

Two reasons. A merchant holding a phone is standing in front of the shelf, not
sitting at a desk reading a digest; and deriving the level from
`inventory_items` rather than reading `stock_alerts` means the screen works for
a tenant who never switched `low_stock_alerts_enabled` on — which today is all
166 of them.

The level itself is still the shared rule: `evaluateStockLevel` in
`webnegosyo-app/lib/inventory-stock.ts` mirrors `src/lib/inventory/low-stock.ts`
exactly, epsilon included. A guardrail test asserts the screen never mentions
`reorder_level`, so the comparison cannot drift into the JSX.

## User journeys

1. As a merchant in the kitchen, I want to see my whole shelf at a glance, so I
   know what to reorder before service.
2. As a merchant, I want what I cannot serve listed above what merely needs
   reordering, so I fix the worst problem first.
3. As a merchant, I want to tap "2 Out" and see those two, so the count I read
   is also the control I use.
4. As a merchant with a long ingredient list, I want to search by name, so I can
   check one ingredient without scrolling.
5. As a merchant whose connection dropped, I want to be told the read failed and
   offered a retry, rather than shown an empty shelf that looks well-stocked.

## Task report

### Task 1 — View model and navigation (pure)

Added `webnegosyo-app/lib/inventory-stock.ts` (`evaluateStockLevel`,
`buildStockViews`, `sortStockViews`, `summarizeStock`, `filterStockViews`,
`formatStockQuantity`, `stockFillRatio`, `describeStockView`) and registered an
`inventory` tab in the Products workspace, gated by the `menu` permission.

- Validation: `npx jest lib/inventory-stock.test.ts lib/workspaces.test.ts lib/staff-permissions.test.ts`
- RED: `Cannot find module './inventory-stock'` plus 4 failing registry
  assertions (`Tests: 4 failed, 20 passed`). Commit `aafe9d5`.
- GREEN: `Tests: 56 passed, 56 total`. Commit `0ed5195`.
- Guarantees: negative on-hand and NUMERIC round-trip dust both read as `out`;
  a zero reorder level never produces a `low` (a merchant who set no threshold
  did not ask to be warned); archived ingredients leave the shelf; sorting is
  worst-first then alphabetical and never mutates the caller's array; the
  headline distinguishes a healthy shelf from an empty one; search and level
  narrow together rather than instead of each other; the fill bar is exactly
  half full at the reorder line and never renders negative.

### Task 2 — Reading the shelf

Added `webnegosyo-app/lib/inventory-service.ts`: `loadInventoryStock`.

- Validation: `npx jest lib/inventory-service.test.ts`
- RED: `Cannot find module './inventory-service'`. Commit (test) after `0ed5195`.
- GREEN: `Tests: 6 passed, 6 total`.
- Guarantees: both reads are tenant-scoped; the list arrives already sorted so
  the screen never re-sorts; a failed ingredient read throws so the screen can
  offer a retry; a failed *unit* read costs the suffix, not the shelf; no query
  is issued at all before the auth store has a tenant.
- Note: this is a plain Supabase read on the merchant's own session. Inventory
  RLS is admin-scoped and the app logs in as an `app_users` admin, so no service
  role is involved — unlike the write side, which runs behind a customer order.

### Task 3 — The screen

Added `app/(main)/inventory.tsx` and `components/InventoryStockCard.tsx`;
registered the tab in `app/(main)/_layout.tsx`.

- Validation: `npx jest lib/inventory-screen-mount.test.ts`
- RED: `ENOENT ... app/(main)/inventory.tsx`. Commit (test) after Task 2.
- GREEN: `Tests: 12 passed, 12 total`.
- Guarantees: the tab is gated by `show("inventory")` like every other tab, so
  it respects both the active workspace and staff permissions; the screen waits
  for a tenant before loading; it defers to the shared rules (asserted by the
  absence of `reorder_level` in the source); pull-to-refresh, an error state
  with retry, and the workspace switcher are all present; each row carries
  `describeStockView` as its accessibility label; the bar's reorder tick is
  drawn from the same 50% anchor as `stockFillRatio`.
- Jest here only runs pure-logic roots (`lib/`, `theme/`), so these are source
  guardrails rather than renders — the same approach as the existing
  `superadmin-mount` and `workspace-switcher-mount` tests.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Negative on-hand reads as out, not as a negative amount | `inventory-stock.test.ts:calls an ingredient out when a sale landed before its delivery` | unit | PASS |
| 2 | NUMERIC round-trip dust is not mistaken for stock | `inventory-stock.test.ts:treats NUMERIC round-trip dust as nothing left` | unit | PASS |
| 3 | No reorder level means no low warning | `inventory-stock.test.ts:never calls an ingredient low when no reorder level was set` | unit | PASS |
| 4 | An unresolvable unit costs the suffix, not the row | `inventory-stock.test.ts:still shows an ingredient whose unit cannot be resolved` | unit | PASS |
| 5 | Archived ingredients leave the shelf | `inventory-stock.test.ts:leaves archived ingredients off the shelf` | unit | PASS |
| 6 | Outages sort above merely-low, then alphabetically | `inventory-stock.test.ts:puts what cannot be served above…` / `orders alphabetically within a level…` | unit | PASS |
| 7 | Sorting never mutates the caller's array | `inventory-stock.test.ts:does not mutate the list it was given` | unit | PASS |
| 8 | A healthy shelf and an empty one read differently | `inventory-stock.test.ts:says so plainly when the shelf is healthy` / `does not claim health when nothing is tracked at all` | unit | PASS |
| 9 | Search narrows within the chosen level | `inventory-stock.test.ts:applies the search within the chosen level, not instead of it` | unit | PASS |
| 10 | The bar is half full at the reorder line and never negative | `inventory-stock.test.ts:sits exactly half full at the reorder line…` / `never renders a negative bar…` | unit | PASS |
| 11 | Both reads are tenant-scoped | `inventory-service.test.ts:scopes both reads to the requesting tenant` | unit | PASS |
| 12 | A failed unit read still lists the ingredients | `inventory-service.test.ts:still lists ingredients when the unit catalog cannot be read` | unit | PASS |
| 13 | A failed ingredient read throws so the screen can retry | `inventory-service.test.ts:throws when the ingredient read fails…` | unit | PASS |
| 14 | No query is issued before a tenant is known | `inventory-service.test.ts:reads nothing at all without a tenant` | unit | PASS |
| 15 | Inventory lives in the Products view only | `workspaces.test.ts:keeps inventory beside the products it is spent on` | unit | PASS |
| 16 | The tab is gated by the menu permission | `staff-permissions.test.ts:gates orders, insights, and product tabs by permission` | unit | PASS |
| 17 | The tab respects workspace and permission gating | `inventory-screen-mount.test.ts:gates the tab through the workspace and permission check…` | unit | PASS |
| 18 | The screen never re-derives a stock level beside the JSX | `inventory-screen-mount.test.ts:derives every level from the shared rules…` | unit | PASS |
| 19 | A failed read shows an error with a retry, not an empty shelf | `inventory-screen-mount.test.ts:offers a retry when the read fails…` | unit | PASS |
| 20 | Each row is read out as a sentence by assistive technology | `inventory-screen-mount.test.ts:reads each row out as a sentence…` | unit | PASS |

## Coverage

```
File                  | % Stmts | % Branch | % Funcs | % Lines
inventory-stock.ts    |     100 |     93.1 |     100 |     100
inventory-service.ts  |     100 |       75 |     100 |     100
```

Above the 80% threshold on statements, functions and lines; the uncovered
`inventory-service.ts` branches are the `?? []` null-coalescing defaults on
Supabase responses.

Whole app suite at the time of the GREEN commit: `npx jest` → 664 passing across
41 suites, with one suite failing — `lib/backends/supabase-orders.test.ts`, a
committed RED reproducer belonging to the separate platform-Supabase
order-parity work, not to this change. `npx tsc --noEmit` reported errors only
in that same file. Re-run after that work landed its implementation:
**686 tests across 42 suites, all passing.**

## Known gaps

1. **Read-only.** The merchant can see the shelf but cannot receive stock, log
   waste, or run a stocktake from the phone. Those writes exist on the web
   (`stock-service.ts`) and would need a permission-gated mutation path here.
2. **No push.** Unchanged from Phase 5B: a merchant sees the shelf when they
   open the tab, not when an ingredient crosses its line.
3. **Open `stock_alerts` rows are still unread by the app.** The level is
   derived live, which is why the screen works with alerts switched off; the
   cost is that "flagged since 9am" is not shown.
4. **Still no end-to-end proof.** Production has zero `inventory_items` rows, so
   this screen has never rendered a real ingredient. It is verified against unit
   tests and source guardrails only, not against a live tenant.
5. **Not rendered in tests.** The app's Jest config runs pure-logic roots only,
   so layout and styling are asserted structurally; visual correctness still
   needs a manual Expo pass.
