-- supabase/migrations/20260728140000_order_backend_convex_drift_backfill.sql
--
-- Repair `order_backend` for tenants that were given a Convex deployment AFTER
-- the 20260721000000 backfill ran. Nothing in the tenant create/update path
-- wrote that column, so those rows kept the `platform` default while checkout
-- routed their orders to Convex — the web admin then read the empty shared
-- platform database and showed "requires Convex setup".
--
-- This only aligns the column with where the orders already live; it never
-- moves an order. `src/lib/order-backend.ts` now also treats `platform` as a
-- fallback rather than an explicit selection, so this is belt-and-braces, and
-- `orderBackendForSave` keeps the column truthful from here on.
--
-- Deliberately does NOT touch `order_backend = 'supabase'` rows: that is an
-- explicit selection and a lingering Convex URL must not override it.

update public.tenants
  set order_backend = 'convex'
  where order_backend = 'platform'
    and convex_deployment_url is not null
    and convex_deployment_url <> '';

-- Rollback (restores the drift, not recommended):
--   update public.tenants set order_backend = 'platform'
--     where order_backend = 'convex';
