# TDD Evidence — Platform Supabase Order Parity

**Source plan**: `.claude/plans/platform-supabase-order-backend.plan.md`
**Branch**: `feat/platform-supabase-order-parity` (based on `feat/unified-modifier-groups`, which is 142 commits ahead of `origin/main`)
**Scope**: Slice 1 — P0 (schema) and the mobile backend-resolution threading that P7 builds on.

## User Journeys

1. As a merchant whose store runs on the platform Supabase, I want to sign in to the app and have it know which database serves my orders, so my screens load instead of showing "Convex not configured".
2. As a superadmin, I want "open as merchant" to adopt the tenant's order backend, so impersonation reads the same database that tenant's own admin would.
3. As a merchant, I want a new order to appear in the admin without refreshing, so I do not miss it.
4. As a platform operator, I must never let one tenant read another tenant's rows.

## Task Report

### Task 1 — Mobile order-backend resolver (`webnegosyo-app/lib/order-backend.ts`)

Mirrors the web's `src/lib/order-backend.ts`. The two apps are separate packages with no shared build, so the rule is duplicated — the same arrangement `staff-permissions.ts` uses.

- **RED**: `npx jest lib/order-backend.test.ts` → `TS2307: Cannot find module './order-backend'` (compile-time RED; the module under test did not exist).
- **GREEN**: same command → `PASS`, 12 tests.
- **Guarantees**: explicit `order_backend` wins over a present Convex URL; absent column falls back to the legacy convex-url rule; an unrecognized value degrades to the legacy rule rather than stranding the app; blank/whitespace URLs count as no deployment; `supabase` (per-tenant project) is *not* treated as the platform backend.

### Task 2 — Session threading (`lib/session-resolve.ts`, `stores/auth-store.ts`, both sign-in paths)

- **RED**: `npx jest lib/session-resolve.test.ts` → 4 × `TS2339: Property 'orderBackend' does not exist on type 'SessionAuthPatch'`.
- **GREEN**: same command → `PASS`, 17 tests.
- **Guarantees**: a merchant session carries `orderBackend`; a tenant with no Convex deployment resolves to `platform`; an explicit column overrides the URL; a superadmin gets `null` until they impersonate.
- **Wiring**: `app/_layout.tsx` and `app/(auth)/login.tsx` now select `order_backend`. Verified the column exists in production before shipping the select — a missing column would have errored the whole sign-in query, and a *dropped* column would silently ignore overrides (the `branding-mobile-overrides-select-gap` failure mode).

### Task 3 — Impersonation (`lib/impersonation.ts` + three superadmin screens)

- **RED**: `npx jest lib/impersonation.test.ts` → 3 × `TS2339: Property 'orderBackend' does not exist on type 'ImpersonationPatch'`.
- **GREEN**: same command → `PASS`, 26 tests.
- **Guarantees**: entering a tenant adopts that tenant's backend; a tenant with no Convex deployment yields `platform`; exiting clears it so no stale routing survives.
- **Wiring**: `order_backend` added to the column lists in `(superadmin)/tenants.tsx`, `dashboard.tsx`, and `tenant/[id].tsx`, and to both `enterTenant` call sites.

### Task 4 — Platform parity schema (`supabase/migrations/20260727120000_platform_order_parity.sql`)

Applied to production via `mcp__supabase__apply_migration` → `{"success": true}`.

Adds the five tables Convex carries that the platform database lacked: `analytics_events`, `push_tokens`, `product_costs`, `product_analytics`, `daily_stats`.

**Defect found and fixed**: the `supabase_realtime` publication contained **zero tables**. Supabase Realtime therefore never delivered an `orders` change to anyone. The web admin's `use-realtime-orders` subscribed successfully and rendered its green "live" pulse while receiving nothing — a silent failure affecting every platform tenant. The migration adds `orders` and `order_items` to the publication and sets `replica identity full` so RLS can be evaluated against the pre-update row.

Post-apply verification:

| Check | Result |
|---|---|
| `pg_publication_tables` for `supabase_realtime` | `orders, order_items` (was empty) |
| Five tables present in `information_schema.tables` | all 5 |
| `relrowsecurity` true | all 5 |
| Policy count | 10 |

**Security gate** — every policy was inspected for the `au.tenant_id = au.tenant_id` self-comparison that caused the production cross-tenant PII leak fixed by `20260726140000`:

