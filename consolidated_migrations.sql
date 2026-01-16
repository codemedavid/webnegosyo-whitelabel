-- ============================================================================
-- CONSOLIDATED SUPABASE MIGRATIONS
-- Generated for: whitelabel project
-- Contains all migrations from 0001 to 0021 in proper execution order
-- 
-- IMPORTANT: Run this in a fresh Supabase instance.
-- Some migrations have duplicate numbers (0012, 0014) - all are included.
-- ============================================================================

-- ============================================================================
-- 0001_initial.sql - Initial schema for Smart Restaurant Menu System
-- ============================================================================

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


-- ============================================================================
-- 0002_app_users_select.sql - Allow authenticated users to read their own app_users role row
-- ============================================================================

drop policy if exists app_users_select_self on public.app_users;
create policy app_users_select_self on public.app_users
  for select
  using (user_id = auth.uid());


-- ============================================================================
-- 0003_order_items_insert_policy.sql - Allow anonymous users to insert order_items
-- ============================================================================

-- Add insert policy for order_items that allows insertion for orders that exist
-- This ensures order_items can only be added to valid orders
create policy order_items_insert on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
    )
  );


-- ============================================================================
-- 0004_extended_branding.sql - Extended Branding Colors
-- ============================================================================

-- Add new branding columns to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS background_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS header_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS header_font_color text DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS cards_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS cards_border_color text DEFAULT '#e5e7eb',
ADD COLUMN IF NOT EXISTS button_primary_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS button_primary_text_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS button_secondary_color text DEFAULT '#f3f4f6',
ADD COLUMN IF NOT EXISTS button_secondary_text_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS text_primary_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS text_secondary_color text DEFAULT '#6b7280',
ADD COLUMN IF NOT EXISTS text_muted_color text DEFAULT '#9ca3af',
ADD COLUMN IF NOT EXISTS border_color text DEFAULT '#e5e7eb',
ADD COLUMN IF NOT EXISTS success_color text DEFAULT '#10b981',
ADD COLUMN IF NOT EXISTS warning_color text DEFAULT '#f59e0b',
ADD COLUMN IF NOT EXISTS error_color text DEFAULT '#ef4444',
ADD COLUMN IF NOT EXISTS link_color text DEFAULT '#3b82f6',
ADD COLUMN IF NOT EXISTS shadow_color text DEFAULT 'rgba(0, 0, 0, 0.1)';

-- Update existing tenants with default values if they don't have them
UPDATE public.tenants 
SET 
  background_color = COALESCE(background_color, '#ffffff'),
  header_color = COALESCE(header_color, '#ffffff'),
  header_font_color = COALESCE(header_font_color, '#000000'),
  cards_color = COALESCE(cards_color, '#ffffff'),
  cards_border_color = COALESCE(cards_border_color, '#e5e7eb'),
  button_primary_color = COALESCE(button_primary_color, primary_color),
  button_primary_text_color = COALESCE(button_primary_text_color, '#ffffff'),
  button_secondary_color = COALESCE(button_secondary_color, '#f3f4f4'),
  button_secondary_text_color = COALESCE(button_secondary_text_color, '#111111'),
  text_primary_color = COALESCE(text_primary_color, '#111111'),
  text_secondary_color = COALESCE(text_secondary_color, '#6b7280'),
  text_muted_color = COALESCE(text_muted_color, '#9ca3af'),
  border_color = COALESCE(border_color, '#e5e7eb'),
  success_color = COALESCE(success_color, '#10b981'),
  warning_color = COALESCE(warning_color, '#f59e0b'),
  error_color = COALESCE(error_color, '#ef4444'),
  link_color = COALESCE(link_color, '#3b82f6'),
  shadow_color = COALESCE(shadow_color, 'rgba(0, 0, 0, 0.1)')
