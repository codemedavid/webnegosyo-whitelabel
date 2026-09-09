# Platform-backend analytics parity (merchant app) — TDD evidence

**Date:** 2026-09-05
**Trigger:** On a store with `order_backend = 'platform'`, the merchant app's Analytics screen showed
"Could not find public function" — the app still routed every `analytics:*`, `productAnalytics:*`,
`productCosts:*` and `productAnalyticsAggregator:*` ref to Convex, which those stores do not have.
`lib/backends/route.ts` reported them `unsupported` on purpose (P1–P4 of the parity plan were
pending), so Analytics, Trends, Growth, Product Analytics, the product list and the product editor
were all dead on 120 of 231 tenants.

## What changed

All new code lives under `webnegosyo-app/lib/backends/` and dispatches from the existing seam
(`supabase-adapter.ts` → `hooks.ts`). **No screen was touched**: the screens' own DTO interfaces are
the adapter's output contract, as with the orders slice.

| Module | Role |
|---|---|
| `platform-client.ts` | Shared narrow client contract (+ `neq`, `upsert`), `requireTenant`, `scopeToBranch`, `boundedInt`, `toNumber`. Extracted from the adapter so the new modules do not import it back (cycle). |
| `analytics-time.ts` | `localDateKey` / `localDayOfWeek` / `localHour` — mirror of `convex-template/convex/time.ts`. |
| `analytics-compute.ts` | Pure ports of all ten `analytics:*` queries. Same exclusions, rounding, and Asia/Manila day buckets as Convex. Customer insights reuse `customer-identity.ts`. |
| `product-analytics-compute.ts` | Pure port of `productAnalyticsAggregator.ts` (BCG medians, thresholds, recommendation copy, pairings, 7d trend, all-time span). Computed LIVE — nothing is written to `product_analytics`. |
| `supabase-analytics.ts` | Fetch layer: windows, tenant + branch scoping, narrow column lists, `STATS_LIMIT` caps, `neq('status','cancelled')` pushed to PostgREST. |
| `supabase-product-costs.ts` | `productCosts:getCost / getAllCosts / setCost` on `public.product_costs` (upsert on `tenant_id,menu_item_id`; cost validated finite ≥ 0). |
| `supabase-adapter.ts` | Supported-ref predicate widened; defaults delegate; new `runPlatformAction` (refresh = no-op, data is live). |
| `hooks.ts` | `useSafeAction` routes platform tenants through `runPlatformAction` with the platform timeout. |
| web `src/app/actions/analytics.ts` | Storefront events for platform/auto-without-Convex tenants now INSERT into `analytics_events` (were silently dropped). Event type validated against `^[a-z][a-z0-9_]{0,63}$`. |

## Security posture (unchanged principle, extended coverage)

- Every read/write is `tenant_id`-scoped in the query itself — RLS is NOT relied on, because
  `*_select_by_tenant` grants a superadmin every tenant's rows (impersonation would otherwise chart
  another merchant's revenue). Pinned by the `tenant guard` tests in `supabase-analytics.test.ts`
  and `supabase-product-costs.test.ts`.
- Branch-confined accounts get `outlet_id` narrowing on orders and `orders.outlet_id` on line items.
- `daysBack` clamped to 1..366, `limit` to 1..100, `period` to `7d|30d|all`; malformed values fall
  back to the Convex defaults instead of erroring or widening the read.
- All reads capped at `STATS_LIMIT` (10 000), matching Convex's `QUERY_LIMIT`.
- `topCustomers[].contact` is always `""` (mirrors Convex; no PII leaves the aggregate).
- `setCost` refuses NaN/negative/non-numeric cost and a missing menu item before any write.

## RED → GREEN

```
webnegosyo-app (logic project):
  lib/backends/analytics-compute.test.ts          20 tests   RED (module missing) → GREEN
  lib/backends/product-analytics-compute.test.ts   8 tests   RED → GREEN
  lib/backends/supabase-analytics.test.ts         18 tests   RED → GREEN (2 fixture typos fixed: BranchScope kind is "branch")
  lib/backends/supabase-product-costs.test.ts     10 tests   RED → GREEN
  lib/backends/route.test.ts                       +1 test   RED (expected "platform", got "unsupported") → GREEN
  lib/backends/supabase-adapter.test.ts            +3 tests  RED → GREEN
  targeted run: 106 passed / 106
  full run:     286 suites passed, 1 failed (lib/screen-primitives.test.ts, 28 pre-existing
                design-guardrail failures against other in-progress screen edits on this branch —
                unrelated)
  tsc --noEmit: clean      expo lint: 0 errors (13 pre-existing warnings, none in new files)

web:
  tests/unit/actions/analytics-event-backend.test.ts   5 tests  RED → GREEN
  eslint: clean    tsc: clean for the touched files
```

## Live schema probe (platform Supabase, 2026-09-05)

Every column the adapter selects exists on `orders`, `order_items`, `analytics_events`,
`product_costs`; RLS `select_by_tenant` + `write_admin` policies present on `product_costs` and
`analytics_events`. `order_backend` distribution: convex 48, platform 120, **auto 63**. Both
resolvers (web and mobile) treat `auto` as "Convex if a deployment url exists, else platform", so
the routing is consistent.

## Not done / still open

- **Not run on a device.** Evidence is unit tests + a schema probe. The PostgREST embedded-resource
  filters (`orders.created_at=gte.*`, `orders.status=neq.cancelled`, order by `orders(created_at)`)
  follow the syntax the existing `getAllOrderItems` already uses in production, but this exact
  combination has not been exercised against the live API.
- `order_backend = 'supabase'` (separate per-tenant project) still reports every ref
  `unsupported` — no tenant uses it.
- Upsell/Bundle figures for platform stores start at zero: `analytics_events` only fills from the
  moment the web change deploys.
- Analytics screen issues nine PostgREST reads per visit (one per section), as Convex did server-side.
  Acceptable at `STATS_LIMIT`; a single shared fetch is the follow-up if it proves slow.
- Lalamove refs stay `unsupported` in the router by design — the card dispatches via
  `lalamove-transport.ts` before reaching `useSafeAction`.
