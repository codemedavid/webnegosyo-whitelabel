-- Move per-tenant integration secrets off `public.tenants`.
--
-- `tenants_read_active` (0001_initial.sql) is a row policy for role `public`
-- and the table carries a whole-table SELECT grant for `anon` and
-- `authenticated`. That was fine for branding, but five later columns are
-- credentials: anyone holding the shipped anon key could read every
-- merchant's Lalamove keys, Messenger page token, Convex deploy key and
-- Loyverse token. RLS cannot hide a column, and a column-level grant (the
-- facebook_pages fix, 20260815120000) breaks every `select=*` reader and has
-- to be re-issued for every future column. So the secrets get their own
-- row-scoped table instead.
--
-- Step 1 of 2: create + copy. The columns stay on `tenants` until the web app
-- reads from here; 20260904130000_tenant_secrets_drop_columns.sql removes
-- them and must be applied only AFTER that deploy.

create table if not exists public.tenant_secrets (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  lalamove_api_key text,
  lalamove_secret_key text,
  messenger_page_access_token text,
  convex_deploy_key text,
  loyverse_access_token text,
  updated_at timestamptz not null default now()
);

comment on table public.tenant_secrets is
  'Per-tenant integration credentials. Never granted to anon; row-scoped to the owning tenant''s admins and superadmins. Server code reads it with the service role.';

insert into public.tenant_secrets (
  tenant_id, lalamove_api_key, lalamove_secret_key, messenger_page_access_token,
  convex_deploy_key, loyverse_access_token
)
select id, lalamove_api_key, lalamove_secret_key, messenger_page_access_token,
       convex_deploy_key, loyverse_access_token
from public.tenants
on conflict (tenant_id) do nothing;

alter table public.tenant_secrets enable row level security;

revoke all on public.tenant_secrets from anon;
revoke all on public.tenant_secrets from authenticated;
grant select, insert, update on public.tenant_secrets to authenticated;

-- A tenant's own admins may read and write their store's secrets. The
-- predicate compares the app_users row to THIS row's tenant (not to itself —
-- see the tenants_write_admin regression fixed in 20260801*).
drop policy if exists tenant_secrets_admin_select on public.tenant_secrets;
create policy tenant_secrets_admin_select on public.tenant_secrets
  for select to authenticated
  using (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'admin'
      and au.tenant_id = tenant_secrets.tenant_id
  ));

drop policy if exists tenant_secrets_admin_insert on public.tenant_secrets;
create policy tenant_secrets_admin_insert on public.tenant_secrets
  for insert to authenticated
  with check (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'admin'
      and au.tenant_id = tenant_secrets.tenant_id
  ));

drop policy if exists tenant_secrets_admin_update on public.tenant_secrets;
create policy tenant_secrets_admin_update on public.tenant_secrets
  for update to authenticated
  using (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'admin'
      and au.tenant_id = tenant_secrets.tenant_id
  ))
  with check (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'admin'
      and au.tenant_id = tenant_secrets.tenant_id
  ));

drop policy if exists tenant_secrets_superadmin_all on public.tenant_secrets;
create policy tenant_secrets_superadmin_all on public.tenant_secrets
  for all to authenticated
  using (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and au.role = 'superadmin'
  ))
  with check (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and au.role = 'superadmin'
  ));

-- Keep updated_at honest without trusting the client.
create or replace function public.tenant_secrets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tenant_secrets_touch_updated_at on public.tenant_secrets;
create trigger tenant_secrets_touch_updated_at
  before update on public.tenant_secrets
  for each row execute function public.tenant_secrets_touch_updated_at();