```sql
select tablename, policyname,
  case when qual like '%au.tenant_id = au.tenant_id%' then 'SELF-COMPARISON BUG'
       when qual like '%au.tenant_id = ' || tablename || '.tenant_id%' then 'OK row-scoped'
       else 'REVIEW' end
from pg_policies where schemaname='public' and tablename in (...);
```

All 10 policies returned `OK row-scoped`.

**Deliberate omission**: no anonymous insert policy on `analytics_events`. Storefront events come from customers with no `app_users` row, but they are written by `trackAnalyticsEventAction` through the service-role client, which bypasses RLS. A permissive `with check (true)` would add nothing for that path while letting anyone forge events for any tenant.

### Task 5 — Order mappers (`webnegosyo-app/lib/backends/supabase-orders.ts`)

Pure row→DTO shaping. The screens are the contract: `components/OrderCard.tsx:OrderCardOrder` and the local interfaces in `dashboard.tsx` / `orders.tsx` expect `_id`, `_creationTime` (epoch ms) and camelCase fields. No screen was changed.

- **RED**: `npx jest lib/backends/supabase-orders.test.ts` → `TS2307: Cannot find module './supabase-orders'`.
- **GREEN**: same command → `PASS`, 22 tests.
- **Guarantees**: Manila day boundary (not UTC) bounds "today"; `numeric` columns arriving as strings are coerced so totals add instead of concatenate; `item_count` falls back to summing line items; legacy `text[]` addons normalize to the object shape; the live queue drops delivered/cancelled and sorts newest-first; revenue/count/average exclude cancelled orders while the status breakdown still counts them; an empty day yields `0`, not `NaN`; an unrecognized status cannot create a `NaN` bucket; POS and QR-handoff orders open as `confirmed` (skip-pending), web orders as `pending`.

### Task 6 — Order adapter (`webnegosyo-app/lib/backends/supabase-adapter.ts`)

Serves the eight `orders:*` refs the screens send. Exercised against a recording fake client so the query *shape* is assertable.

- **RED**: `npx jest lib/backends/supabase-adapter.test.ts` → `TS2307: Cannot find module './supabase-adapter'`.
- **GREEN**: same command → `PASS`, 17 tests.
- **Guarantees**: every read and write filters `tenant_id` explicitly; a missing tenant throws instead of querying; a DB error propagates instead of masquerading as an empty queue; `getOrderById` returns `null` for another tenant's order; a retried submit with the same `clientOrderId` returns the existing order rather than inserting again; a failed item insert surfaces instead of leaving an order with no lines; an unknown ref throws instead of silently no-op'ing.

**Security note**: the explicit `tenant_id` filter is not redundant with RLS. `orders_select_by_tenant` grants a **superadmin every tenant's rows**, so an unscoped query inside an impersonated store would render another merchant's orders and customer phone numbers. The `tenant guard` test pins this.

### Task 7 — Per-ref routing (`webnegosyo-app/lib/backends/route.ts`)

- **RED**: `npx jest lib/backends/route.test.ts` → `TS2307: Cannot find module './route'`.
- **GREEN**: same command → `PASS`, 7 tests.
- **Guarantees**: anything not explicitly `platform` routes to Convex (so all 45 Convex tenants keep the original code path); an unresolved backend falls back to Convex; a ref the adapter cannot serve reports `unsupported` so the screen shows its "needs a backend update" placeholder instead of an empty chart that reads as real zero data; no tenant in scope yields `idle` rather than a cross-tenant query; `order_backend = 'supabase'` (the separate per-tenant-project track) is **not** served here.

### Task 8 — Hook dispatch (`webnegosyo-app/lib/hooks.ts`)

`useSafeQuery` / `useSafeMutation` now dispatch per ref. Both platform hooks are called unconditionally so hook order is identical across backends, and `ConvexProvider` stays unconditionally mounted — making it conditional hard-crashes iOS (`lib/convex-provider.tsx:17`).

Until realtime lands, platform screens re-read on a 15s poll so a new order still appears without a manual refresh.

- **Verification**: `npx tsc --noEmit` clean; `npx jest` → 44 suites / 710 tests; web suite → 224 suites / 2582 tests.
- **Not unit-tested**: the hook file itself. Jest here is node-env with no React renderer, and screens are exercised manually via Expo. The logic that decides *which* backend answers is extracted into `route.ts` and fully covered; what remains untested is the React plumbing.

### Task 9 — Convex-parity columns (`supabase/migrations/20260727130000_...sql`)

