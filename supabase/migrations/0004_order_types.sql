-- Order Types and Customer Form Configuration
-- Migration: 0004_order_types.sql

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
