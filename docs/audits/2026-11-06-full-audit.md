# Full audit, 2026-11-06

Four read-only reviews (security, bugs, performance, maintainability) of main at 02281bba.
Fixes are on `fix/audit-2026-11-06`. "Fixed" means in that branch, not live.
No CRITICAL findings. Not covered: Convex functions, realtime channels, deployed edge function
source vs repo, some server action bodies, test coverage (the run was stopped; full run ~36 min).

## Security

**Outside this audit's scope, from another session's audit the same day:** Convex auth enforcement (`convex_auth_enforced`) is off on every active store with a Convex URL, anon can read those URLs, and a no-login `orders:getOrders` on the demo store returned customer names and contacts. Also 0 verified MFA factors across 366 admin accounts. Treat this as the most severe open item; check that merchant app builds in the field send a token before flipping it.

| # | Sev | Finding | Where | Status |
|---|---|---|---|---|
| 1 | HIGH | Anon can write/delete pairing targets of every store (`FOR ALL USING (true)`, not in migrations) | live policies `pairing_rule_*_admin_all` | Migration written, NOT applied |
| 2 | HIGH | Merchant MCP access survives staff removal; each refresh grants 30 more days | `src/lib/mcp/oauth-service.ts` | Fixed |
| 3 | HIGH | Unsigned `ORDER_<id>` referral sends guest name/phone/address to anyone with the tracking link and takes the PSID | `src/app/api/webhook/route.ts` | Reduced (first conversation keeps it, 24h). Signing the ref is open |
| 4 | HIGH latent | Anon can read `supabase_order_service_key`, `_db_url`, `_anon_key`, `admin_email`, `loyverse_webhook_error`. 0 of 301 active stores have the keys set; `admin_email` not checked | `tenants` table-level anon grant | Open, needs decision (a column revoke breaks `select('*')`) |
| 5 | MED | Forged orders via direct REST: anon insert sets `total`, no re-validation | `orders_insert_customer`, `mobile/app/(main)/checkout.tsx:452` | Open |
| 6 | MED | Open sign-up makes `growth-coach` a free LLM proxy | `supabase/functions/growth-coach/index.ts` | Code fixed, NOT deployed. Sign-up still open |
| 7 | MED | `analytics`-only or branch staff can change Messenger redirect and delivery pricing on the tenant row | `20261026130000`, `guard_tenant_privileged_columns` | Open |
| 8 | MED | MCP keys/OAuth ignore branch limits and subscription; keys survive removal; `get_sales_summary` has no per-holder check | `merchant-mcp-keys.ts`, `oauth/authorize` | Branch check fixed; rest open |
| 9 | MED | Forged loyalty stamps on Convex stores (membership check only) | `api/customers/capture-order`, `sync-order-lifecycle` | Open |
| 10 | MED? | Unauthenticated text from a store's Page given a PSID | `api/messenger/send-cart`, `send-order-public` | Open |
| 11 | MED? | Loyalty routes ignore branch scope (may be intended) | `src/lib/loyalty/merchant-auth.ts` | Open, owner decision |
| 12 | LOW-MED | Stock depletion through ever-higher `revise` numbers | `api/inventory/order-stock/route.ts` | Open |
| 13 | LOW | ImageKit upload token for another store's folder | `api/imagekit/auth/route.ts` | Open |
| 14 | LOW | Facebook OAuth state has no browser binding | `api/auth/facebook` | Open |
| 15 | LOW | Refresh race mints two token families | `oauth-service.ts` | Fixed |
| 16 | LOW | Set-up link never expires | `src/lib/onboarding/access.ts` | Open |
| 17 | LOW | Guest DMs and PSIDs in production logs | `api/webhook/route.ts` | Fixed |
| 18 | LOW | `track-by-client` returns the full Convex order, no throttle | `api/orders/track-by-client` | Open |
| 19 | LOW | Kitchen account writes events to any branch; 2 public routes unlimited | `api/staff/order-activity`, `customer-order-stock`, `booking/slots` | Open |
| 20 | LOW | Voucher preview trusts `channel`/`customerKey`; planted ImageKit id deletion | `actions/vouchers.ts:155`, `actions/orders.ts:976` | Open |

Hardening: leaked-password protection off, no global CSP, non-constant-time verify-token compare.

## Bugs