Applied to production. The platform `orders` table was built for web checkout only and lacked `source`, `client_order_id`, `item_count`, `has_upsell_items`, `has_bundle_items`; `order_items` lacked `variation_selections`, `is_upsell_item`, `is_bundle_item`, `bundle_id`, `bundle_name`, `slot_name`. Without them a platform tenant could not ring up a counter sale, dedupe a retried submit, or render an item count.

`client_order_id` is unique **per tenant** (partial index): the id is client-generated, so a global unique index would let one tenant's order reject another's.

Post-apply probe: `item_count` backfilled — 0 nulls remain across 1,708 orders; 18 legacy orders genuinely have no line items and resolve to `0`.

### Task 10 — Mobile realtime (`webnegosyo-app/lib/backends/supabase-realtime.ts`)

Replaces the flat 15s poll on platform-backed screens with a per-tenant `postgres_changes` channel on `public.orders`, filtered server-side by `tenant_id=eq.<id>`. The pure decisions (channel identity, tenant guard, status mapping, poll interval) are extracted here; only the subscribe/unsubscribe plumbing lives in `lib/hooks.ts`.

RED: `npx jest lib/backends/supabase-realtime.test.ts` → `TS2307: Cannot find module './supabase-realtime'`.
GREEN: same command → 18 passed.

A second RED/GREEN cycle inside the same task added `instanceKey`: `<GlobalOrderAlerts>` and the dashboard both watch the queue simultaneously, and supabase-js keys channels by topic, so a tenant-only channel name made the second subscriber collide with the first. RED was `TS2554: Expected 1 arguments, but got 2`.

Design decisions worth recording:

- **Polling is kept, not removed.** Realtime has never been observed delivering a live order on this stack. The interval drops to 60s while the channel reports `SUBSCRIBED` and returns to 15s otherwise, so a socket that never connects (or silently dies) degrades to the previous behaviour instead of a screen that never updates.
- **Any unrecognized channel status counts as disconnected.** Guessing "connected" would slow the poll to the safety-net interval and make orders arrive up to a minute late.
- **The payload tenant is re-checked on arrival**, behind the server-side filter. A refetch is tenant-scoped anyway, but the new-order ringtone firing for another merchant's order would be a visible cross-tenant leak.
- The subscription effect deliberately does **not** depend on the serialized args, so changing a filter re-reads without tearing down the channel.

Server-side precondition re-probed against production: `orders` and `order_items` are both in the `supabase_realtime` publication with `relreplident = 'f'` (full).

## Test Specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Explicit `order_backend` wins over a present Convex URL | `lib/order-backend.test.ts:uses the explicit order_backend column` | unit | PASS |
| 2 | No Convex URL resolves to the platform backend | `lib/order-backend.test.ts:falls back to platform` | unit | PASS |
| 3 | An unrecognized backend value degrades instead of stranding the app | `lib/order-backend.test.ts:ignores an unrecognized order_backend value` | unit | PASS |
| 4 | A per-tenant `supabase` project is not mistaken for the platform DB | `lib/order-backend.test.ts:is false for a tenant on its own dedicated Supabase project` | unit | PASS |
| 5 | A merchant session carries the resolved backend | `lib/session-resolve.test.ts:resolves the order backend` | unit | PASS |
| 6 | A superadmin has no backend until impersonating | `lib/session-resolve.test.ts:leaves a superadmin without an order backend` | unit | PASS |
| 7 | Impersonation adopts the tenant's backend | `lib/impersonation.test.ts:adopts the impersonated tenant's order backend` | unit | PASS |
| 8 | Exiting impersonation clears the backend | `lib/impersonation.test.ts:clears the order backend on exit` | unit | PASS |
| 9 | Realtime publication carries orders + order_items | `pg_publication_tables` probe | schema | PASS |
| 10 | No new RLS policy self-compares tenant_id | `pg_policies` probe | security | PASS |
| 11 | The realtime channel is filtered to one tenant server-side | `lib/backends/supabase-realtime.test.ts:scopes the subscription to a single tenant's orders` | unit | PASS |
| 12 | Two subscribers on one tenant get distinct channels | `...:gives two subscribers on the same tenant distinct channel names` | unit | PASS |
| 13 | A foreign-tenant payload is ignored even if it arrives | `...:rejects a change belonging to another tenant` | unit | PASS |
| 14 | A payload with no attributable tenant is ignored | `...:rejects a payload with no tenant on either row` | unit | PASS |
| 15 | A dropped/unknown socket falls back to the fast poll | `...:treats an unrecognized status as disconnected` | unit | PASS |
| 16 | Status changes propagate, not just new orders (`event: "*"`) | `...:listens for updates as well as inserts` | unit | PASS |

