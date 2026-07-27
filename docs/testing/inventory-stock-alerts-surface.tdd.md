# TDD Evidence — Inventory 5B follow-up: surfacing stock alerts

**Source plan**: journeys derived during this TDD run. This closes gap #1 from
`inventory-low-stock-alerts.tdd.md` — "`stock_alerts` rows are written but no
web admin or merchant app view reads them".

**Branch**: `feat/unified-modifier-groups`

## User journeys

1. As a merchant opening the inventory page, I want to see straight away which
   ingredients need attention, so that I can reorder before service suffers.
2. As a merchant, I want the ingredients I cannot serve at all listed above the
   ones merely running low, so that I fix the worst problem first.
3. As a merchant on a day when nothing is wrong, I want no alert clutter at all,
   so that the banner means something when it does appear.
4. As a merchant, I want alerts phrased as sentences naming the ingredient and
   the amount left, so that I do not have to interpret raw numbers or ids.

## Task report

### Task 1 — Ordering and wording (pure)

Added `src/lib/inventory/stock-alerts-view.ts`: `sortStockAlerts`,
`summarizeStockAlerts`, `describeStockAlert`. Pure, so the web admin and the
merchant app order and word the same list identically.

- Validation: `npx jest tests/unit/inventory-stock-alerts-view.test.ts`
- RED: `Cannot find module '../../src/lib/inventory/stock-alerts-view'`.
  Commit `f373153`.
- GREEN: `Tests: 15 passed, 15 total`. Commit `859dcc9`.
- Guarantees: exhausted outranks low, and level outranks age, so a fresh outage
  beats an old warning; the input array is never mutated (the caller holds it in
  React state); an exhausted ingredient is described without a quantity, so
  neither "0 kg left" nor a negative amount is ever shown; NUMERIC round-trip
  zeros are trimmed; an ingredient with no unit still reads correctly.

### Task 2 — Reading open alerts (service)

Added `src/lib/inventory/stock-alerts-read.ts`: `getOpenStockAlerts`, resolving
alert rows to ingredient names and unit abbreviations.

- Validation: `npx jest tests/unit/inventory-stock-alerts-read.test.ts`
- RED: `Cannot find module '../../src/lib/inventory/stock-alerts-read'`.
  Commit `6bddff8`.
- GREEN: `Tests: 8 passed, 8 total`. Commit `3bbe8b8`.
- Guarantees: only unresolved alerts for the requesting tenant are read; no
  ingredient read happens when there are no alerts; a dangling alert whose
  ingredient was deleted is skipped rather than rendered nameless; an
  unresolvable unit costs the suffix, not the alert; a failed read returns an
  empty list rather than taking the inventory page down.
- Note: this read deliberately uses the **RLS-enforcing** server client, unlike
  the write side (`stock-alerts-service.ts`), which needs the service role
  because it runs behind a customer order with no admin session.

### Task 3 — The banner (UI)

Added `src/components/admin/stock-alerts-banner.tsx` and rendered it on
`/[tenant]/admin/inventory`.

- Validation: `npx jest tests/unit/inventory-stock-alerts-banner.test.tsx`
- RED: `Cannot find module '../../src/components/admin/stock-alerts-banner'`.
  Commit `0c94380`.
- GREEN: `Tests: 5 passed, 5 total`. Commit `74a87c5`.
- Guarantees: renders an empty DOM when there is nothing wrong; shows a counting
  headline; names every ingredient needing attention; lists outages first;
  exposes `role="status"` (not `role="alert"`) so assistive technology announces
  it at the next natural pause instead of interrupting a merchant mid-service.
- The page needs no feature-flag check of its own: when a tenant has alerts
  switched off nothing writes them, so the list is empty and the banner is
  absent.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Exhausted ingredients sort above merely-low ones | `inventory-stock-alerts-view.test.ts:puts exhausted ingredients above merely-low ones` | unit | PASS |
| 2 | Level outranks age, so a fresh outage beats an old warning | `inventory-stock-alerts-view.test.ts:orders by level before age…` | unit | PASS |
| 3 | Sorting never mutates the caller's array | `inventory-stock-alerts-view.test.ts:does not mutate the list it was given` | unit | PASS |
| 4 | An exhausted ingredient is never described with a quantity | `inventory-stock-alerts-view.test.ts:says an exhausted ingredient is out, without a quantity` | unit | PASS |
| 5 | Negative stock reads as "out", not as a negative amount | `inventory-stock-alerts-view.test.ts:describes negative stock as out…` | unit | PASS |
| 6 | An ingredient with no unit still reads correctly | `inventory-stock-alerts-view.test.ts:reads correctly when the ingredient has no unit to show` | unit | PASS |
| 7 | Only unresolved alerts for the requesting tenant are read | `inventory-stock-alerts-read.test.ts:asks only for unresolved alerts belonging to the tenant` | unit | PASS |
| 8 | No ingredient read happens when there are no alerts | `inventory-stock-alerts-read.test.ts:does not read ingredients when there are no alerts to resolve` | unit | PASS |
| 9 | An alert whose ingredient was deleted is skipped | `inventory-stock-alerts-read.test.ts:skips an alert whose ingredient has been deleted` | unit | PASS |
| 10 | An unresolvable unit costs the suffix, not the alert | `inventory-stock-alerts-read.test.ts:still names an ingredient whose unit cannot be resolved` | unit | PASS |
| 11 | A failed alert read does not take the inventory page down | `inventory-stock-alerts-read.test.ts:returns nothing rather than throwing when the read fails` | unit | PASS |
| 12 | The banner renders nothing when nothing is wrong | `inventory-stock-alerts-banner.test.tsx:renders nothing at all when there are no open alerts` | unit | PASS |
| 13 | The banner names every ingredient needing attention | `inventory-stock-alerts-banner.test.tsx:names every ingredient that needs attention` | unit | PASS |
| 14 | The banner lists outages first | `inventory-stock-alerts-banner.test.tsx:lists exhausted ingredients before merely-low ones` | unit | PASS |
| 15 | The banner announces without stealing focus | `inventory-stock-alerts-banner.test.tsx:announces itself to assistive technology without stealing focus` | unit | PASS |

## Coverage

```
File                      | % Stmts | % Branch | % Funcs | % Lines
stock-alerts-view.ts      |     100 |      100 |     100 |     100
stock-alerts-read.ts      |     100 |       80 |     100 |     100
stock-alerts-banner.tsx   |     100 |      100 |     100 |     100
```

Above the 80% threshold on every axis. The uncovered `stock-alerts-read.ts`
branches are null-coalescing defaults on Supabase responses.

Whole-suite regression: `npx jest` → **224 suites, 2582 tests, all passing**.
`npx tsc --noEmit` → no errors in production files. `npx eslint` on every
changed file → clean.

## Known gaps

1. **The merchant app still has no alerts surface.** `stock-alerts-view.ts` was
   written pure precisely so the app can reuse it, but the Products view was not
   touched. That remains Phase 6.
2. **No push notification.** A merchant sees alerts when they open the inventory
   page, not when the crossing happens. Push would mean a per-tenant Convex
   schema redeploy, still deliberately deferred.
3. **No manual dismiss.** Alerts close only when stock recovers to `ok`. A
   merchant who has ordered more but not yet received it cannot silence one.
4. **Still no end-to-end proof.** Production has zero `inventory_items` rows, so
   no real alert has ever been raised or rendered.