WHERE background_color IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.tenants.background_color IS 'Main background color for the application';
COMMENT ON COLUMN public.tenants.header_color IS 'Header/navigation background color';
COMMENT ON COLUMN public.tenants.header_font_color IS 'Header text color';
COMMENT ON COLUMN public.tenants.cards_color IS 'Card background color';
COMMENT ON COLUMN public.tenants.cards_border_color IS 'Card border color';
COMMENT ON COLUMN public.tenants.button_primary_color IS 'Primary button background color';
COMMENT ON COLUMN public.tenants.button_primary_text_color IS 'Primary button text color';
COMMENT ON COLUMN public.tenants.button_secondary_color IS 'Secondary button background color';
COMMENT ON COLUMN public.tenants.button_secondary_text_color IS 'Secondary button text color';
COMMENT ON COLUMN public.tenants.text_primary_color IS 'Primary text color';
COMMENT ON COLUMN public.tenants.text_secondary_color IS 'Secondary text color';
COMMENT ON COLUMN public.tenants.text_muted_color IS 'Muted text color';
COMMENT ON COLUMN public.tenants.border_color IS 'General border color';
COMMENT ON COLUMN public.tenants.success_color IS 'Success state color';
COMMENT ON COLUMN public.tenants.warning_color IS 'Warning state color';
COMMENT ON COLUMN public.tenants.error_color IS 'Error state color';
COMMENT ON COLUMN public.tenants.link_color IS 'Link color';
COMMENT ON COLUMN public.tenants.shadow_color IS 'Shadow color';


-- ============================================================================
-- 0005_add_mapbox_enabled.sql - Add Mapbox Enabled Toggle
-- ============================================================================

-- Add mapbox_enabled column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS mapbox_enabled boolean DEFAULT true;

-- Update existing tenants to have Mapbox enabled by default
UPDATE public.tenants 
SET mapbox_enabled = true
WHERE mapbox_enabled IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.mapbox_enabled IS 'Enable/disable Mapbox address autocomplete and map picker for this tenant';


-- ============================================================================
-- 0006_add_enable_order_management.sql - Add Enable Order Management Toggle
-- ============================================================================

-- Add enable_order_management column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS enable_order_management boolean DEFAULT true;

-- Update existing tenants to have order management enabled by default
UPDATE public.tenants 
SET enable_order_management = true
WHERE enable_order_management IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.enable_order_management IS 'Enable/disable order database storage. When disabled, orders only redirect to Messenger without backend tracking';


-- ============================================================================
-- 0007_add_hero_title_and_description.sql - Add hero title/description
-- ============================================================================

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS hero_title text,
ADD COLUMN IF NOT EXISTS hero_description text,
ADD COLUMN IF NOT EXISTS hero_title_color text,
ADD COLUMN IF NOT EXISTS hero_description_color text;

COMMENT ON COLUMN public.tenants.hero_title IS 'Custom hero title shown on the menu page';
COMMENT ON COLUMN public.tenants.hero_description IS 'Custom hero description shown below the title on the menu page';
COMMENT ON COLUMN public.tenants.hero_title_color IS 'Hex/RGB color for the hero title';
COMMENT ON COLUMN public.tenants.hero_description_color IS 'Hex/RGB color for the hero description';


-- ============================================================================
-- 0008_tenants_admin_update_policy.sql - Allow tenant admins to update their own tenant
-- ============================================================================

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


-- ============================================================================
-- 0009_order_types.sql - Order Types and Customer Form Configuration
-- ============================================================================

-- Order Types table
create table if not exists public.order_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('dine_in', 'pickup', 'delivery')),
  name text not null, -- Display name like "Dine In", "Pick Up", "Delivery"
  description text,
  is_enabled boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_types_tenant_type_unique unique (tenant_id, type)
);

create index if not exists order_types_tenant_idx on public.order_types(tenant_id);
create index if not exists order_types_enabled_idx on public.order_types(tenant_id, is_enabled);
create trigger order_types_set_updated_at
  before update on public.order_types
  for each row
  execute function set_updated_at();

