-- The hook runs as supabase_auth_admin with invoker privileges. The SELECT
-- grant in 20260910120000 is insufficient under RLS: auth.uid() is not the
-- user being issued a token, so app_users_select_self hides their membership.
-- Tokens then omit wn_role/wn_tenant_id and Convex rejects even store admins.
grant usage on schema public to supabase_auth_admin;
grant select (user_id, role, tenant_id) on public.app_users to supabase_auth_admin;

drop policy if exists app_users_auth_hook_read on public.app_users;
create policy app_users_auth_hook_read on public.app_users
  for select to supabase_auth_admin
  using (true);
