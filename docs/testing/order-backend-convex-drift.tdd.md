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

> **Superseded rows.** 1, 6, 8 and 9 describe the interim contract at commit `5f6ae9d`,
> where `platform` was treated as a fallback. The follow-up below replaced that with an
> explicit `auto` default, so those cases now live in `order-backend-preference.test.ts`
> under rows 11–16. Rows 2–5, 7 and 10 still hold verbatim.

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

## Follow-up — selectable order backend

The superadmin tenant form now has an **Order backend** picker (Automatic /
Convex / Platform database), defaulting to Automatic: use Convex when a
deployment is configured, otherwise the shared platform DB.

`auto` is the stored default rather than `platform`, because `platform`-as-default
is precisely what caused this bug — it reads as a deliberate choice. Migration
`20260728160000` widens the check constraint to allow `auto` and flips the column
default (APPLIED). All four tenant write paths — superadmin create/update and the
MCP provisioning ops in `src/lib/tenants-service.ts` — now stamp the column.

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 11 | `auto` uses Convex when configured, platform otherwise | `order-backend-preference.test.ts` | unit | PASS |
| 12 | An unset or unrecognized column behaves as `auto` | `order-backend-preference.test.ts`, `order-backend-convex-drift.test.ts` | unit | PASS |
| 13 | A deliberate `platform` pin is honored even with Convex configured | `order-backend-preference.test.ts` | unit | PASS |
| 14 | A `convex` pin without a deployment URL degrades to `auto` instead of stranding orders | `order-backend-preference.test.ts` | unit | PASS |
| 15 | A tenant on its own Supabase project is never overwritten by the form | `order-backend-preference.test.ts` | unit | PASS |
| 16 | Every preference survives a save → resolve round-trip to the same backend | `order-backend-preference.test.ts` | unit | PASS |
| 17 | The picker offers three options, defaults to Automatic, reports the choice, disables Convex without a URL, and locks while saving | `order-backend-picker.test.tsx` | component | PASS |

RED for this follow-up: 12 failing (`ORDER_BACKEND_PREFERENCES` /
`orderBackendPreferenceOf` missing, `orderBackendForSave` arity, explicit
`platform` not honored) at `00a07fb`, plus a module-not-found RED for the picker
component. GREEN at `27ac0a2`: 269 suites / 3296 tests.

## Merge evidence

RED → `ec46d02 test: add reproducer for stale platform order_backend on convex tenants`
GREEN → `5f6ae9d fix: read orders from Convex when the order_backend column is stale`
Refactor + backfill → `e921f57 refactor: route checkout convex writes through resolveOrderBackend`
RED → `00a07fb test: add reproducer for a selectable platform/convex order backend`
GREEN → `27ac0a2 feat: choose a tenant's order backend, defaulting to Convex when configured`
