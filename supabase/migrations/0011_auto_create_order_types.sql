-- Auto-create default order types for new tenants
-- This trigger ensures that when a new tenant is created, they automatically get all default order types

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

