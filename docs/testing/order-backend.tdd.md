# TDD Evidence: Per-Tenant Order Backend — Foundation (P0)

**Source plan**: [`.claude/plans/supabase-order-backend.plan.md`](../../.claude/plans/supabase-order-backend.plan.md)
**Scope of this increment**: Phase 0 foundation — the pure order-backend resolver + credential schema, the platform migration, and the `Tenant` type. Later phases (auto-deploy action, per-tenant client factory, routing, mobile, push) are not yet implemented.

## User Journeys Covered
- As the platform, I want to resolve which database a tenant's orders use from an explicit column, falling back to today's implicit behavior for un-migrated rows, so existing tenants are never silently rerouted.
- As superadmin, I want the per-tenant Supabase credentials I paste to be validated (https URL, non-empty keys, a real postgres connection string), so a misconfigured backend is rejected at input time.
- As the checkout path, I want a misconfigured selected backend to fail loudly rather than write to the wrong database.

## Task Report
| Task | Summary | Validation command | RED → GREEN |
|---|---|---|---|
| Order-backend resolver + schema | Implemented `resolveOrderBackend`, `hasTenantSupabaseOrderCredentials`, `assertOrderBackendReady`, `supabaseOrderCredentialsSchema` in `src/lib/order-backend.ts` | `npx jest --config jest.config.cjs tests/unit/order-backend.test.ts` | RED: `Cannot find module '@/lib/order-backend'` (module absent). GREEN: 19 passed, 19 total |
| Platform migration | `supabase/migrations/20260721000000_order_backend.sql` adds `order_backend` (checked enum, default `platform`) + `supabase_order_*` credential columns; backfills to preserve today's routing | Not unit-tested (DDL). Applied via normal `supabase db push` pipeline | n/a |
| `Tenant` type | Added `order_backend` + `supabase_order_*` fields to `src/types/database.ts` | `npx eslint src/types/database.ts` (clean) | n/a |

## Test Specification
| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | Explicit `convex`/`supabase`/`platform` selections are honored | `resolveOrderBackend` (3 cases) | unit | PASS |
| 2 | No explicit backend + Convex URL → `convex` (legacy) | `resolveOrderBackend` | unit | PASS |
| 3 | No explicit backend + no Convex URL → `platform` (legacy default, no silent reroute) | `resolveOrderBackend` | unit | PASS |
| 4 | Unknown column value falls back safely | `resolveOrderBackend` | unit | PASS |
| 5 | Supabase creds present only when url+anon+service all non-empty (whitespace rejected) | `hasTenantSupabaseOrderCredentials` (4 cases) | unit | PASS |
| 6 | `platform` always ready; `convex`/`supabase` throw when their creds are missing | `assertOrderBackendReady` (5 cases) | unit | PASS |
| 7 | Credential schema rejects http URLs, non-postgres db URLs, empty keys | `supabaseOrderCredentialsSchema` (4 cases) | unit | PASS |

## Increment 2 — Deploy orchestration (P2 core)
`src/lib/supabase-deploy.ts` — the pure orchestration for auto-deploying the order-schema bundle into a tenant's own Supabase project (mirror of `convex-deploy.ts`), with the DDL execution injected as a `SqlRunner` so the driver choice stays a thin adapter.

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 8 | `SUPABASE_ORDER_SCHEMA_VERSION` is a positive integer | `supabase-deploy.test.ts` | unit | PASS |
| 9 | `deployOrderSchema` runs the bundle and returns the current version on success | `supabase-deploy.test.ts` | unit | PASS |
| 10 | Empty bundle is refused without calling the runner | `supabase-deploy.test.ts` | unit | PASS |
| 11 | Runner errors (Error or raw throw) are normalized to `{success:false,error}` never thrown | `supabase-deploy.test.ts` | unit | PASS |
| 12 | `validateSupabaseProject` valid on reachable (2xx/404), invalid on 401/403, false (not throw) on network error | `supabase-deploy.test.ts` | unit | PASS |

RED: `Cannot find module '@/lib/supabase-deploy'`. GREEN: 9 passed, 9 total. Lint clean.

## Resolved decisions (user chose "do what you recommend")
1. **DDL execution mechanism → connection string via `postgres.js`.** Added `postgres@^3.4.9`. The driver lives ONLY in `src/lib/supabase-sql-runner.ts` behind an injected `PgConnector`, so the pure orchestration stays driver-free and mock-free in tests. Chosen over the Management-API/PAT model because it works for separately-owned tenant projects (no shared Supabase org assumed) — which is the stated requirement.
2. **The order-schema bundle → hand-authored & RLS-reworked** in `src/lib/supabase-order-schema.ts` (TS string module = single source of truth, guaranteed in the serverless bundle like the Convex JSON, reachable by `@/` in tests). Standalone-project reworks: no `tenants` FK, no `app_users`/`auth.uid()` RLS, no menu/order_type/payment FKs. Server writes use the service role (bypasses RLS); realtime clients read `orders`/`order_items` via a permissive SELECT policy; `customers` PII + `push_subscriptions` are service-role-only (no anon policy).

