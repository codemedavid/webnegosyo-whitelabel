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

---

# P5 — Web admin reads + realtime against the tenant project

**Increment date**: 2026-07-25 (same session, continued)
**Scope**: the merchant-facing read side. Orders written to a tenant's own Supabase project (P4) now have somewhere to be *seen*: the admin order queue, the order detail read, the dashboard's today figures, and the live subscription.

## User journeys

- As a **merchant on my own Supabase project**, I want my admin order queue to show the orders customers actually placed, so that the store is operable at all.
- As a **merchant**, I want new orders to appear live with a chime, so that I do not have to refresh to notice an order.
- As a **merchant**, I want today's order count and revenue on my dashboard to match what the queue shows, so that I trust the numbers.
- As a **platform operator**, I want an admin who lacks permission on a tenant to be unable to read that tenant's orders, so that a service-role key that bypasses RLS is not an authorization hole.
- As a **platform operator**, I want a tenant marked `supabase` but missing credentials to say so plainly, so that misconfiguration is not mistaken for "no orders yet".
- As a **security reviewer**, I want the service-role key to stay server-side, so that it never ships in a browser bundle.

## Task report

### Task 1 — Read module for the tenant project
Built `src/lib/tenant-supabase-orders-read.ts`: paged queue, single-order lookup, and today's stats, all taking an injected client.

- RED: `npx jest tests/unit/tenant-supabase-orders-read.test.ts` → `Test suite failed to run — Cannot find module '@/lib/tenant-supabase-orders-read'`. Compile-time RED; 0 tests ran.
- GREEN: same command → 20/20, then 24/24 after the stats cycle.
- Guarantees: every query is scoped by `tenant_id`; page arithmetic is correct at the boundaries; `all` is treated as "no filter"; a read failure throws rather than rendering an empty queue; a missing order returns `null` while a broken connection throws.

### Task 2 — Injectable realtime client
Generalized `src/hooks/use-realtime-orders.ts` to subscribe on a supplied client, defaulting to the platform browser client.

- RED: `npx jest tests/unit/use-realtime-orders.test.tsx` → **6 of 9 failed**, including `subscribes on the tenant's own project client when one is supplied` and `removes the channel from the same client it subscribed on`.
- GREEN: same command → 9/9.
- **Latent bug fixed on the way**: `cleanup` called `createClient()` to build a *fresh* platform client and asked it to remove a channel it had never created. That call was a silent no-op, so every unmount leaked its subscription. The channel is now removed from the client it was created on, tracked in a ref.

### Task 3 — Shared dashboard summarizer
Extracted `src/lib/order-stats.ts` from `getOrderStats` so both backends compute today's figures identically.

- RED: `npx jest tests/unit/order-stats.test.ts tests/unit/tenant-supabase-orders-read.test.ts` → order-stats suite failed to run (module missing); 4 read tests failed with `fetchTenantOrderStats is not a function`.
- GREEN: same command → 24/24 and 6/6.
- `orders-service.getOrderStats` now delegates to the shared summarizer. Behavior preserved: cancelled orders still excluded from count and revenue, per-status breakdown still covers every row.

### Task 4 — Admin UI routing
`admin/orders/page.tsx` branches three ways; `admin/page.tsx` picks the stats source; `realtime-orders-wrapper.tsx` builds a tenant realtime client from a URL + anon key.

