-- Security advisor 0029: `initialize_order_types_for_tenant` is SECURITY
-- DEFINER and executable by every signed-in user, with only a tenant id as
-- input. Any authenticated account could seed order types + customer form
-- fields into ANY tenant that had none yet. The web caller
-- (`order-types-service.ts:initializeOrderTypesForTenant`) already checks
-- `verifyTenantPermission(tenantId, 'store_setup')`, but the RPC itself did
-- not — so the check is repeated inside the function, where it cannot be
-- bypassed by calling `/rest/v1/rpc/...` directly.
--
-- Service-role / migration callers have no `auth.uid()` and stay allowed, so
-- provisioning (superadmin actions, MCP, seed scripts) is unchanged.
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
$function$;