-- Customer Form Fields Configuration
create table if not exists public.customer_form_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_type_id uuid not null references public.order_types(id) on delete cascade,
  field_name text not null, -- 'customer_name', 'customer_phone', 'customer_email', 'delivery_address', 'table_number', etc.
  field_label text not null, -- Display label like "Full Name", "Phone Number", "Delivery Address"
  field_type text not null check (field_type in ('text', 'email', 'phone', 'textarea', 'select', 'number')),
  is_required boolean not null default false,
  placeholder text,
  validation_rules jsonb default '{}'::jsonb, -- Additional validation rules
  options jsonb default '[]'::jsonb, -- For select fields
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_form_fields_tenant_idx on public.customer_form_fields(tenant_id);
create index if not exists customer_form_fields_order_type_idx on public.customer_form_fields(order_type_id);
create trigger customer_form_fields_set_updated_at
  before update on public.customer_form_fields
  for each row
  execute function set_updated_at();

-- Update orders table to include order type
alter table public.orders 
add column if not exists order_type_id uuid references public.order_types(id),
add column if not exists order_type text, -- Denormalized for easier queries
add column if not exists customer_data jsonb default '{}'::jsonb; -- Store dynamic customer form data

create index if not exists orders_order_type_idx on public.orders(order_type_id);
create index if not exists orders_order_type_text_idx on public.orders(tenant_id, order_type);

-- Row Level Security
alter table public.order_types enable row level security;
alter table public.customer_form_fields enable row level security;

-- Policies for order_types
create policy order_types_read_active on public.order_types
  for select using (
    is_enabled = true and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.is_active = true
    )
  );

create policy order_types_write_admin on public.order_types
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

-- Policies for customer_form_fields
create policy customer_form_fields_read_active on public.customer_form_fields
  for select using (
    exists (
      select 1 from public.order_types ot
      join public.tenants t on t.id = ot.tenant_id
      where ot.id = order_type_id and ot.is_enabled = true and t.is_active = true
    )
  );

create policy customer_form_fields_write_admin on public.customer_form_fields
  for all
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id))));

-- Insert default order types for existing tenants
insert into public.order_types (tenant_id, type, name, description, order_index)
select 
  t.id as tenant_id,
  'dine_in' as type,
  'Dine In' as name,
  'Enjoy your meal at our restaurant' as description,
  0 as order_index
from public.tenants t
where not exists (
  select 1 from public.order_types ot 
  where ot.tenant_id = t.id and ot.type = 'dine_in'
);

insert into public.order_types (tenant_id, type, name, description, order_index)
select 
  t.id as tenant_id,
  'pickup' as type,
  'Pick Up' as name,
  'Order ahead and pick up at our location' as description,
  1 as order_index
from public.tenants t
where not exists (
  select 1 from public.order_types ot 
  where ot.tenant_id = t.id and ot.type = 'pickup'
);

insert into public.order_types (tenant_id, type, name, description, order_index)
select 
  t.id as tenant_id,
  'delivery' as type,
  'Delivery' as name,
  'Get your order delivered to your door' as description,
  2 as order_index
from public.tenants t
where not exists (
  select 1 from public.order_types ot 
  where ot.tenant_id = t.id and ot.type = 'delivery'
);

-- Insert default form fields for each order type
-- Dine In default fields
insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'customer_name' as field_name,
  'Full Name' as field_label,
  'text' as field_type,
  false as is_required,
  'Enter your name' as placeholder,
  0 as order_index
from public.order_types ot
where ot.type = 'dine_in'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'customer_name'
);

insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'table_number' as field_name,
  'Table Number' as field_label,
  'text' as field_type,
  false as is_required,
  'Enter table number' as placeholder,
  1 as order_index
from public.order_types ot
where ot.type = 'dine_in'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'table_number'
);