| # | Sev | Finding | Where | Status |
|---|---|---|---|---|
| 1 | HIGH | Editing a paid POS sale asks to collect the whole bill again (989 of 999 recent paid POS rows have no ledger row) | `webnegosyo-app/lib/order-balance.ts`, `pos-tender.tsx` | Open, needs plan and reconciliation |
| 2 | HIGH | Platform POS sales lose their service charge, inflating food sales | `pos-tender.tsx:144` | Fixed (app release + backfill owed) |
| 3 | HIGH | Rejected voucher: customer sees discount, order bills full price | `actions/orders.ts`, `useCheckout.ts` | Open, needs decision |
| 4 | HIGH | Retry can report an order with no items as saved | `orders-service.ts` | Fixed (fails instead). Atomic write open |
| 5 | HIGH | DB hiccup tells customer the restaurant is inactive; order lost | `load-order-tenant-context.ts` | Fixed |
| 6 | HIGH | Voucher form shifts validity dates by the UTC offset | `voucher-form.tsx` | Fixed |
| 7 | MED | QR handoff tracking only works on Convex | `api/orders/track-by-client` | Open |
| 8 | MED | Lalamove auto-book needs a contact; floating promises | `orders-service.ts:423-471` | Open |
| 9 | MED | Overnight hours open the store on the wrong morning | `store-open-status.ts` | Fixed |
| 10 | MED | Scheduler treats overnight/midnight close as malformed | `operating-hours.ts:111` | Open |
| 11 | MED | Voucher limits can be overspent (burn after save) | `order-voucher-flow.ts` | Open |
| 12 | MED | Failures after a saved POS edit; status not updated | `pos-tender.tsx`, `order-revise.ts` | Open |
| 13 | MED | Admin menu reads stop at 1000 (`imm-mini-mart` has 4,435) | `admin-menu-list.ts` + 8 screens | Open |
| 14 | MED | Recipe/unit delete reports success when RLS refused | `recipes-service.ts`, `units-service.ts` | Fixed |
| 15 | MED | Online Senior/PWD grants filed with no branch | `apply-checkout-government.ts` | Fixed |
| 16 | MED | Orders page hides read failures as "no orders" | `admin/orders/page.tsx` | Fixed |
| 17 | MED? | Orders missed during a realtime disconnect never appear | `use-realtime-orders.ts` | Open |
| 18 | MED | Refused customers have no cart left (deliberate trade-off) | `useCheckout.ts:1031` | Open |
| 19 | MED | Loyalty end date excludes the chosen day | `loyalty-programs-management.tsx:154` | Open |
| 20 | MED | Daily stock report ignores business-day cutoff | `daily-report-read.ts` | Open |
| 21 | MED? | Double tap on Collect can record two payments | `CollectPaymentSheet.tsx` | Open |
| 22 | LOW | Messenger order send ignores a failed item read | `send-order-public` | Fixed |
| 23 | LOW | Merchant email total omits discounts | `order-follow-ups.ts` | Fixed |
| 24 | LOW | Float comparison on voucher minimums | `eligibility.ts` | Fixed (web + app) |
| 25 | LOW | UTC-day bookings/leads; `markPaid` no lock; reorder errors ignored; `updateBundle` not atomic; `AnalyticsProvider` unmounted; `convex-activity.ts:59`; presell past dates; app writers without row checks | various | Reorder errors fixed; rest open |

Status: `tsc` clean. `npm run lint` errors were all in `.claude/worktrees/` (now ignored).

## Performance and scale

Today: DB is healthy (414 MB, ~2.75% of one core). These grow faster than the data.

| # | Impact | Finding | Fix |
|---|---|---|---|
| 1 | HIGH | `orders!inner` embeds scan the whole platform's `order_items` regardless of store size (`supabase-analytics.ts:391`, `supabase-item-sales.ts:99`, `supabase-adapter.ts:328`, `menu-performance.ts:93`) | Read order ids, then `.in('order_id', chunk)`, or RPC with `any(array(...))` |
| 2 | HIGH | Loyalty recovery queue can't drain: 13,824 of 14,316 jobs are `missing_identity`, retried forever; real stamps wait ~2.5 days | Make it terminal, backfill, partial index |
| 3 | HIGH | Superadmin analytics OFFSET-pages all `orders`, truncates at 50k rows (41k now) | SQL aggregates; interim `orders (created_at, id)` index |
| 4 | HIGH | Reports tab reads a store's whole history per server hit (10k orders ≈ 22 s serial) | SQL rollups + 10 min Redis cache |
| 5 | MED | 339 of 376 `createAdminClient` calls have no timeout | Default it inside `createAdminClient` |
| 6 | MED | External calls with no timeout | Expo, Convex, Meta fixed. Facebook, ImageKit, `lalamove-convex` open |
| 7 | MED | RLS per-row functions; 87 `auth_rls_initplan`, 392 `multiple_permissive_policies` | Initplan shape, test with PGlite runners |
| 8 | MED | `report_profit_*` and `get_day_close_status` heavy | Follows 7; cache finished days |
| 9 | MED | Realtime is 49% of DB time; 3 published tables have no subscriber in the current tree | Drop from publication once no shipped build uses them |
| 10 | MED | `store_activity` is 37% of the DB with no retention | Partition or retention, then re-check indexes |
| 11-13 | LOW | Redundant `orders` indexes; no index on `order_items.menu_item_id`, `bundles.tenant_id`, `recipe_components.tenant_id` | Concurrent index changes |
| 14-16 | LOW? | GoTrue per request; menu page renders per request; framer-motion on storefront | Evaluate |

## Maintainability roadmap

Metrics: 33 files over 800 lines (largest `tenant-form-wrapper.tsx` 2,490); 1,002 functions over 50 lines in `src`; 43 byte-identical web/app file pairs, 45 drifted, 35 parity test files; 299 `eslint-disable`; 121 `any` in `src`; `createLogger` in only 21 files; stores: platform 213, Convex 92, tenant Supabase 0.

1. **Clean-up (1-2 days):** dead code (19 files done; 26 test-only remain), `resolveOrderBackend` lint ban (direct checks in `track-by-client`, `api/loyverse`), remaining `console.log`, split `tenant-form-wrapper.tsx`.
2. **Shared helpers (~1 week):** one money module with units in the name (`formatPeso` means centavos in one file, pesos in another), one Manila-time module (83 helpers), one pager (26 hand-rolled loops). Property-test old vs new.
3. **Sync (1-2 weeks):** generated copies with a CI check instead of parity tests. Unguarded today: `phone.ts`, `profit-model.ts`, `product-analytics-compute.ts`. Decide `mobile/`.
4. **Boundaries (2-4 weeks):** `defineRoute({ auth, body, handler })` with a guardrail test (42 of 125 routes use zod), derive `Tenant` from generated types, tenant/role access layer, split the webhook (502-line `POST`).
5. **Core decomposition (after coverage):** retire tenant Supabase and Hero v3/v4 if confirmed dead, web `OrderStore`, break up `createOrderAction` (858 lines) and `useCheckout` (1,050) with characterization tests first.
