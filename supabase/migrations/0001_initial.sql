-- Initial schema for Smart Restaurant Menu System
-- Compatible with Supabase (PostgreSQL)

-- Extensions
create extension if not exists pgcrypto; -- for gen_random_uuid()

-- Timestamp trigger to keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Tenants
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  domain text,
  logo_url text not null default '',
  primary_color text not null default '#111111',
  secondary_color text not null default '#666666',
  accent_color text,
  messenger_page_id text not null default '',
  messenger_username text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row
  execute function set_updated_at();

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  "order" integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_tenant_idx on public.categories(tenant_id);
create index if not exists categories_order_idx on public.categories(tenant_id, "order");
create trigger categories_set_updated_at
  before update on public.categories
  for each row
  execute function set_updated_at();

-- Menu Items
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text not null,
  price numeric(10,2) not null,
  discounted_price numeric(10,2),
  image_url text not null,
  -- Keep variations/addons as JSONB initially for quick iteration; can normalize later
  variations jsonb not null default '[]'::jsonb,
  addons jsonb not null default '[]'::jsonb,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_items_price_ck check (price >= 0),
  constraint menu_items_discount_ck check (discounted_price is null or discounted_price >= 0)
);
create index if not exists menu_items_tenant_idx on public.menu_items(tenant_id);
create index if not exists menu_items_category_idx on public.menu_items(category_id);
create index if not exists menu_items_order_idx on public.menu_items(tenant_id, category_id, "order");
create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row
  execute function set_updated_at();

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_name text,
  customer_contact text,
  total numeric(10,2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_ck check (total >= 0),
  constraint orders_status_ck check (status in ('pending','confirmed','preparing','ready','delivered','cancelled'))
);
create index if not exists orders_tenant_idx on public.orders(tenant_id);
create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function set_updated_at();

-- Order Items (normalized from OrderItem[])
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  menu_item_name text not null,
  variation text,
  addons text[] not null default '{}',
  quantity integer not null default 1,
  price numeric(10,2) not null,
  subtotal numeric(10,2) not null,
  special_instructions text,
  constraint order_items_qty_ck check (quantity > 0),
  constraint order_items_price_ck check (price >= 0),
  constraint order_items_subtotal_ck check (subtotal >= 0)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- App Users (links to auth.users)
create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_role_ck check (role in ('superadmin','admin'))
);
create index if not exists app_users_tenant_idx on public.app_users(tenant_id);
create trigger app_users_set_updated_at
  before update on public.app_users
  for each row
  execute function set_updated_at();

-- Row Level Security
alter table public.tenants enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.app_users enable row level security;

-- Policies: Public read for active/available data
create policy tenants_read_active on public.tenants
  for select using (is_active = true);

create policy categories_read_active on public.categories
  for select using (
    exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.is_active = true
    ) and is_active = true
  );

create policy menu_items_read_available on public.menu_items
  for select using (
    is_available = true and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.is_active = true
    )
  );

-- Orders: allow anyone to insert (customers), but mask reads by tenant
create policy orders_insert on public.orders
  for insert with check (true);

create policy orders_select_by_tenant on public.orders
  for select using (
    -- superadmin can read all; admin only their tenant
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and (
        au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id)
      )
    )
  );

create policy order_items_select_by_order on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      join public.app_users au on au.user_id = auth.uid()
      where o.id = order_id and (
        au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = o.tenant_id)
      )
    )
  );

-- Admin write policies (admins only within their tenant; superadmin global)
create policy tenants_write_superadmin on public.tenants
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));

create policy categories_write_admin on public.categories
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

create policy menu_items_write_admin on public.menu_items
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

create policy orders_write_admin on public.orders
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

create policy order_items_write_admin on public.order_items
  for all
  using (exists (
    select 1 from public.orders o
    join public.app_users au on au.user_id = auth.uid()
    where o.id = order_id and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = o.tenant_id))
  ))
  with check (exists (
    select 1 from public.orders o
    join public.app_users au on au.user_id = auth.uid()
    where o.id = order_id and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = o.tenant_id))
  ));

-- Helpful views or future TODOs can be added in later migrations


