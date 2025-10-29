-- Allow tenant admins to update their own tenant branding and hero content

-- Ensure RLS is enabled (should already be from initial migration)
alter table public.tenants enable row level security;

-- Drop existing policy if present (Postgres doesn't support IF NOT EXISTS for create policy)
drop policy if exists tenants_write_admin on public.tenants;

-- Admins can update only the tenant row that matches their assigned tenant_id
create policy tenants_write_admin on public.tenants
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.role = 'admin'
        and au.tenant_id = id
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.role = 'admin'
        and au.tenant_id = id
    )
  );


