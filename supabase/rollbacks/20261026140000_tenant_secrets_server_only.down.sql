-- Rollback for 20261026140000_tenant_secrets_server_only.sql: restores the
-- store-admin read of tenant_secrets exactly as it was on the platform project.
-- The legacy upsell_pairs policies are not restored (they were never live).
create policy tenant_secrets_admin_select on public.tenant_secrets for select to authenticated
  using (exists (select 1 from public.app_users au
    where au.user_id = auth.uid() and au.role = 'admin' and au.tenant_id = tenant_secrets.tenant_id));