-- Pick Up default fields
insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'customer_name' as field_name,
  'Full Name' as field_label,
  'text' as field_type,
  true as is_required,
  'Enter your name' as placeholder,
  0 as order_index
from public.order_types ot
where ot.type = 'pickup'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'customer_name'
);

insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'customer_phone' as field_name,
  'Phone Number' as field_label,
  'phone' as field_type,
  true as is_required,
  'Enter your phone number' as placeholder,
  1 as order_index
from public.order_types ot
where ot.type = 'pickup'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'customer_phone'
);

-- Delivery default fields
insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'customer_name' as field_name,
  'Full Name' as field_label,
  'text' as field_type,
  true as is_required,
  'Enter your name' as placeholder,
  0 as order_index
from public.order_types ot
where ot.type = 'delivery'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'customer_name'
);

insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'customer_phone' as field_name,
  'Phone Number' as field_label,
  'phone' as field_type,
  true as is_required,
  'Enter your phone number' as placeholder,
  1 as order_index
from public.order_types ot
where ot.type = 'delivery'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'customer_phone'
);

insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select 
  ot.tenant_id,
  ot.id as order_type_id,
  'delivery_address' as field_name,
  'Delivery Address' as field_label,
  'textarea' as field_type,
  true as is_required,
  'Enter your complete delivery address' as placeholder,
  2 as order_index
from public.order_types ot
where ot.type = 'delivery'
and not exists (
  select 1 from public.customer_form_fields cff 
  where cff.order_type_id = ot.id and cff.field_name = 'delivery_address'
);


-- ============================================================================
-- 0010_lalamove_delivery.sql - Add Lalamove delivery fields
-- ============================================================================

-- Add Lalamove delivery fields to orders table
alter table public.orders
add column if not exists delivery_fee numeric(10,2) default 0,
add column if not exists lalamove_quotation_id text,
add column if not exists lalamove_order_id text,
add column if not exists lalamove_status text,
add column if not exists lalamove_driver_id text,
add column if not exists lalamove_driver_name text,
add column if not exists lalamove_driver_phone text,
add column if not exists lalamove_tracking_url text;

-- Add comment for documentation
comment on column public.orders.delivery_fee is 'Delivery fee charged by Lalamove';
comment on column public.orders.lalamove_quotation_id is 'Lalamove quotation ID';
comment on column public.orders.lalamove_order_id is 'Lalamove order ID';
comment on column public.orders.lalamove_status is 'Current status of Lalamove delivery';
comment on column public.orders.lalamove_driver_id is 'Lalamove driver ID';
comment on column public.orders.lalamove_driver_name is 'Lalamove driver name';
comment on column public.orders.lalamove_driver_phone is 'Lalamove driver phone number';
comment on column public.orders.lalamove_tracking_url is 'Lalamove tracking URL for the delivery';

-- Add Lalamove configuration to tenants table
alter table public.tenants
add column if not exists lalamove_api_key text,
add column if not exists lalamove_secret_key text,
add column if not exists lalamove_market text,
add column if not exists lalamove_enabled boolean default false,
add column if not exists lalamove_service_type text,
add column if not exists lalamove_sandbox boolean default true;

-- Add comment for documentation
comment on column public.tenants.lalamove_api_key is 'Lalamove public API key';
comment on column public.tenants.lalamove_secret_key is 'Lalamove secret API key';
comment on column public.tenants.lalamove_market is 'Lalamove market code (e.g., HK, SG, TH)';
comment on column public.tenants.lalamove_enabled is 'Whether Lalamove delivery is enabled for this tenant';
comment on column public.tenants.lalamove_service_type is 'Lalamove service type (e.g., MOTORCYCLE, VAN, CAR)';
comment on column public.tenants.lalamove_sandbox is 'Whether to use Lalamove sandbox environment';

