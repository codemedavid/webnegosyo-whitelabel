-- ===========================================================================
-- tenants_update_staff: `analytics` no longer writes store settings.
--
-- The policy let any account holding store_setup, settings OR analytics update
-- the whole tenants row (RLS cannot narrow columns), so a Growth & Analytics
-- account could rewrite branding, delivery fees and Messenger settings through
-- PostgREST with its own token. Privileged columns stayed guarded by
-- guard_tenant_privileged_columns; everything else was open to it.
--
-- The one legitimate analytics write, Boost Sales' checkout_upsell_* settings,
-- now goes through the service role after a permission check
-- (updateCheckoutUpsellSettings, menu-engineering-service.ts).
--
-- APPLY AFTER THE WEB DEPLOY. A web build older than that writes those settings
-- with the session client; once this runs, an analytics-only account's save there
-- fails (`.single()` on zero rows) until the new build is live.
--
-- Rollback: supabase/rollbacks/20261106130000_tenants_update_drop_analytics.down.sql
-- Runner:   tests/sql/run-tenants-update-drop-analytics.cjs
-- ===========================================================================

set lock_timeout = '3s';

drop policy if exists tenants_update_staff on public.tenants;
create policy tenants_update_staff on public.tenants for update to authenticated
  using (public.app_user_holds_any_permission(id, array['store_setup', 'settings']))
  with check (public.app_user_holds_any_permission(id, array['store_setup', 'settings']));
