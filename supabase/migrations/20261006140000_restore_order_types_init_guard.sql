-- Regression fix: 20260922090000_dine_in_phone_field re-created
-- `initialize_order_types_for_tenant` with a plain CREATE OR REPLACE, which
-- silently dropped two things 20260910150000_order_types_init_tenant_guard had
-- added:
--   * the in-function tenant guard — any signed-in account could again seed
--     order types + customer form fields into ANY tenant that had none, by
--     calling /rest/v1/rpc/initialize_order_types_for_tenant directly;
--   * the pinned search_path (advisor 0011 on a SECURITY DEFINER function).
-- The trigger twin `create_default_order_types_for_tenant` lost its pinned
-- search_path the same way.
--
-- Bodies below are the 20260922 versions (dine-in phone field included) with
-- the guard and search_path restored. A future CREATE OR REPLACE of either
-- function MUST carry `security definer` (RPC only), the guard and `set
-- search_path`; tests/unit/migrations/definer-function-attributes.test.ts
-- fails the build if the latest definition drops them.

create or replace function public.initialize_order_types_for_tenant(tenant_uuid uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  dine_in_id uuid;
  pickup_id uuid;
  delivery_id uuid;
begin
  -- Service-role / migration callers have no auth.uid() and stay allowed.
  if auth.uid() is not null and not exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and (
        au.role = 'superadmin'
        or (au.role = 'admin' and au.tenant_id = tenant_uuid and au.outlet_id is null)
      )
  ) then
    raise exception 'not allowed to initialize order types for this tenant'
      using errcode = '42501';
  end if;

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
$function$;

revoke execute on function public.initialize_order_types_for_tenant(uuid) from public, anon;
grant execute on function public.initialize_order_types_for_tenant(uuid) to authenticated, service_role;

-- Trigger function: body unchanged, only the search_path is pinned again.
alter function public.create_default_order_types_for_tenant() set search_path = public, pg_temp;