-- Add restaurant address fields to tenants (needed for Lalamove pickup)
alter table public.tenants
add column if not exists restaurant_address text,
add column if not exists restaurant_latitude numeric(10,8),
add column if not exists restaurant_longitude numeric(11,8);

-- Add comments for documentation
comment on column public.tenants.restaurant_address is 'Restaurant physical address for delivery pickup';
comment on column public.tenants.restaurant_latitude is 'Restaurant latitude coordinate';
comment on column public.tenants.restaurant_longitude is 'Restaurant longitude coordinate';


-- ============================================================================
-- 0011_auto_create_order_types.sql - Auto-create default order types for new tenants
-- ============================================================================

-- Function to create default order types for a tenant
create or replace function create_default_order_types_for_tenant()
returns trigger as $$
declare
  dine_in_id uuid;
  pickup_id uuid;
  delivery_id uuid;
begin
  -- Create Dine In order type
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (new.id, 'dine_in', 'Dine In', 'Enjoy your meal at our restaurant', 0, true)
  returning id into dine_in_id;

  -- Create default form fields for Dine In
  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values 
    (new.id, dine_in_id, 'customer_name', 'Full Name', 'text', false, 'Enter your name', 0),
    (new.id, dine_in_id, 'table_number', 'Table Number', 'text', false, 'Enter table number', 1);

  -- Create Pick Up order type
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (new.id, 'pickup', 'Pick Up', 'Order ahead and pick up at our location', 1, true)
  returning id into pickup_id;

  -- Create default form fields for Pick Up
  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values 
    (new.id, pickup_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (new.id, pickup_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1);

  -- Create Delivery order type
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (new.id, 'delivery', 'Delivery', 'Get your order delivered to your door', 2, true)
  returning id into delivery_id;

  -- Create default form fields for Delivery
  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values 
    (new.id, delivery_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (new.id, delivery_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1),
    (new.id, delivery_id, 'delivery_address', 'Delivery Address', 'textarea', true, 'Enter your complete delivery address', 2);

  return new;
end;
$$ language plpgsql;

-- Create trigger that runs after a tenant is inserted
drop trigger if exists auto_create_order_types_on_tenant_insert on public.tenants;
create trigger auto_create_order_types_on_tenant_insert
  after insert on public.tenants
  for each row
  execute function create_default_order_types_for_tenant();

-- Also create a function that can be called manually to initialize order types for existing tenants
create or replace function initialize_order_types_for_tenant(tenant_uuid uuid)
returns void as $$
declare
  dine_in_id uuid;
  pickup_id uuid;
  delivery_id uuid;
begin
  -- Skip if order types already exist
  if exists (select 1 from public.order_types where tenant_id = tenant_uuid) then
    return;
  end if;

  -- Create Dine In order type
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (tenant_uuid, 'dine_in', 'Dine In', 'Enjoy your meal at our restaurant', 0, true)
  returning id into dine_in_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values 
    (tenant_uuid, dine_in_id, 'customer_name', 'Full Name', 'text', false, 'Enter your name', 0),
    (tenant_uuid, dine_in_id, 'table_number', 'Table Number', 'text', false, 'Enter table number', 1);

  -- Create Pick Up order type
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (tenant_uuid, 'pickup', 'Pick Up', 'Order ahead and pick up at our location', 1, true)
  returning id into pickup_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values 
    (tenant_uuid, pickup_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (tenant_uuid, pickup_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1);

  -- Create Delivery order type
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (tenant_uuid, 'delivery', 'Delivery', 'Get your order delivered to your door', 2, true)
  returning id into delivery_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values 
    (tenant_uuid, delivery_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (tenant_uuid, delivery_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1),
    (tenant_uuid, delivery_id, 'delivery_address', 'Delivery Address', 'textarea', true, 'Enter your complete delivery address', 2);
end;
$$ language plpgsql security definer;

-- Initialize order types for any existing tenants that don't have them
do $$
declare
  tenant_record record;
begin
  for tenant_record in 
    select id from public.tenants 
    where not exists (
      select 1 from public.order_types where tenant_id = tenants.id
    )
  loop
    perform initialize_order_types_for_tenant(tenant_record.id);
  end loop;
end $$;


-- ============================================================================
-- 0012_payment_methods.sql - Payment Methods and Payment Status
-- ============================================================================

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


-- ============================================================================
-- 0012_variation_types.sql - Enhanced Variation Types System
-- ============================================================================

-- Add comment to document the new variation_types structure
COMMENT ON COLUMN public.menu_items.variations IS 'Legacy flat variations array. Use variation_types for new items.';


-- ============================================================================
-- 0013_fix_payment_method_rls.sql - Fix RLS Policies for Payment Method Order Types
-- ============================================================================

-- Drop existing restrictive policies
drop policy if exists payment_method_order_types_write_admin on public.payment_method_order_types;

-- Create more permissive admin write policy
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


-- ============================================================================
-- 0014_add_variation_types_column.sql - Add variation_types column to menu_items table
-- ============================================================================

-- Add variation_types column
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS variation_types jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add comment to document the structure
COMMENT ON COLUMN public.menu_items.variation_types IS 'Grouped variation types with options. Each type can have multiple options with images.';


-- ============================================================================
-- 0014_card_text_colors.sql - Add card text color customization fields
-- ============================================================================

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS card_title_color text,
ADD COLUMN IF NOT EXISTS card_price_color text,
ADD COLUMN IF NOT EXISTS card_description_color text;

-- Add helpful comments
COMMENT ON COLUMN public.tenants.card_title_color IS 'Color for menu item titles on cards (defaults to text_primary_color)';
COMMENT ON COLUMN public.tenants.card_price_color IS 'Color for prices on menu item cards (defaults to primary_color)';
COMMENT ON COLUMN public.tenants.card_description_color IS 'Color for descriptions on menu item cards (defaults to text_secondary_color)';


-- ============================================================================
-- 0015_modal_branding.sql - Add modal branding customization fields
-- ============================================================================

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS modal_background_color text,
ADD COLUMN IF NOT EXISTS modal_title_color text,
ADD COLUMN IF NOT EXISTS modal_price_color text,
ADD COLUMN IF NOT EXISTS modal_description_color text;

-- Add helpful comments
COMMENT ON COLUMN public.tenants.modal_background_color IS 'Background color for item detail modals (defaults to cards_color)';
COMMENT ON COLUMN public.tenants.modal_title_color IS 'Title color in item detail modals (defaults to text_primary_color)';
COMMENT ON COLUMN public.tenants.modal_price_color IS 'Price color in item detail modals (defaults to primary_color)';
COMMENT ON COLUMN public.tenants.modal_description_color IS 'Description color in item detail modals (defaults to text_secondary_color)';


-- ============================================================================
-- 0016_add_card_template.sql - Add card_template field to tenants table
-- ============================================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS card_template text DEFAULT 'classic';

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.card_template IS 
  'Menu card template style: classic, minimal, modern, elegant, compact, or bold';


-- ============================================================================
-- 0017_messenger_sessions.sql - Messenger Sessions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messenger_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psid TEXT UNIQUE NOT NULL,  -- Facebook Page-Scoped ID (unique per user)
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cart_data JSONB DEFAULT '[]'::jsonb,  -- Array of cart items
  checkout_state JSONB DEFAULT '{}'::jsonb,  -- Order type, customer data, payment method
  state TEXT DEFAULT 'menu' NOT NULL,  -- Current conversation state
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- State validation
  CONSTRAINT messenger_sessions_state_ck CHECK (
    state IN (
      'menu', 
      'selecting_item', 
      'selecting_variation', 
      'selecting_addons', 
      'selecting_quantity',
      'cart', 
      'checkout_order_type', 
      'checkout_customer', 
      'checkout_payment', 
      'checkout_confirm',
      'order_confirmed'
    )
  )
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_psid ON public.messenger_sessions(psid);
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_tenant ON public.messenger_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_state ON public.messenger_sessions(state);
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_updated ON public.messenger_sessions(updated_at);

-- Auto-update timestamp
CREATE TRIGGER messenger_sessions_set_updated_at
  BEFORE UPDATE ON public.messenger_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.messenger_sessions IS 
  'Stores user sessions for Facebook Messenger bot, including cart and checkout state';
COMMENT ON COLUMN public.messenger_sessions.psid IS 
  'Facebook Page-Scoped ID - unique identifier for Messenger user';
COMMENT ON COLUMN public.messenger_sessions.cart_data IS 
  'JSON array of cart items with menu_item_id, quantity, variations, addons, price';
COMMENT ON COLUMN public.messenger_sessions.checkout_state IS 
  'JSON object storing checkout progress: order_type_id, customer_data, payment_method_id';
COMMENT ON COLUMN public.messenger_sessions.state IS 
  'Current conversation state: menu, selecting_item, selecting_variation, selecting_addons, selecting_quantity, cart, checkout_order_type, checkout_customer, checkout_payment, checkout_confirm, order_confirmed';


-- ============================================================================
-- 0018_add_messenger_page_access_token.sql - Add messenger_page_access_token column
-- ============================================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS messenger_page_access_token text;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.messenger_page_access_token IS 
  'Tenant-specific Facebook Page Access Token. If not set, falls back to global FACEBOOK_PAGE_ACCESS_TOKEN environment variable. Allows each restaurant to connect their own Facebook page independently.';


-- ============================================================================
-- 0019_facebook_pages.sql - Facebook Pages Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT, -- Long-lived user token for refreshing page token
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_facebook_pages_tenant ON public.facebook_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_page_id ON public.facebook_pages(page_id);

-- Auto-update timestamp
CREATE TRIGGER facebook_pages_set_updated_at
  BEFORE UPDATE ON public.facebook_pages
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.facebook_pages IS 
  'Stores Facebook Page connections for tenants. Each tenant can connect one or more Facebook Pages for Messenger order notifications.';
COMMENT ON COLUMN public.facebook_pages.page_id IS 
  'Facebook Page ID from Graph API';
COMMENT ON COLUMN public.facebook_pages.page_access_token IS 
  'Page Access Token for sending messages via Messenger API';
COMMENT ON COLUMN public.facebook_pages.user_access_token IS 
  'Long-lived user access token for refreshing page tokens when they expire';

-- Add optional foreign key reference to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS facebook_page_id UUID REFERENCES public.facebook_pages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.facebook_page_id IS 
  'Reference to the primary Facebook Page connected for this tenant';


-- ============================================================================
-- 0020_add_banners.sql - Add banner fields to tenants table
-- ============================================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS announcement_text text,
ADD COLUMN IF NOT EXISTS announcement_bg_color text DEFAULT '#FFF4E5',
ADD COLUMN IF NOT EXISTS announcement_text_color text DEFAULT '#663C00',
ADD COLUMN IF NOT EXISTS is_announcement_visible boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS promotion_image_url text,
ADD COLUMN IF NOT EXISTS is_promotion_visible boolean DEFAULT false;


-- ============================================================================
-- 0021_add_promotion_banners.sql - Add promotion_banners JSONB column
-- ============================================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS promotion_banners jsonb DEFAULT '[]'::jsonb;

-- COMMENT: Structure of promotion_banners JSONB array:
-- [
--   {
--     "id": "uuid-string",
--     "imageUrl": "https://example.com/image.jpg",
--     "title": "Optional Title",
--     "description": "Optional Description"
--   }
-- ]


-- ============================================================================
-- END OF CONSOLIDATED MIGRATIONS
-- ============================================================================
