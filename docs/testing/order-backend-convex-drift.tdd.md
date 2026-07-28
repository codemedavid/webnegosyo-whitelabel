# TDD evidence — Convex orders invisible on the web admin ("needs Convex setup")

**Source plan:** none. Journeys were derived during this TDD run from the reported bug
on the `coffee-mode` tenant.

## The bug

`Coffee Mode` (slug `coffee-mode`, id `7b729aee-…`) has a working Convex deployment
(`https://robust-bass-874.convex.cloud`) with a deploy key, but its `order_backend`
column read `platform`.

Two code paths disagreed about where its orders live:

| Path | How it routed | Result |
|---|---|---|
| Checkout write — `src/app/actions/orders.ts:463` | `if (convex_deployment_url && convex_deploy_key)` | orders written to **Convex** |
| Web admin read — `resolveOrderBackend` (`src/lib/order-backend.ts`) | honored the explicit `order_backend = 'platform'` | read the **shared platform DB**, found nothing, rendered the "Real-time order management … requires Convex setup" banner |

No orders were lost. Verified live:

```
$ curl -s -X POST https://robust-bass-874.convex.cloud/api/query \
    -d '{"path":"orders:getRealtimeQueue","args":{},"format":"json"}'
{"status":"success","value":{"pending":[{"orderType":"Dine In","total":115.0,…},
                                        {"orderType":"Dine In","total":110.0,…},
                                        {"orderType":"Pick Up","customerName":"John clifford gutierrez",…}], …}}

-- shared platform DB, same tenant
select count(*) from orders where tenant_id = '7b729aee-a440-457d-a0bc-eb90f2016573';
-- 0
```

**Why the column was stale:** the `20260721000000_order_backend` migration backfilled
`convex` correctly, but nothing in `createTenantAction` / `updateTenantAction` ever
writes `order_backend`. Every tenant given a Convex deployment *after* that migration
ran kept the `platform` column default. Four tenants were affected — `coffee-mode`,
`kk-cup`, `gungjeon-unlimited`, `kastelli-di-angelis` (all created 2026-07-25…07-28).

## User journeys

1. As a merchant with a Convex deployment, I want the web Orders page to show the same
   orders my mobile app receives, so I don't think orders are missing.
2. As a superadmin, I want saving a tenant's Convex URL to configure its order routing,
   so I don't have to remember a second hidden column.
3. As a superadmin, I want an explicit per-tenant Supabase selection to survive an
   unrelated tenant edit, so a merchant's orders are never rerouted by accident.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Reproduce | New test asserts `resolveOrderBackend` returns `convex` for the exact Coffee Mode row | `npx jest tests/unit/order-backend-convex-drift.test.ts` | **RED** — `Expected: "convex" / Received: "platform"`, 7 failed / 2 passed |
| Fix resolver | `platform` is a fallback, not an explicit selection; a present Convex URL wins | `npx jest tests/unit/order-backend-convex-drift.test.ts tests/unit/order-backend.test.ts` | **GREEN** — 28 passed |
| Stop the drift | `orderBackendForSave` stamps the column on tenant create/update; update reads the current row first so `supabase` is never demoted | same as above | **GREEN** |
| Refactor | Checkout Convex branch now routes on `resolveOrderBackend` + `assertOrderBackendReady`, so read and write share one rule | `npx jest` | **GREEN** — 267 suites, 3275 passed, 8 skipped |
| Repair live data | Migration `20260728140000` aligns the 4 drifted rows | `select … where convex_deployment_url <> '' and order_backend <> 'convex'` | `[]` (was 4); convex tenants 45 → 49 |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A tenant whose column says `platform` but has Convex credentials resolves to `convex`, so admin reads hit the DB checkout wrote to | `order-backend-convex-drift.test.ts:routes reads to convex when the column still says platform` | unit | PASS |
| 2 | Resolution is never `platform` while Convex credentials are present (read/write agreement) | `…:never resolves to platform while convex credentials are present` | unit | PASS |
| 3 | A tenant with no Convex URL still resolves to `platform` (no regression for the 120 platform tenants) | `…:still resolves to platform for a tenant with no convex url` | unit | PASS |
| 4 | An explicit `supabase` selection wins over a lingering Convex URL | `…:keeps an explicit supabase selection even if a stale convex url lingers` | unit | PASS |
| 5 | Saving a Convex URL stamps `order_backend = 'convex'` | `…:stamps convex when the tenant form saves a convex deployment url` | unit | PASS |
| 6 | Saving a tenant with no per-tenant backend stamps `platform` | `…:stamps platform for a tenant saved with no per-tenant backend` | unit | PASS |
| 7 | An explicit `supabase` selection survives a save | `…:preserves an explicit supabase selection on save` | unit | PASS |
| 8 | A stale `platform` column is rewritten on the next save | `…:rewrites a stale platform column to convex on the next save` | unit | PASS |
| 9 | Clearing the Convex URL moves a tenant back to `platform` (how you migrate off Convex) | `…:falls back to platform when the convex url is cleared out` | unit | PASS |
| 10 | Pre-existing resolver/credential/schema behavior unchanged | `tests/unit/order-backend.test.ts` (19 cases) | unit | PASS |

## Coverage

```
$ npx jest --coverage --collectCoverageFrom='src/lib/order-backend.ts' \
    tests/unit/order-backend.test.ts tests/unit/order-backend-convex-drift.test.ts
 order-backend.ts | 100 % stmts | 100 % branch | 100 % funcs | 100 % lines
```

Full suite: 267 suites / 3275 tests pass. `npx eslint` clean on the changed files;
`npx tsc --noEmit` reports 0 errors under `src/` (pre-existing errors in older test
files are unrelated and untouched).

## Known gaps

- `createTenantAction` / `updateTenantAction` are covered indirectly through the pure
  `orderBackendForSave` helper; the server actions themselves have no test harness in
  this repo (they require a Supabase client mock that does not exist yet).
- Behavior change worth knowing: a tenant with a Convex URL but no deploy key now makes
  checkout fail loudly (`assertOrderBackendReady`) instead of silently writing to the
  platform DB. Zero tenants are in that state today (verified by query), and a silent
  split across two backends is the failure this replaces.

## Merge evidence

RED → `ec46d02 test: add reproducer for stale platform order_backend on convex tenants`
GREEN → `5f6ae9d fix: read orders from Convex when the order_backend column is stale`
Refactor + backfill → see the commit following this report.
