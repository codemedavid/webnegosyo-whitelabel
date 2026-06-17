-- Restore default order-type seeding for tenants.
--
-- Migration 0011 defined an auto-create trigger and an RPC to seed the three
-- default order types (Dine In / Pick Up / Delivery) with their customer form
-- fields. On the live database the trigger was never attached and the RPC
-- `initialize_order_types_for_tenant` is missing, so:
--   * new tenants are created without any order types, and
--   * the admin "Add default order types" action / page auto-init fails because
--     the RPC it calls does not exist.
--
-- This migration recreates the RPC and re-attaches the trigger idempotently,
-- then backfills any existing tenants that have no order types.

-- Trigger function: create default order types + form fields on tenant insert
create or replace function create_default_order_types_for_tenant()
returns trigger as $$
declare
  dine_in_id uuid;
  pickup_id uuid;
  delivery_id uuid;
begin
  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (new.id, 'dine_in', 'Dine In', 'Enjoy your meal at our restaurant', 0, true)
  returning id into dine_in_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values
    (new.id, dine_in_id, 'customer_name', 'Full Name', 'text', false, 'Enter your name', 0),
    (new.id, dine_in_id, 'table_number', 'Table Number', 'text', false, 'Enter table number', 1);

  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (new.id, 'pickup', 'Pick Up', 'Order ahead and pick up at our location', 1, true)
  returning id into pickup_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values
    (new.id, pickup_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (new.id, pickup_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1);

  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (new.id, 'delivery', 'Delivery', 'Get your order delivered to your door', 2, true)
  returning id into delivery_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values
    (new.id, delivery_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (new.id, delivery_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1),
    (new.id, delivery_id, 'delivery_address', 'Delivery Address', 'textarea', true, 'Enter your complete delivery address', 2);

  return new;
end;
$$ language plpgsql;

-- Re-attach the trigger so every new tenant gets defaults automatically
drop trigger if exists auto_create_order_types_on_tenant_insert on public.tenants;
create trigger auto_create_order_types_on_tenant_insert
  after insert on public.tenants
  for each row
  execute function create_default_order_types_for_tenant();

-- RPC the app calls to seed defaults on demand (idempotent per tenant)
create or replace function initialize_order_types_for_tenant(tenant_uuid uuid)
returns void as $$
declare
  dine_in_id uuid;
  pickup_id uuid;
  delivery_id uuid;
begin
  if exists (select 1 from public.order_types where tenant_id = tenant_uuid) then
    return;
  end if;

  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (tenant_uuid, 'dine_in', 'Dine In', 'Enjoy your meal at our restaurant', 0, true)
  returning id into dine_in_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values
    (tenant_uuid, dine_in_id, 'customer_name', 'Full Name', 'text', false, 'Enter your name', 0),
    (tenant_uuid, dine_in_id, 'table_number', 'Table Number', 'text', false, 'Enter table number', 1);

  insert into public.order_types (tenant_id, type, name, description, order_index, is_enabled)
  values (tenant_uuid, 'pickup', 'Pick Up', 'Order ahead and pick up at our location', 1, true)
  returning id into pickup_id;

  insert into public.customer_form_fields (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
  values
    (tenant_uuid, pickup_id, 'customer_name', 'Full Name', 'text', true, 'Enter your name', 0),
    (tenant_uuid, pickup_id, 'customer_phone', 'Phone Number', 'phone', true, 'Enter your phone number', 1);

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

-- Backfill existing tenants that currently have no order types
do $$
declare
  tenant_record record;
begin
  for tenant_record in
    select id from public.tenants t
    where not exists (
      select 1 from public.order_types ot where ot.tenant_id = t.id
    )
  loop
    perform initialize_order_types_for_tenant(tenant_record.id);
  end loop;
end $$;
