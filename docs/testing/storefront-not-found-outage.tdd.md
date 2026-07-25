# TDD evidence — "Restaurant not found" on every storefront

**Source plan:** none. Journeys derived during this TDD run from a production report
(screenshot of `Lucky Joy Official` rendering the 404 state on webnegosyo.com).

## Root cause

`TENANT_STOREFRONT_SELECT` and `PRODUCT_DETAIL_TENANT_SELECT` both project
`enforce_operating_hours`. That column ships in migration
`20260725160000_enforce_operating_hours.sql`, which was **committed to the repo but
never applied to the production database** — `mcp__supabase__list_migrations` stopped
at `20260725102238 order_backend`.

PostgREST rejects the *entire* query when one projected column is undefined
(SQLSTATE `42703`). Both callers treated any lookup error as "no such tenant", so a
single pending migration rendered "Restaurant not found" for **every** tenant on the
platform while the rows were present and `is_active = true`.

Confirmed by query: `enforce_operating_hours` absent from
`information_schema.columns` for `tenants`, while the 12 sibling projected columns
checked alongside it were all present.

## User journeys

1. As a customer, I want to open a merchant's menu and see the shop, so that I can order — even when the platform has shipped a branding column the database has not caught up to yet.
2. As a merchant, I want a schema drift in an optional branding field to degrade that field to its default, not take my shop offline.
3. As an operator, I want a genuinely missing tenant to still read as not found, and a real database failure to be reported as a failure rather than masked as a 404.

## Task report

### 1. Restore production

Applied migration `enforce_operating_hours` via the Supabase MCP
(`ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT false` — additive and idempotent).

Verification:

```sql
select slug, name, is_active, enforce_operating_hours from tenants where name ilike '%lucky%';
-- luckyjoy | Lucky Joy Official | true | false
```

### 2. Make the read path survive the next schema drift (RED → GREEN)

Reproducer added first: `tests/unit/tenant-storefront-fetch.test.ts`, driving a fake
Supabase client that returns the real PostgREST `42703` payload.

RED — `npx jest tests/unit/tenant-storefront-fetch.test.ts`:

```
● Test suite failed to run
  Cannot find module '../../src/lib/queries/fetch-tenant-by-slug' from 'tests/unit/tenant-storefront-fetch.test.ts'
```

Compile-time RED: the test newly exercises a fetch path that did not exist; the
failure is the missing implementation, not unrelated setup breakage.

GREEN — same command after adding `src/lib/queries/fetch-tenant-by-slug.ts` and
routing `getMenuData` + `getCachedTenantBySlug` through it:

```
Tests:       5 passed, 5 total
```

Guaranteed by the passing tests: an unprojectable column costs one retry with `*`
and the shop still renders; a genuinely absent tenant still reads as not found with
no retry; non-column failures surface their message instead of being reported as a
404; a failing fallback does not loop.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Happy path returns the tenant using the requested projection | `tests/unit/tenant-storefront-fetch.test.ts:returns the tenant on the happy path using the requested projection` | unit | PASS | `npx jest tests/unit/tenant-storefront-fetch.test.ts` |
| 2 | A projected column missing from the database still yields the tenant, via one `*` retry | `…:recovers the tenant when a projected column is missing from the database` | unit | PASS | same |
| 3 | A genuinely absent tenant reads as not found, with no retry | `…:reports a genuinely absent tenant as not found without retrying` | unit | PASS | same |
| 4 | A non-column failure (e.g. statement timeout) surfaces its message instead of a false 404 | `…:surfaces a non-column failure instead of masking it as not found` | unit | PASS | same |
| 5 | A failing fallback projection does not loop | `…:does not loop when the fallback projection also fails` | unit | PASS | same |
| 6 | Every branding column the storefront renders is still projected (pre-existing guardrail, unchanged) | `tests/unit/tenant-storefront-select.test.ts` | unit | PASS (25) | `npx jest tests/unit/tenant-storefront-select.test.ts` |

## Coverage and known gaps

`npx jest tests/unit/tenant-storefront-fetch.test.ts --coverage --collectCoverageFrom="src/lib/queries/fetch-tenant-by-slug.ts"`
→ **97.8% statements, 88.9% branches, 97.8% lines** on the new module.

Type check: `npx tsc --noEmit` reports **0 errors under `src/`** (pre-existing errors
in `tests/` and `webnegosyo-desktop/` are untouched).

Full suite: `npx jest` → 2488 passed, 3 failed in 2 suites
(`webnegosyo-app/lib/printer-native-load.test.ts`,
`webnegosyo-app/lib/order-item-images.test.ts`). Both are in the merchant mobile app,
reference none of the changed modules, and fail independently of this change.

Known gaps, deliberately not closed here:

- **No test can detect an unapplied migration.** The guardrail added is runtime
  resilience, not prevention. A deploy-time check that every column in the storefront
  projections exists in the live database would prevent the drift outright; that
  belongs in CI/prebuild, not in Jest.
- The `*` fallback returns the full row, so a degraded read is heavier than the tuned
  projection. That is intentional — correctness over payload size while drift lasts.
- `asTenantQueryClient` casts the generated Supabase client to the structural subset
  the helper needs, because the generated builder types resolve the projection string
  into per-column types. Rows stay typed by the `T` generic, matching how the previous
  inline queries typed them.

## Merge evidence

Checkpoint commits on `feat/unified-modifier-groups`:

- `a98bdd1` — `test: add reproducer for storefront 404 caused by an unprojectable tenant column` (RED)
- `1796dd1` — `fix: a missing tenant column no longer renders every storefront as not found` (GREEN)

No separate refactor commit: the implementation landed in its final shape and the
suite stayed green.
