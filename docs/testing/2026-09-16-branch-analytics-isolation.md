# Branch analytics and order attribution

## Cause

The Dash app deliberately queried raw orders at account scope so the owner portfolio could compare branches. It applied this same policy to aggregated analytics. Those totals cannot be narrowed after the response. Convex analytics ignored branch selection entirely, and product insights used a store-wide materialized snapshot. Daily product sales and the daily inventory report also ignored the owner's selected branch. Every mounting `useOutlets` consumer reset branch selection, even when the tenant had not changed.

POS pricing followed the viewing branch, but tender, vouchers and loyalty quotes used the account's outlet. Website checkout silently continued when branch resolution failed, and unvalidated branch keys could survive in customer data.

## Changes

- Analytics queries and cache keys use effective branch scope on platform Supabase. Convex receives the outlet argument and filters before aggregation, with canonical order fields taking precedence over legacy customer metadata.
- Sales, trends, channels, customers, payments, heatmaps, products and event funnels are scoped. Product branch insights compute from branch orders rather than store snapshots. Funnel events accept both historical `outletId` and `outlet_id` metadata; unattributed events remain all-branches only.
- Raw portfolio queries remain account-scoped. Daily product sales/exports narrow the raw orders before computing. Daily inventory costs and revenue now share the selected branch, with stale report responses discarded.
- Branch-list consumers bind selection to the tenant and only reset it on a tenant change, preserving it across navigation.
- A stale branch selection stays narrow until explicitly cleared; it cannot silently turn into store-wide totals.
- POS captures the branch at the first cart item. Changing branches cannot merge catalogs or complete a sale under a different branch. Voucher evaluation, stock settlement, receipts and loyalty quotes use the sale's branch. Edits preserve the original order's branch.
- Website checkout validates the tenant's branch roster before any backend write. Missing/foreign selections are refused for stores with branches, lookup errors stop the write, and unvalidated branch metadata is removed.

## Verification

Regressions reproduced before fixing: owner analytics requested all branches; Convex North revenue included South and unassigned orders; product analytics returned the store snapshot; branch event queries lacked filtering; POS used the account outlet; unvalidated website metadata survived.

Tests exercise query dispatch, selected-branch changes, real Convex handler predicates against a database test double, platform query filters, legacy attribution, cross-branch carts, website branch validation, original-order edits, and loyalty checkout.

The full merchant app run passed 4,409 tests with two unrelated icon-policy failures in the existing loyalty screens. Final verification passed 1,017 app logic tests in 68 suites, 14 rendered hook/loyalty tests in three suites, and 36 backend/website attribution tests in three suites: 1,067 focused tests total. An earlier wider targeted app run passed 1,048 tests in 73 suites. The wider app runner also reported existing open asynchronous handles after completing assertions. Convex type-check and bundle generation pass. Whole-repository/app type-checks have unrelated existing errors (including KitchenScene's `nowMs` prop and web test/type declarations).

## Rollout and limits

Deploy the web changes and publish the updated Dash app. Upgrade multi-branch Convex tenants to bundle/schema version 30. Branch aggregate requests to older Convex deployments fail visibly; they never fall back to store-wide totals. The generated deployment bundle is refreshed. No new Supabase migration is required.

No production tenant data was changed and no deployments were performed. Historical unattributed orders/events are not guessed into branches; they remain available in all-branches views. Existing bounded analytics read limits remain. The standalone tenant-owned Supabase backend remains unsupported by Dash's analytics adapter; the Supabase analytics coverage here is the shared platform database, and website attribution validation runs before routing to all order backends.