## Increment 3 — SQL runner adapter (P2, `supabase-sql-runner.ts`)
| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 13 | `applySupabaseSchema` connects with the tenant db url and runs the bundle via `unsafe()` | `supabase-sql-runner.test.ts` | unit | PASS |
| 14 | The connection is always closed, even when the bundle throws (no socket leak) | `supabase-sql-runner.test.ts` | unit | PASS |
| 15 | `createSchemaRunner` yields a `SqlRunner` bound to the tenant db url | `supabase-sql-runner.test.ts` | unit | PASS |

RED: `Cannot find module '@/lib/supabase-sql-runner'`. GREEN: 4 passed. (Driver injected via `PgConnector` — no `jest.mock('postgres')`, which auto-mocked unreliably under next/jest.)

## Increment 4 — Order-schema bundle (P1, `supabase-order-schema.ts`)
| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 16 | Bundle is a non-empty SQL string, enables `pgcrypto` | `supabase-order-schema.test.ts` | unit | PASS |
| 17 | Creates `orders`, `order_items`, `customers`, `push_subscriptions`, all guarded by `if not exists` (idempotent) | `supabase-order-schema.test.ts` | unit | PASS |
| 18 | Does NOT reference `app_users`; does NOT FK to `tenants` (standalone project) | `supabase-order-schema.test.ts` | unit | PASS |
| 19 | RLS enabled on order tables; policies dropped-before-create (idempotent re-deploy) | `supabase-order-schema.test.ts` | unit | PASS |
| 20 | `orders` + `order_items` added to `supabase_realtime` publication | `supabase-order-schema.test.ts` | unit | PASS |
| 21 | Per-tenant daily order number function + trigger, Asia/Manila day reset | `supabase-order-schema.test.ts` | unit | PASS |
| 22 | `customers` PII has no anon/public SELECT policy (service-role only) | `supabase-order-schema.test.ts` | unit | PASS |

RED: `Cannot find module '@/lib/supabase-order-schema'`. GREEN: 11 passed.

## Increment 5 — Deploy orchestrator + server action (P2, `supabase-deploy.ts` + `app/actions/supabase-deploy.ts`)
| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 23 | Deploys the bundle over the tenant db url and bumps to the current version on success | `supabase-deploy-orchestrator.test.ts` | unit | PASS |
| 24 | Refuses to deploy (no validate, no apply) when any credential is missing | `supabase-deploy-orchestrator.test.ts` | unit | PASS |
| 25 | Refuses to deploy when the db connection string is missing | `supabase-deploy-orchestrator.test.ts` | unit | PASS |
| 26 | Fails without applying when project/credentials are invalid | `supabase-deploy-orchestrator.test.ts` | unit | PASS |
| 27 | A DDL failure is surfaced as a result, never thrown | `supabase-deploy-orchestrator.test.ts` | unit | PASS |

RED: `runTenantSupabaseDeploy` not exported. GREEN: 5 passed. The `"use server"` wrapper (`deploySupabaseToTenantAction` / `bulkDeploySupabaseAction`) is intentionally thin and untested at the unit level — same posture as `convex.ts`, whose actions are also uncovered; the testable logic lives in the injected `runTenantSupabaseDeploy`.

## Combined status
`order-backend` (19) + `supabase-deploy` (9) + `supabase-sql-runner` (4) + `supabase-order-schema` (11) + `supabase-deploy-orchestrator` (5) = **48 passed, 48 total.** Lint clean on all new files.

## Still not built (tracked in the plan)
- P3 per-tenant client factory (`src/lib/supabase/tenant-order-client.ts`)
- P4 checkout write routing (`src/app/actions/orders.ts`)
- P5 web admin read + realtime routing
- P6 mobile app Supabase fallback
- P7 push notifications for Supabase tenants
- P8 superadmin UI (order-backend select + creds form + Deploy Schema button)
- Zod creds validation wired into `src/lib/tenants-service.ts` update path

## Coverage & Known Gaps
- `tests/unit/order-backend.test.ts`: 19/19 pass. `tests/unit/supabase-deploy.test.ts`: 9/9 pass.
- Full suite: 1645 pass, **3 pre-existing failures** in `webnegosyo-app/lib/order-item-images.test.ts` (test-setup import failure) — unrelated to this change; confirmed present without these files.
- Not yet built (tracked in the plan): P1 order-schema bundle (`supabase-template/`), P2 `deploySupabaseSchemaAction`, P3 per-tenant client factory, P4/P5 web routing, P6 mobile, P7 push, P8 superadmin UI.

## Notes
- Three-state model (`convex | supabase | platform`) chosen over a binary to avoid silently rerouting existing no-Convex tenants (who write to the shared platform DB) into a per-tenant Supabase project they do not have.
- No commits made: the working tree contains unrelated in-progress work (addon-library), so checkpoints are deferred per "commit only when asked."
