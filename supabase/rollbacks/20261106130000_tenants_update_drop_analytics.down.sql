-- Restores the policy from 20261026130000. This hands analytics-only staff write
-- access to the store's settings again, so use it only to recover from a break.

set lock_timeout = '3s';

drop policy if exists tenants_update_staff on public.tenants;
create policy tenants_update_staff on public.tenants for update to authenticated
  using (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']))
  with check (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']));
