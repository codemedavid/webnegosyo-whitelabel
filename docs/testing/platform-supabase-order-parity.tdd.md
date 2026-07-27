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

## Regression Evidence

```
npx jest                # 38 suites, 613 tests passed
npx tsc --noEmit        # clean
```

Convex-backed tenants are unaffected: `resolveOrderBackend` returns `convex` for any tenant with a deployment URL, which is every previously-working tenant, and no Convex call path was modified.

## Known Gaps / Remaining Work

Slice 1 is **not** complete. Still outstanding before a platform tenant can actually run the app:

- **P7** — the mobile Supabase adapter for the ~30 `"module:fn"` refs, and hook dispatch in `lib/hooks.ts`. Until this lands, a platform tenant's screens still show "Convex not configured"; only the *routing decision* is in place.
- **P8** — mobile realtime subscription.
- **P5** — push: `notify-order` Edge Function + trigger, and pointing `registerPushToken` at the new `push_tokens` table.
- `src/types/database.ts` has no types for the five new tables yet; they will be added with the code that reads them.
- The five new tables are empty. Nothing writes to them until P1/P3/P4/P5 land.
- Realtime is now *published*, but end-to-end delivery has not been observed on a live order — that is a manual check still to run.

## Merge Evidence (for squash)

RED → GREEN → verified, in five checkpoint commits on `feat/platform-supabase-order-parity`:

```
8ffebe0 test: add reproducer for mobile order-backend resolution and session threading   (RED)
457bbd3 feat: resolve and carry the tenant order backend through the mobile session      (GREEN)
7de4126 test: add reproducer for order backend carried through impersonation             (RED)
77fc89c feat: carry the tenant order backend through superadmin impersonation            (GREEN)
a13e95c feat: platform order-parity schema and fix dead realtime publication             (applied + probed)
```
