# TDD Evidence — Convex-backed Superadmin Analytics

**Branch:** `feat/superadmin-convex-analytics`
**Source plan:** inline `/ecc:plan` output (this session) — no `*.plan.md` file.

## Problem

Orders are dual-written per tenant (`src/app/actions/orders.ts:321`): tenants with
`convex_deployment_url` + `convex_deploy_key` route orders to **Convex only**;
everyone else to the Supabase `orders` table. The superadmin dashboard read
**only Supabase**, so every Convex-backed (actually-active) restaurant contributed
zero to platform GMV/orders and the leaderboard — the numbers looked fake.

## Fix

Read from both backends and merge:
1. List all tenants (service role) → split Convex vs Supabase (`loadTenantDirectory`).
2. Aggregate Supabase orders for Supabase-only tenants.
3. Fan out to each Convex deployment (`fetchConvexAggregates`) for the rest.
4. Merge into one platform view (`buildPlatformAnalytics`), GMV/orders excluding
   cancelled to match Convex semantics. Leaderboard ranked by order activity.

## User journeys

- As a superadmin, I see platform GMV/orders/AOV that include Convex-backed
  restaurants, not just Supabase ones.
- As a superadmin, the "most active restaurants" leaderboard ranks tenants by real
  order volume pulled from their Convex deployments.
- As a superadmin, one broken/slow tenant deployment does not blank the dashboard.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Range → current/previous time windows (7d/30d/90d/all) | `platform-analytics-merge.test.ts › rangeToWindows` | unit | PASS |
| 2 | Convex responses map to a normalized aggregate (orders/gmv/completed/cancelled/daily/breakdown/prev) | `… › convexResponsesToAggregate` | unit | PASS |
| 3 | Supabase rows aggregate per tenant, exclude cancelled from GMV/orders, exclude Convex tenants, compute prev window | `… › rowsToTenantAggregates` | unit | PASS |
| 4 | KPIs/deltas/time-series/breakdowns/leaderboard merge across sources; monthly rollup for 90d/all; leaderboard ranked by activity, top 8 | `… › buildPlatformAnalytics` | unit | PASS |
| 5 | Fan-out returns one aggregate/tenant, authenticates with tenant key, correct window args | `convex-platform-aggregator.test.ts` | unit | PASS |
| 6 | No previous-window query for 'all'; breakdown skipped when not needed | `…aggregator › all range / needBreakdown` | unit | PASS |
| 7 | Failing tenant → zero aggregate, others survive; slow tenant → timeout to zero | `…aggregator › degrades …` | unit | PASS |

## Validation commands & output

RED (before implementation):
```
$ npx jest tests/unit/platform-analytics-merge.test.ts
Cannot find module '@/lib/queries/platform-analytics-merge'  → Test Suites: 1 failed
$ npx jest tests/unit/convex-platform-aggregator.test.ts
Cannot find module '@/lib/queries/convex-platform-aggregator' → Test Suites: 1 failed
```

GREEN (after implementation):
```
$ npx jest tests/unit/platform-analytics-merge.test.ts tests/unit/convex-platform-aggregator.test.ts
Tests: 33 passed, 33 total
```

Full suite (no regressions from this change):
```
$ npx jest
Test Suites: 1 failed, 101 passed, 102 total
Tests: 1417 passed, 1417 total
```
The single failing suite — `webnegosyo-app/lib/order-item-images.test.ts` — is a
pre-existing mock-hoisting bug in the mobile app (last touched in commit 234c495),
unrelated to this change (which only touches `src/lib/queries/` + one superadmin
component).

Typecheck / lint:
```
$ npx tsc --noEmit        # no errors in changed files
$ npx eslint <4 query modules + component>   # clean
```

## Coverage (new modules)

```
File                           | % Stmts | % Branch | % Funcs | % Lines
platform-analytics-merge.ts    |   98.95 |   82.55  |   100   |  98.95
convex-platform-aggregator.ts  |   100   |   90     |   83.33 |  100
```

## Known gaps / follow-ups

- The I/O shells (`platform-analytics-server.ts`, `tenant-metrics-server.ts`) are
  covered by typecheck/lint + the pure-module tests they delegate to, not by
  dedicated integration tests (heavy Supabase/Convex mocking, low value).
- Convex queries cap at `QUERY_LIMIT = 10000` orders per tenant per window —
  ample at current volume; a consolidated per-tenant Convex aggregate query would
  remove the cap and cut fan-out calls if tenant/volume scale grows.
- Convex-tenant `lastOrderAt` is approximated from the latest daily trend bucket
  (date granularity), since the period stats query doesn't return a timestamp.
