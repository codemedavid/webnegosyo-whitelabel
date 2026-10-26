-- Store credentials are read by the server only (security review 2026-10-26)
--
-- tenant_secrets holds the store's Lalamove, Loyverse, Semaphore and Convex
-- keys. tenant_secrets_admin_select let ANY role='admin' account of the store
-- read them straight through PostgREST, a pos-only cashier included. Every
-- reader in the code uses the service role (the delivery settings page moved to
-- it in the same change and only ever shows the owner a "keys saved" boolean),
-- so the client read goes. tenant_secrets_superadmin_all stays.
--
-- Also: 20260207000001_menu_engineering.sql created per-command upsell_pairs
-- write policies that check only the store, not a permission. They are not on
-- the platform project (it carried one "Admins can manage upsell pairs"
-- policy, replaced by 20261026130000), but a database rebuilt from the
-- migrations would still have them. Dropped here so the chain matches live.
--
-- Rollback: supabase/rollbacks/20261026140000_tenant_secrets_server_only.down.sql

drop policy if exists tenant_secrets_admin_select on public.tenant_secrets;

drop policy if exists "Admins can insert upsell pairs for their tenant" on public.upsell_pairs;
drop policy if exists "Admins can update upsell pairs for their tenant" on public.upsell_pairs;
drop policy if exists "Admins can delete upsell pairs for their tenant" on public.upsell_pairs;
drop policy if exists "Superadmins can manage all upsell pairs" on public.upsell_pairs;
