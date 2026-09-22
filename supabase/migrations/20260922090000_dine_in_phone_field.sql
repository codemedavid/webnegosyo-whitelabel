-- Dine-in collects an optional phone number.
--
-- Dine In was seeded with a name and a table number only. A seated customer is
-- already in the room, so nothing about the order needs a number — but the
-- kitchen calling about a sold-out item, an order left at the counter, and
-- every loyalty/marketing surface that keys on a phone number all go dark
-- without one. `is_required = false` is the whole point: a walk-in who does not
-- want to give a number is never blocked from ordering.
--
-- Three places have to agree, and this migration touches all three:
--   1. the tenant-insert trigger (new stores),
--   2. `initialize_order_types_for_tenant` (the admin's "Add default order
--      types" button, and the page's auto-init), and
--   3. the dine-in order types that already exist.
--
-- The app-side mirror of these defaults lives in
-- `src/lib/order-types/default-form-fields.ts` — change the two together.

-- 1. New tenants ------------------------------------------------------------

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
    (new.id, dine_in_id, 'table_number', 'Table Number', 'text', false, 'Enter table number', 1),
    (new.id, dine_in_id, 'customer_phone', 'Phone Number', 'phone', false, 'Enter your phone number', 2);

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

-- 2. On-demand seeding ------------------------------------------------------

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
    (tenant_uuid, dine_in_id, 'table_number', 'Table Number', 'text', false, 'Enter table number', 1),
    (tenant_uuid, dine_in_id, 'customer_phone', 'Phone Number', 'phone', false, 'Enter your phone number', 2);

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

-- 3. Existing dine-in order types -------------------------------------------
--
-- Idempotent: only dine-in types that have no `customer_phone` field get one,
-- appended after whatever the merchant already configured so an existing form
-- order is never rearranged.

insert into public.customer_form_fields
  (tenant_id, order_type_id, field_name, field_label, field_type, is_required, placeholder, order_index)
select
  ot.tenant_id,
  ot.id,
  'customer_phone',
  'Phone Number',
  'phone',
  false,
  'Enter your phone number',
  coalesce(
    (select max(f.order_index) + 1
       from public.customer_form_fields f
      where f.order_type_id = ot.id),
    0
  )
from public.order_types ot
where ot.type = 'dine_in'
  and not exists (
    select 1
      from public.customer_form_fields f
     where f.order_type_id = ot.id
       and f.field_name = 'customer_phone'
  );
