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
- ~~P3 per-tenant client factory~~ — **done, see Increments 6–7 below**
- ~~P4 checkout write routing~~ — **done, see Increments 6–7 below**
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

---

# TDD Evidence: Per-Tenant Order Backend — Client Factory + Checkout Routing (P3–P4)

**Date**: 2026-07-25
**Scope of this increment**: the platform migration finally applied to production, the per-tenant client factory (P3), and checkout write routing (P4). P5–P8 remain unbuilt.

## Decisions taken into this increment
- **Anon-key realtime reads are an accepted trade-off** (operator decision, this session). The tenant order bundle exposes `orders` / `order_items` via a permissive SELECT policy reachable with the project's anon key. Blast radius is one tenant's own project, and it matches the precedent already set by the unauthenticated QR-handoff Convex mutations. The alternatives considered and declined for now: proxying realtime through the platform with the service-role key, or provisioning real auth users per tenant project. Documented in the module header of `src/lib/supabase/tenant-order-client.ts`.

## User Journeys Covered
- As the platform, I want a single seam that produces the right Supabase client for a tenant's own order project — service-role for writes, anon for realtime — so no call site invents its own credential handling.
- As a merchant on the Supabase backend, I want my checkout orders written into my own project, not the shared platform database.
- As the platform, I want a half-configured Supabase tenant to fail checkout loudly rather than silently write into the shared platform database, which would split that merchant's orders across two backends unnoticed.
- As a merchant, I want an order to never appear in my queue without its line items.

## Task Report
| Task | Summary | Validation command | RED → GREEN |
|---|---|---|---|
| Apply platform migration | Applied `20260721000000_order_backend.sql` to production via `mcp__supabase__apply_migration`. It had **never been applied** — `information_schema` showed zero of the six columns, so every P0–P2 artifact was unreachable in prod. | `select order_backend, count(*) … group by order_backend` | n/a (DDL). Post-apply: **45 tenants → `convex`** (all 45 have a Convex URL), **120 → `platform`** (none do). Backfill preserved routing exactly; zero tenants changed behavior. |
| P3 client factory | `src/lib/supabase/tenant-order-client.ts` — `createTenantOrderWriteClient` (service-role, stateless) and `createTenantOrderRealtimeClient` (anon). Client construction injected so tests never open a connection. | `npx jest tests/unit/tenant-order-client.test.ts` | RED: `Cannot find module '@/lib/supabase/tenant-order-client'`. GREEN: **11 passed, 11 total**. |
| Token minting split | Extracted `generateOrderTokenPair()` from `createOrderToken` in `src/lib/order-token.ts`. `createOrderToken` still UPDATEs the platform project; the tenant path needs the hash without touching the wrong database. Behavior-preserving for the platform path. | covered indirectly by the tenant-writer suite | n/a |
| P4 tenant writer | `src/lib/tenant-supabase-orders.ts` — pure `buildTenantOrderRow` / `buildTenantOrderItemRows` plus `createOrderTenantSupabase` against an injected client. | `npx jest tests/unit/tenant-supabase-orders.test.ts` | RED: `Cannot find module '@/lib/tenant-supabase-orders'`. GREEN: **19 passed, 19 total**. |
| P4 checkout routing | `src/app/actions/orders.ts` — added the `supabase_order_*` + `order_backend` columns to the tenant SELECT, and a `resolveOrderBackend(tenantConfig) === 'supabase'` branch ahead of the Convex branch, gated by `assertOrderBackendReady`. | `npx tsc --noEmit` (clean for `src/`), full suite | n/a — see "Coverage & Known Gaps" |