## Regression Evidence

```
webnegosyo-app: npx tsc --noEmit   # clean
webnegosyo-app: npx jest           # 47 suites, 769 tests passed
web root:       npx jest           # 224 suites, 2582 tests passed
webnegosyo-app: npx eslint lib/hooks.ts lib/backends/   # 0 errors
```

(The one remaining eslint warning is a pre-existing unused disable directive inside `useSafeAction`, which this work did not touch.)

Convex-backed tenants are unaffected: `resolveRefRoute` returns `convex` for anything not explicitly on the platform backend, and that branch runs the original code path unchanged.

### Live tenant impact

| `order_backend` | Tenants | Has Convex URL |
|---|---|---|
| `platform` | 121 | 1 |
| `convex` | 45 | 45 |

The 120 platform tenants with no Convex deployment go from **every order screen erroring "Convex not configured"** to working.

**One tenant to watch — `kastelli-di-angelis`**: flagged `platform` *and* holding a Convex deployment URL, with 0 platform orders. The app will now read the platform database for it. That is correct and matches the web (`src/lib/order-backend.ts` applies the same explicit-column-wins rule, so its new checkout orders already land on the platform), but its **pre-switch order history lives in Convex and will not appear in the app**. No special case was added, because forcing this tenant back to Convex would diverge the app from where its new orders actually land.

## Known Gaps / Remaining Work

Orders now work end to end in code, but the slice is **not** finished:

- **Not yet run on a device.** Every guarantee above is a unit test or a SQL probe. No platform tenant has been signed into on an actual build, so the React plumbing in `lib/hooks.ts` is unverified in practice. This is the single biggest gap.
- **Realtime delivery is still unobserved end to end.** The channel is wired and its preconditions are probed, but no live order has been seen arriving over the socket. Verifying this needs an authenticated merchant session against a real device — it cannot be simulated from Node with the anon key, because Realtime applies the connected user's RLS. Until then the 15s/60s poll is what actually guarantees orders appear.
- **P5 — push.** A platform tenant gets **no** order notification on iOS or Android. Convex's `sendOrderNotification` has no platform equivalent yet; needs the `notify-order` Edge Function + trigger and `registerPushToken` pointed at `push_tokens`.
- **Only `orders:*` refs are served.** Analytics, product costs, trends, Lalamove and daily stats still report `unsupported` on the platform backend — screens show the "needs a backend update" placeholder. That is deliberate (P1–P4, P6) and honest, but it is not parity yet.
- `src/types/database.ts` has no types for the five tables added in `20260727120000`, and those tables are still empty — nothing writes to them.
- **POS writes are untested against the platform.** `pos-tender.tsx` and `scan.tsx` send `createOrder`; the args are shape-compatible and typecheck, but no POS sale has been rung up on a platform tenant.

## Merge Evidence (for squash)

RED → GREEN → verified, in five checkpoint commits on `feat/platform-supabase-order-parity`:

```
8ffebe0 test: add reproducer for mobile order-backend resolution and session threading   (RED)
457bbd3 feat: resolve and carry the tenant order backend through the mobile session      (GREEN)
7de4126 test: add reproducer for order backend carried through impersonation             (RED)
77fc89c feat: carry the tenant order backend through superadmin impersonation            (GREEN)
a13e95c feat: platform order-parity schema and fix dead realtime publication             (applied + probed)
698422a test: add reproducer for platform Supabase order mappers                         (RED)
4a014fe feat: map platform Supabase order rows onto the app's Convex DTO shape           (GREEN)
2a669cb feat: add Convex-parity columns to platform orders and order_items               (applied + probed)
8cf9881 test: add reproducer for the platform order adapter and its tenant guard         (RED)
8fde442 feat: serve the app's order function refs from the platform Supabase             (GREEN)
c523da3 test: add reproducer for platform order realtime subscription decisions          (RED)
c36b7cf feat: decide the platform order realtime channel, tenant guard, poll fallback     (GREEN)
6b7c76d feat: push platform order changes to the app over Supabase Realtime               (wiring)
(route) test: add reproducer for per-ref backend routing                                 (RED)
(route) feat: route each function ref to Convex, the platform adapter, or neither        (GREEN)
af95366 feat: dispatch app queries and mutations to the platform Supabase backend        (wiring)
```
