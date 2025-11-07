-- Payment Methods and Payment Status
-- Migration: 0012_payment_methods.sql

-- Payment Methods table
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  details text,
  qr_code_url text,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_methods_tenant_idx on public.payment_methods(tenant_id);
create index if not exists payment_methods_active_idx on public.payment_methods(tenant_id, is_active);
create index if not exists payment_methods_order_idx on public.payment_methods(tenant_id, order_index);

create trigger payment_methods_set_updated_at
  before update on public.payment_methods
  for each row
  execute function set_updated_at();

-- Payment Method Order Types Junction table
create table if not exists public.payment_method_order_types (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  order_type_id uuid not null references public.order_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint payment_method_order_types_unique unique (payment_method_id, order_type_id)
);

create index if not exists payment_method_order_types_payment_idx on public.payment_method_order_types(payment_method_id);
create index if not exists payment_method_order_types_order_type_idx on public.payment_method_order_types(order_type_id);

-- Update orders table to include payment information
alter table public.orders add column if not exists payment_method_id uuid references public.payment_methods(id);
alter table public.orders add column if not exists payment_method_name text;
alter table public.orders add column if not exists payment_method_details text;
alter table public.orders add column if not exists payment_method_qr_code_url text;
alter table public.orders add column if not exists payment_status text default 'pending';

-- Add constraint for payment_status
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'orders_payment_status_ck'
  ) then
    alter table public.orders add constraint orders_payment_status_ck 
      check (payment_status in ('pending', 'paid', 'failed', 'verified'));
  end if;
end $$;

create index if not exists orders_payment_method_idx on public.orders(payment_method_id);
create index if not exists orders_payment_status_idx on public.orders(tenant_id, payment_status);

-- Row Level Security
alter table public.payment_methods enable row level security;
alter table public.payment_method_order_types enable row level security;

-- Policies for payment_methods
-- Public can read active payment methods for active tenants
create policy payment_methods_read_active on public.payment_methods
  for select using (
    is_active = true and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.is_active = true
    )
  );

-- Admins can manage payment methods for their tenant
create policy payment_methods_write_admin on public.payment_methods
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

-- Policies for payment_method_order_types
-- Public can read associations for active payment methods
create policy payment_method_order_types_read_active on public.payment_method_order_types
  for select using (
    exists (
      select 1 from public.payment_methods pm
      join public.tenants t on t.id = pm.tenant_id
      where pm.id = payment_method_id and pm.is_active = true and t.is_active = true
    )
  );

-- Admins can manage associations for their tenant
create policy payment_method_order_types_write_admin on public.payment_method_order_types
  for all
  using (
    exists (
      select 1 from public.payment_methods pm
      where pm.id = payment_method_id 
      and exists (
        select 1 from public.app_users au 
        where au.user_id = auth.uid() 
        and (
          au.role = 'superadmin' 
          or (au.role = 'admin' and au.tenant_id = pm.tenant_id)
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.payment_methods pm
      where pm.id = payment_method_id 
      and exists (
        select 1 from public.app_users au 
        where au.user_id = auth.uid() 
        and (
          au.role = 'superadmin' 
          or (au.role = 'admin' and au.tenant_id = pm.tenant_id)
        )
      )
    )
  );