## Test Specification
| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 28 | The write client is built from the tenant URL + service-role key | `tenant-order-client.test.ts` | unit | PASS |
| 29 | The write client never uses the anon key | `tenant-order-client.test.ts` | unit | PASS |
| 30 | The write client is stateless (`autoRefreshToken`/`persistSession` false) | `tenant-order-client.test.ts` | unit | PASS |
| 31 | Missing project URL throws, naming the column | `tenant-order-client.test.ts` | unit | PASS |
| 32 | Missing service-role key throws, naming the credential | `tenant-order-client.test.ts` | unit | PASS |
| 33 | No client is constructed at all when credentials are incomplete | `tenant-order-client.test.ts` | unit | PASS |
| 34 | The realtime client is built from the tenant URL + anon key | `tenant-order-client.test.ts` | unit | PASS |
| 35 | The service-role key never reaches the realtime client | `tenant-order-client.test.ts` | unit | PASS |
| 36 | Missing anon key throws, naming the credential | `tenant-order-client.test.ts` | unit | PASS |
| 37 | Subscribing does not require the service-role key | `tenant-order-client.test.ts` | unit | PASS |
| 38 | Both clients work with no injected factory (real default path) | `tenant-order-client.test.ts` | unit | PASS |
| 39 | Order total = item subtotals + delivery fee + service charge | `tenant-supabase-orders.test.ts` | unit | PASS |
| 40 | Missing fee/charge are treated as zero, not NaN | `tenant-supabase-orders.test.ts` | unit | PASS |
| 41 | The row is scoped to the tenant | `tenant-supabase-orders.test.ts` | unit | PASS |
| 42 | New orders start `pending` on both status axes | `tenant-supabase-orders.test.ts` | unit | PASS |
| 43 | Payment proof lands in real columns, not smuggled into `customer_data` (unlike the Convex path) | `tenant-supabase-orders.test.ts` | unit | PASS |
| 44 | `payment_proof_uploaded_at` is set only when a proof was supplied | `tenant-supabase-orders.test.ts` | unit | PASS |
| 45 | An advance-order schedule is a real `scheduled_for` column | `tenant-supabase-orders.test.ts` | unit | PASS |
| 46 | ASAP orders leave `scheduled_for` null | `tenant-supabase-orders.test.ts` | unit | PASS |
| 47 | The token hash + expiry ride in the INSERT (no follow-up UPDATE, no tokenless window) | `tenant-supabase-orders.test.ts` | unit | PASS |
| 48 | The plaintext token is never written to the database | `tenant-supabase-orders.test.ts` | unit | PASS |
| 49 | Every line item is attached to the created order | `tenant-supabase-orders.test.ts` | unit | PASS |
| 50 | Missing addons default to `[]` (valid for the `text[]` column) | `tenant-supabase-orders.test.ts` | unit | PASS |
| 51 | Object addons are flattened to names so `text[]` stays valid | `tenant-supabase-orders.test.ts` | unit | PASS |
| 52 | Orders and items are both written to the tenant project | `tenant-supabase-orders.test.ts` | unit | PASS |
| 53 | The created order and plaintext token are returned to the caller | `tenant-supabase-orders.test.ts` | unit | PASS |
| 54 | A rejected order insert throws with the underlying message | `tenant-supabase-orders.test.ts` | unit | PASS |
| 55 | Items are not written when the order insert failed | `tenant-supabase-orders.test.ts` | unit | PASS |
| 56 | A failed item write rolls the order back (no line-item-less ghost order) | `tenant-supabase-orders.test.ts` | unit | PASS |
| 57 | An empty order is rejected before any database call | `tenant-supabase-orders.test.ts` | unit | PASS |

## Combined status
`order-backend` (19) + `supabase-deploy` (9) + `supabase-sql-runner` (4) + `supabase-order-schema` (11) + `supabase-deploy-orchestrator` (5) + `tenant-order-client` (11) + `tenant-supabase-orders` (19) = **78 passed, 78 total.**

## Coverage & Known Gaps
- Validation: `npx jest <the 7 suites above>` → 7 suites passed, 78 tests passed.
- Full suite: **2327 passed, 4 failed** at time of writing. Both failing suites are `webnegosyo-app/lib/printer-native-load.test.ts` and `webnegosyo-app/lib/order-item-images.test.ts` — mobile native-module/test-setup failures, pre-existing and unrelated to this change (no file in this increment is imported by either).
- `npm run lint`: 83 errors repo-wide, **none in any file touched by this increment** (verified by grepping the lint output for each changed path). They are concentrated in `webnegosyo-desktop/` and pre-date this work.
- `npx tsc --noEmit`: clean across `src/`. Remaining errors are in pre-existing test files.
- **The `createOrderAction` branch itself is not unit-tested.** It is a `"use server"` action with heavy I/O; the same posture as the untested Convex branch beside it. The branch body is deliberately thin — every decision it makes (`resolveOrderBackend`, `assertOrderBackendReady`, row construction, the write) is covered by the tested helpers it calls. An E2E against a real tenant project is the honest way to close this and is **not yet done**: no order has been written to a real per-tenant Supabase project through checkout.
- No tenant is currently set to `order_backend = 'supabase'` in production, so this path is dormant until superadmin flips one (which needs P8, or a manual DB update plus a Deploy Schema run).

## Merge evidence (checkpoints)
| Stage | Commit |
|---|---|
| P3 RED  | `eb7eeee` test: add reproducer for per-tenant Supabase order client factory |
| P3 GREEN | `59a778e` feat: per-tenant Supabase order client factory |
| P3 refactor | `48de3cb` refactor: make the default-factory test assert both client surfaces |
| P4 RED | `7adc8fb` test: add reproducer for tenant Supabase order writes |
| P4 GREEN | ⚠️ **not a dedicated commit** — see below |

⚠️ **Checkpoint anomaly, recorded honestly.** A concurrent session working in this same repository ran a broad `git add`, and the P4 implementation files (`src/lib/tenant-supabase-orders.ts`, `src/lib/order-token.ts`, the `src/app/actions/orders.ts` routing branch) were swept into two unrelated commits belonging to that session's operating-hours feature: `7f33b1e` and `e7be13e`. The code is intact and its tests are green, but the P4 GREEN checkpoint is not isolated and those two commits mix two features. History was deliberately **not** rewritten, because the other session is still working on this branch and a rebase would break it.