- The Convex and platform paths are preserved exactly: a tenant resolving to `convex` **without** a deployment URL still falls through to the platform queue, as before.
- `src/lib/tenant-order-queue.ts` is the server-only seam. It calls `verifyTenantPermission` before constructing the service-role client, so no admin screen can reach the tenant project without passing the platform's authorization gate.
- Guard test written **after** the wiring (thin glue, not a RED-first cycle) and **mutation-checked**: removing `client: tenantClient` from the hook call makes `subscribes on the tenant's own project when its credentials are supplied` fail. Restored and re-verified green.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 58 | A full first page reports its position and total pages | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 59 | The last page reports no next page | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 60 | A tenant with no orders gets an empty, navigable page | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 61 | A null postgrest count becomes 0, not NaN | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 62 | Orders are read with their line items | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 63 | Every queue query is scoped to the tenant | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 64 | An exact count is requested so page totals are real | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 65 | Newest orders are shown first | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 66 | Page/limit translate to the right postgrest range | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 67 | Pagination defaults to the first page of 20 | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 68 | Status filter is applied when selected | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 69 | The `all` status is treated as no filter | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 70 | Order-type filter is applied when selected | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 71 | The `all` order type is treated as no filter | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 72 | A rejected read throws instead of showing an empty queue | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 73 | Null rows become an empty page, not a crash | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 74 | Today's stats are summarized from the tenant project | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 75 | Stats read only from today onward | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 76 | The stats query is scoped to the tenant | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 77 | A rejected stats read throws | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 78 | A single order is read with its items | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 79 | An order id from another tenant cannot be read | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 80 | A missing order returns null | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 81 | A read failure throws rather than faking "not found" | `tenant-supabase-orders-read.test.ts` | unit | PASS |
| 82 | Order count and revenue for the day | `order-stats.test.ts` | unit | PASS |
| 83 | Cancelled orders are excluded from count and revenue | `order-stats.test.ts` | unit | PASS |
| 84 | Every status still gets its own bucket | `order-stats.test.ts` | unit | PASS |
| 85 | Numeric-string totals still add up | `order-stats.test.ts` | unit | PASS |
| 86 | A day with no orders reports zeroes | `order-stats.test.ts` | unit | PASS |
| 87 | A null row set is an empty day, not a throw | `order-stats.test.ts` | unit | PASS |
| 88 | Local midnight is used as the day boundary | `order-stats.test.ts` | unit | PASS |
| 89 | Without a tenant client, the platform client is used | `use-realtime-orders.test.tsx` | unit | PASS |
| 90 | With one, the tenant's project is used and the platform client is not built | `use-realtime-orders.test.tsx` | unit | PASS |
| 91 | Both INSERT and UPDATE subscriptions are tenant-scoped | `use-realtime-orders.test.tsx` | unit | PASS |
| 92 | A new order is reported to the caller | `use-realtime-orders.test.tsx` | unit | PASS |
| 93 | An order status change is reported to the caller | `use-realtime-orders.test.tsx` | unit | PASS |
| 94 | The live indicator tracks the subscription state | `use-realtime-orders.test.tsx` | unit | PASS |
| 95 | The channel is removed from the client that created it (no leak) | `use-realtime-orders.test.tsx` | unit | PASS |
| 96 | Disabled means no subscription | `use-realtime-orders.test.tsx` | unit | PASS |
| 97 | No tenant id means no subscription | `use-realtime-orders.test.tsx` | unit | PASS |
| 98 | The queue subscribes on the tenant project when credentials are supplied | `realtime-orders-wrapper-backend.test.tsx` | unit | PASS |
| 99 | A platform-backed tenant stays on the platform client | `realtime-orders-wrapper-backend.test.tsx` | unit | PASS |
| 100 | Only URL + anon key reach the browser client (no service key) | `realtime-orders-wrapper-backend.test.tsx` | unit | PASS |
| 101 | A half-configured tenant builds no client | `realtime-orders-wrapper-backend.test.tsx` | unit | PASS |

## Combined status
P0–P4 suites (78) + `tenant-supabase-orders-read` (24) + `order-stats` (7) + `use-realtime-orders` (9) + `realtime-orders-wrapper-backend` (4)
= **8 suites, 104 passed, 104 total.**

## Coverage & known gaps
- Validation: `npx jest` over the 8 order-backend suites → 8 passed, 104 tests passed.
- Full suite: **2431 passed, 5 failed / 201 suites.** Three failing suites, none from this increment:
  - `webnegosyo-app/lib/printer-native-load.test.ts`, `webnegosyo-app/lib/order-item-images.test.ts` — pre-existing mobile native-module/test-setup failures.
  - `tests/unit/modifier-margin.test.ts` — a **concurrent session's** RED reproducer, committed as `c3c3e06` while this work was in progress. Expected to be failing; it is their in-flight TDD cycle, not a regression here.
- `npx tsc --noEmit`: no errors in any file touched by this increment (verified by grepping the output for each path). Remaining errors are in pre-existing test files and the concurrent session's `src/lib/inventory/cost-mode.ts`.
- `npx next lint` on all 8 touched source files: **no warnings or errors**.
- **The page components themselves are not unit-tested.** They are async Server Components; the tested seams are what they call (`resolveOrderBackend`, `hasTenantSupabaseOrderCredentials`, `getTenantSupabaseOrdersPage`, `fetchTenantOrdersPage`). The riskiest client-side wiring *is* covered, by a mutation-checked guard test.
- **Still unproven end-to-end.** No tenant is set to `order_backend = 'supabase'` in production, so no order has been written to — or read from — a real per-tenant Supabase project. Both P4 and P5 remain dormant until superadmin can select the backend (P8) or a row is updated by hand and the schema deployed.
- Order **detail** and **status mutations** still target the platform: `fetchTenantOrderById` exists and is tested but is not yet wired into `admin/orders/[orderId]`, and `updateOrderStatus` has no tenant-project branch. A merchant on the Supabase backend can therefore see their queue but cannot yet open or advance an order. This is the first thing to finish before the path is usable.

## Merge evidence (checkpoints)
| Stage | Commit |
|---|---|
| P5 RED | `1d80b53` test: add reproducers for tenant-project admin order reads + injectable realtime client |
| P5 GREEN (lib) | `6e9683d` feat: tenant-project order reads + injectable realtime client |
| P5 GREEN (UI) | `2611677` feat: route admin order queue and dashboard stats to the tenant project |

The second RED cycle (shared stats summarizer) was validated inline — `fetchTenantOrderStats is not a function` plus a missing `order-stats` module — and folded into `6e9683d` rather than getting its own commit, since it landed within the same task.
