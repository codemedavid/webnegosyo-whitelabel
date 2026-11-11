// The inventory slice of the live platform database (read from the catalog on
// 2026-11-03: columns, constraints, indexes, policies, triggers, grants), for
// RLS runners. Function bodies below are the LIVE bodies, verbatim
// (pg_get_functiondef), except where a comment says "stub".
//
//   installInventorySchema(db)   after installPlatformAuth(db)
//
// Left out on purpose (not what these runners test): store_activity_* AFTER
// triggers, set_updated_at, inventory_count_business_day (business_day gets a
// default instead), merchant_notifications_push (pg_net), and the
// stock_movement_frozen_cost body (stub: NULL = "not recorded").
const TABLES = `
  create table public.tenants (id uuid primary key);
  create table public.outlets (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null default 'Branch'
  );
  create table public.app_users (
    user_id uuid not null,
    tenant_id uuid,
    role text not null,
    is_owner boolean default false,
    outlet_id uuid,
    permissions text[],
    platform_permissions text[]
  );
  create table public.menu_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade
  );

  create table public.inventory_units (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null, abbreviation text not null,
    dimension text not null constraint inventory_units_dimension_ck check (dimension = any (array['weight','volume','count'])),
    to_base_factor numeric not null default 1 constraint inventory_units_factor_ck check (to_base_factor > 0),
    is_base boolean not null default false, is_active boolean not null default true,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create unique index idx_inventory_units_tenant_abbrev_uq on public.inventory_units (tenant_id, lower(abbreviation));

  create table public.inventory_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null, sku text, category text,
    stock_unit_id uuid not null references public.inventory_units(id) on delete restrict,
    unit_cost numeric not null default 0 constraint inventory_items_unit_cost_ck check (unit_cost >= 0),
    is_prep boolean not null default false, image_url text,
    current_qty numeric not null default 0, reorder_level numeric not null default 0,
    is_active boolean not null default true,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );

  create table public.inventory_stock (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
    outlet_id uuid references public.outlets(id) on delete cascade,
    current_qty numeric not null default 0, reorder_level numeric not null default 0,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create unique index idx_inventory_stock_item_outlet on public.inventory_stock (inventory_item_id, outlet_id) where outlet_id is not null;
  create unique index idx_inventory_stock_item_store_pool on public.inventory_stock (inventory_item_id) where outlet_id is null;

  create table public.recipes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    target_type text not null constraint recipes_target_type_ck check (target_type = any (array['menu_item','variation_option','addon','modifier_option','prep_item'])),
    menu_item_id uuid references public.menu_items(id) on delete cascade,
    variation_option_id text, addon_id text,
    prep_item_id uuid references public.inventory_items(id) on delete cascade,
    yield_quantity numeric, yield_unit_id uuid references public.inventory_units(id) on delete restrict,
    notes text, created_at timestamptz default now(), updated_at timestamptz default now(), modifier_option_id text
  );

  create table public.recipe_components (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    recipe_id uuid not null references public.recipes(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
    quantity numeric not null default 0 constraint recipe_components_quantity_ck check (quantity >= 0),
    unit_id uuid not null references public.inventory_units(id) on delete restrict,
    sort_order integer not null default 0,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );

  create table public.stock_alerts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
    level text not null constraint stock_alerts_level_ck check (level = any (array['low','out'])),
    quantity numeric not null, reorder_level numeric not null default 0,
    resolved_at timestamptz, created_at timestamptz default now(),
    outlet_id uuid references public.outlets(id) on delete cascade
  );

  create table public.merchant_notifications (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null, outlet_id uuid, kind text not null, stock_alert_id uuid, inventory_item_id uuid,
    item_name text not null, unit text, outlet_name text, quantity numeric, reorder_level numeric,
    push_claimed_at timestamptz, created_at timestamptz not null default now()
  );

  create table public.stock_transfers (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    from_outlet_id uuid references public.outlets(id) on delete restrict,
    to_outlet_id uuid references public.outlets(id) on delete restrict,
    status text not null default 'draft' constraint stock_transfers_status_ck check (status = any (array['draft','sent','received','cancelled'])),
    note text,
    created_by uuid references auth.users(id) on delete set null,
    sent_by uuid references auth.users(id) on delete set null, sent_at timestamptz,
    received_by uuid references auth.users(id) on delete set null, received_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint stock_transfers_distinct_branches_ck check (from_outlet_id is distinct from to_outlet_id)
  );

  create table public.stock_transfer_lines (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
    sent_quantity numeric not null constraint stock_transfer_lines_sent_positive_ck check (sent_quantity > 0),
    received_quantity numeric, unit_cost numeric, created_at timestamptz not null default now(),
    constraint stock_transfer_lines_received_range_ck check (received_quantity is null or (received_quantity >= 0 and received_quantity <= sent_quantity))
  );
  create unique index idx_stock_transfer_lines_unique_item on public.stock_transfer_lines (transfer_id, inventory_item_id);

  create table public.inventory_counts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    outlet_id uuid references public.outlets(id) on delete restrict,
    business_day date not null default current_date,
    status text not null default 'open' constraint inventory_counts_status_ck check (status = any (array['open','closed'])),
    expected_item_count integer not null default 0, note text,
    started_by uuid references auth.users(id) on delete set null, started_at timestamptz not null default now(),
    closed_by uuid references auth.users(id) on delete set null, closed_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint inventory_counts_closed_consistency_ck check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
  );

  create table public.stock_movements (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id),
    reason text not null constraint stock_movements_reason_ck check (reason = any (array['receive','stocktake','waste','sale','void','transfer_out','transfer_in'])),
    quantity_delta numeric not null, entered_quantity numeric,
    entered_unit_id uuid references public.inventory_units(id) on delete set null,
    balance_after numeric not null default 0, unit_cost numeric, note text, order_id text,
    created_by uuid references auth.users(id) on delete set null, created_at timestamptz default now(),
    outlet_id uuid references public.outlets(id) on delete set null,
    target_qty numeric,
    stock_transfer_id uuid references public.stock_transfers(id) on delete set null,
    inventory_count_id uuid references public.inventory_counts(id) on delete set null,
    client_request_id uuid
  );

  create table public.presell_stock (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    menu_item_id uuid not null references public.menu_items(id) on delete cascade,
    presell_date date not null,
    stock_qty integer not null check (stock_qty >= 0), sold_qty integer not null default 0 check (sold_qty >= 0),
    created_at timestamptz default now(), updated_at timestamptz default now(),
    constraint presell_stock_item_date_uq unique (tenant_id, menu_item_id, presell_date)
  );

  create table public.inventory_audit_log (
    id bigint generated always as identity primary key,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    created_at timestamptz not null default now(),
    event text not null check (event = any (array['order_sale','order_restore','order_edit','order_redeplete','manual_movement'])),
    outcome text not null check (outcome = any (array['applied','duplicate','cancelled_first','nothing_to_deduct','failed'])),
    source text not null check (source = any (array['web_checkout','customer_app','pos','qr_scan','merchant_app','web_admin','system'])),
    order_id text, revision integer, outlet_id uuid, actor_user_id uuid,
    movement_count integer not null default 0, lines jsonb not null default '[]'::jsonb,
    is_suspected_duplicate boolean not null default false, detail text
  );

  -- Live grants that differ from Supabase's defaults.
  revoke all on public.inventory_audit_log from anon, authenticated;
  grant select, insert on public.inventory_audit_log to authenticated;
  revoke all on public.merchant_notifications from anon, authenticated;
  grant select, truncate on public.merchant_notifications to anon, authenticated;
`

// ---------------------------------------------------------------------------
// Live function bodies, verbatim.
// ---------------------------------------------------------------------------
const FUNCTIONS = String.raw`
CREATE OR REPLACE FUNCTION public.app_user_has_permission(p_tenant_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses', 'cash_manage']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM app_users au
     WHERE au.user_id = auth.uid()
       AND au.tenant_id = target_tenant_id
       AND au.role = ANY (ARRAY['admin','superadmin'])
       AND (
         au.outlet_id IS NULL
         OR COALESCE(au.is_owner, false)
         OR au.outlet_id = target_outlet_id
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_user_platform_can(p_permissions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'platform_staff'
      and au.platform_permissions && p_permissions
  );
$function$;

CREATE OR REPLACE FUNCTION public.inventory_write_needs_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if public.app_user_has_permission(coalesce(new.tenant_id, old.tenant_id), 'inventory')
     or public.app_user_platform_can(array['stores.edit']) then
    return coalesce(new, old);
  end if;
  raise exception 'Counts and transfers need the Inventory permission' using errcode = '42501';
end;
$function$;

CREATE OR REPLACE FUNCTION public.stock_transfer_lines_client_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_from uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;
  select t.from_outlet_id into v_from
    from public.stock_transfers t
   where t.id = coalesce(new.transfer_id, old.transfer_id);
  if public.app_user_may_reach_branch(coalesce(new.tenant_id, old.tenant_id), v_from)
     or exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin') then
    return coalesce(new, old);
  end if;
  if tg_op <> 'UPDATE'
     or new.sent_quantity is distinct from old.sent_quantity
     or new.inventory_item_id is distinct from old.inventory_item_id
     or new.transfer_id is distinct from old.transfer_id
     or new.tenant_id is distinct from old.tenant_id
     or new.unit_cost is distinct from old.unit_cost then
    raise exception 'The receiving branch can only record what arrived.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stock_transfers_client_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.app_user_may_reach_branch(old.tenant_id, old.from_outlet_id)
     or exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin') then
    return new;
  end if;
  if new.tenant_id is distinct from old.tenant_id
     or new.from_outlet_id is distinct from old.from_outlet_id
     or new.to_outlet_id is distinct from old.to_outlet_id
     or new.note is distinct from old.note
     or new.created_by is distinct from old.created_by
     or new.sent_by is distinct from old.sent_by
     or new.sent_at is distinct from old.sent_at
     or new.created_at is distinct from old.created_at then
    raise exception 'The receiving branch can only record what arrived.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_items_client_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_platform_grant text := case tg_op when 'INSERT' then 'stores.create' when 'DELETE' then 'stores.delete' else 'stores.edit' end;
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if not public.app_user_platform_can(array[v_platform_grant]) then
    if tg_op in ('INSERT', 'DELETE') or (
      new.name, new.sku, new.category, new.stock_unit_id, new.is_prep, new.image_url, new.is_active
    ) is distinct from (
      old.name, old.sku, old.category, old.stock_unit_id, old.is_prep, old.image_url, old.is_active
    ) then
      if not public.app_user_has_permission(v_tenant, 'menu') then
        raise exception 'Managing ingredients needs the Menu permission' using errcode = '42501';
      end if;
    end if;

    if (tg_op = 'INSERT' and coalesce(new.unit_cost, 0) <> 0)
       or (tg_op = 'UPDATE' and new.unit_cost is distinct from old.unit_cost) then
      if not public.app_user_has_permission(v_tenant, 'costs') then
        raise exception 'Changing what an ingredient costs needs the Costs permission' using errcode = '42501';
      end if;
    end if;

    if tg_op = 'UPDATE' and new.reorder_level is distinct from old.reorder_level then
      if not public.app_user_has_permission(v_tenant, 'inventory') then
        raise exception 'Changing a reorder level needs the Inventory permission' using errcode = '42501';
      end if;
    end if;

    if tg_op = 'UPDATE' and not (
      public.app_user_has_permission(v_tenant, 'menu')
      or public.app_user_has_permission(v_tenant, 'inventory')
      or public.app_user_has_permission(v_tenant, 'costs')
    ) then
      raise exception 'Managing ingredients needs the Menu permission' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.current_qty, 0) <> 0 then
      raise exception 'A new ingredient starts at zero. Record its opening count as a stock count.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.current_qty is distinct from old.current_qty then
      raise exception 'Stock on hand changes only through a delivery, waste, count or transfer.'
        using errcode = '42501';
    end if;
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'An ingredient cannot move to another store' using errcode = '42501';
    end if;
    if new.stock_unit_id is distinct from old.stock_unit_id and old.current_qty <> 0 then
      raise exception 'Change the stock unit only while this ingredient is at zero. Count it to zero first.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_stock_client_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then raise exception 'A branch shelf cannot be deleted. Count it to zero instead.'
    using errcode = '42501';
  end if;
  if not (
    public.app_user_has_permission(v_tenant, 'inventory')
    or (tg_op = 'INSERT' and public.app_user_platform_can(array['stores.create']))
    or (tg_op = 'UPDATE' and public.app_user_platform_can(array['stores.edit']))
  ) then
    raise exception 'Managing stock needs the Inventory permission' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.current_qty, 0) <> 0 then
      raise exception 'A branch shelf starts at zero. Record stock as a delivery or count.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.current_qty is distinct from old.current_qty then
    raise exception 'Stock on hand changes only through a delivery, waste, count or transfer.'
      using errcode = '42501';
  end if;
  if new.tenant_id is distinct from old.tenant_id
     or new.inventory_item_id is distinct from old.inventory_item_id
     or new.outlet_id is distinct from old.outlet_id then
    raise exception 'A shelf cannot be moved to another ingredient or branch' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recipe_components_unit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_line_dimension text;
  v_stock_dimension text;
  v_item_name text;
begin
  if tg_op = 'UPDATE'
     and new.unit_id is not distinct from old.unit_id
     and new.inventory_item_id is not distinct from old.inventory_item_id then
    return new;
  end if;

  select u.dimension into v_line_dimension
  from public.inventory_units u
  where u.id = new.unit_id and u.tenant_id = new.tenant_id;

  select su.dimension, i.name into v_stock_dimension, v_item_name
  from public.inventory_items i
  join public.inventory_units su on su.id = i.stock_unit_id and su.tenant_id = i.tenant_id
  where i.id = new.inventory_item_id and i.tenant_id = new.tenant_id;

  if v_line_dimension is null or v_stock_dimension is null then
    return new;
  end if;

  if v_line_dimension = v_stock_dimension
     or (v_line_dimension in ('weight', 'volume') and v_stock_dimension in ('weight', 'volume')) then
    return new;
  end if;

  raise exception 'Recipe line for % uses a % unit, but it is stocked by %; pick a unit that converts',
    coalesce(v_item_name, 'this ingredient'), v_line_dimension, v_stock_dimension
    using errcode = '23514';
end;
$function$;

CREATE OR REPLACE FUNCTION public.stock_alerts_to_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into merchant_notifications
      (tenant_id, outlet_id, kind, stock_alert_id, inventory_item_id,
       item_name, unit, outlet_name, quantity, reorder_level)
    select n.tenant_id, n.outlet_id,
           case when n.level = 'out' then 'stock_out' else 'stock_low' end,
           n.id, n.inventory_item_id,
           coalesce(ii.name, 'An ingredient'), iu.abbreviation, o.name,
           n.quantity, n.reorder_level
      from new_rows n
      left join inventory_items ii on ii.id = n.inventory_item_id
      left join inventory_units iu on iu.id = ii.stock_unit_id
      left join outlets o on o.id = n.outlet_id
     where n.resolved_at is null;
  else
    insert into merchant_notifications
      (tenant_id, outlet_id, kind, stock_alert_id, inventory_item_id,
       item_name, unit, outlet_name, quantity, reorder_level)
    select n.tenant_id, n.outlet_id, 'stock_out',
           n.id, n.inventory_item_id,
           coalesce(ii.name, 'An ingredient'), iu.abbreviation, o.name,
           n.quantity, n.reorder_level
      from new_rows n
      join old_rows prev on prev.id = n.id
      left join inventory_items ii on ii.id = n.inventory_item_id
      left join inventory_units iu on iu.id = ii.stock_unit_id
      left join outlets o on o.id = n.outlet_id
     where prev.level = 'low'
       and n.level = 'out'
       and n.resolved_at is null;
  end if;
  return null;
exception when others then
  raise warning 'stock_alerts_to_notifications failed: %', sqlerrm;
  return null;
end;
$function$;

-- stub: the live body prices non-receive movements (not under test here).
CREATE OR REPLACE FUNCTION public.stock_movement_frozen_cost(p_tenant_id uuid, p_item_id uuid, p_reason text, p_outlet_id uuid, p_order_id text, p_transfer_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$ select null::numeric $function$;

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  branch_qty numeric(16,4);
  rollup_qty numeric(16,4);
  counted_against numeric(16,4);
  v_item_cost numeric;
  v_new_item_cost numeric;
begin
  if new.outlet_id is not null and not exists (
    select 1 from outlets o where o.id = new.outlet_id and o.tenant_id = new.tenant_id
  ) then
    raise exception 'Stock movement references a branch outside its tenant';
  end if;

  select current_qty, unit_cost into rollup_qty, v_item_cost
    from inventory_items
   where id = new.inventory_item_id
     and tenant_id = new.tenant_id
     for update;

  if rollup_qty is null then
    raise exception 'Stock movement references an inventory item outside its tenant';
  end if;

  if new.reason = 'stocktake' and new.target_qty is not null then
    select current_qty into counted_against
      from inventory_stock
     where tenant_id = new.tenant_id
       and inventory_item_id = new.inventory_item_id
       and outlet_id is not distinct from new.outlet_id
       for update;

    new.quantity_delta := new.target_qty - coalesce(counted_against, 0);
  end if;

  if new.reason = 'receive' then
    if new.unit_cost is not null and new.quantity_delta > 0 then
      v_new_item_cost := case
        when rollup_qty <= 0 or v_item_cost <= 0 then new.unit_cost
        else (rollup_qty * v_item_cost + new.quantity_delta * new.unit_cost) / (rollup_qty + new.quantity_delta)
      end;
    end if;
  else
    new.unit_cost := public.stock_movement_frozen_cost(
      new.tenant_id,
      new.inventory_item_id,
      new.reason,
      new.outlet_id,
      new.order_id,
      new.stock_transfer_id
    );
  end if;

  update inventory_items
     set current_qty = current_qty + new.quantity_delta,
         unit_cost = coalesce(v_new_item_cost, unit_cost)
   where id = new.inventory_item_id
     and tenant_id = new.tenant_id
  returning current_qty into rollup_qty;

  update inventory_stock
     set current_qty = current_qty + new.quantity_delta,
         updated_at = now()
   where tenant_id = new.tenant_id
     and inventory_item_id = new.inventory_item_id
     and outlet_id is not distinct from new.outlet_id
  returning current_qty into branch_qty;

  if branch_qty is null then
    begin
      insert into inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty)
      values (new.tenant_id, new.inventory_item_id, new.outlet_id, new.quantity_delta)
      returning current_qty into branch_qty;
    exception when unique_violation then
      update inventory_stock
         set current_qty = current_qty + new.quantity_delta,
             updated_at = now()
       where tenant_id = new.tenant_id
         and inventory_item_id = new.inventory_item_id
         and outlet_id is not distinct from new.outlet_id
      returning current_qty into branch_qty;
    end;
  end if;

  new.balance_after := branch_qty;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stock_movements_client_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_from uuid;
  v_to uuid;
  v_status text;
  v_sent numeric;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if not (
    public.app_user_has_permission(new.tenant_id, 'inventory')
    or public.app_user_platform_can(array['stores.edit'])
  ) then
    raise exception 'Recording stock needs the Inventory permission' using errcode = '42501';
  end if;
  if new.unit_cost is not null and not (
    public.app_user_has_permission(new.tenant_id, 'costs')
    or public.app_user_platform_can(array['stores.edit'])
  ) then
    new.unit_cost := null;
  end if;
  if new.reason not in ('receive', 'stocktake', 'waste', 'transfer_out', 'transfer_in') then
    raise exception 'Sales and voids are recorded by the system, not entered by hand.'
      using errcode = '42501';
  end if;
  if new.order_id is not null then
    raise exception 'Only the system links a stock movement to an order.' using errcode = '42501';
  end if;
  if (new.reason = 'receive' and new.quantity_delta < 0)
     or (new.reason = 'waste' and new.quantity_delta > 0)
     or (new.reason = 'transfer_out' and new.quantity_delta > 0)
     or (new.reason = 'transfer_in' and new.quantity_delta < 0) then
    raise exception 'The quantity''s sign does not match "%".', new.reason using errcode = '23514';
  end if;
  if new.reason in ('transfer_out', 'transfer_in') and new.stock_transfer_id is null then
    raise exception 'A transfer movement must belong to a transfer.' using errcode = '23514';
  end if;
  if new.reason in ('receive', 'stocktake') and new.stock_transfer_id is not null then
    raise exception 'Only transfer legs and transfer shortfalls belong to a transfer.' using errcode = '23514';
  end if;
  if new.stock_transfer_id is null then
    return new;
  end if;
  select t.from_outlet_id, t.to_outlet_id, t.status
    into v_from, v_to, v_status
    from public.stock_transfers t
   where t.id = new.stock_transfer_id
     and t.tenant_id = new.tenant_id;
  if not found then
    raise exception 'This transfer does not exist in this store.' using errcode = '42501';
  end if;
  select sum(l.sent_quantity) into v_sent
    from public.stock_transfer_lines l
   where l.transfer_id = new.stock_transfer_id
     and l.inventory_item_id = new.inventory_item_id;
  if v_sent is null then
    raise exception 'This ingredient is not on that transfer.' using errcode = '42501';
  end if;
  if abs(new.quantity_delta) > v_sent then
    raise exception 'A transfer cannot move more than was sent.' using errcode = '23514';
  end if;
  if new.reason = 'transfer_out' then
    if new.outlet_id is distinct from v_from or v_status <> 'draft' then
      raise exception 'Stock leaves only the sending branch, once, when the transfer is sent.' using errcode = '42501';
    end if;
  elsif new.reason = 'transfer_in' then
    if (new.outlet_id is distinct from v_to and new.outlet_id is distinct from v_from) or v_status <> 'sent' then
      raise exception 'Stock arrives only when a sent transfer is received.' using errcode = '42501';
    end if;
  else
    if new.outlet_id is distinct from v_from or v_status <> 'sent' then
      raise exception 'A transfer shortfall is written off on the sending branch when it is received.' using errcode = '42501';
    end if;
  end if;
  if exists (
    select 1
      from public.stock_movements m
     where m.stock_transfer_id = new.stock_transfer_id
       and m.inventory_item_id = new.inventory_item_id
       and m.reason = new.reason
       and m.outlet_id is not distinct from new.outlet_id
  ) then
    raise exception 'This transfer has already moved that stock.' using errcode = '23505';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_client_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('anon', 'authenticated') then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid(), 'created_at', now()));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.store_activity_stamp_client_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_col text;
  v_new jsonb;
  v_old jsonb;
  v_patch jsonb := '{}'::jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  foreach v_col in array tg_argv loop
    if (v_new ->> v_col) is not null and (v_new -> v_col) is distinct from (v_old -> v_col) then
      v_patch := v_patch || jsonb_build_object(v_col, auth.uid());
    end if;
  end loop;
  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stock_movement_count_session_is_valid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.inventory_count_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reason <> 'stocktake' THEN
    RAISE EXCEPTION 'Only a stocktake may belong to a count session (got %)', NEW.reason;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_counts c
     WHERE c.id = NEW.inventory_count_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Count session belongs to a different store';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_count_branch_belongs_to_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Count branch belongs to a different store';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_transfer_branches_belong_to_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.from_outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.from_outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Transfer source branch belongs to a different store';
  END IF;

  IF NEW.to_outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.to_outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Transfer destination branch belongs to a different store';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_inventory_item(p_tenant_id uuid, p_item_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_recipe_count integer;
  v_lines_removed integer := 0;
  v_has_history boolean;
  v_outcome text;
  v_affected integer;
begin
  if not (
    public.app_user_has_permission(p_tenant_id, 'menu')
    and public.app_user_may_reach_branch(p_tenant_id, null)
  ) and not exists (
    select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'
  ) then
    raise exception 'not allowed to manage this store''s inventory' using errcode = '42501';
  end if;
  perform 1 from public.inventory_items
  where id = p_item_id and tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception 'inventory item not found' using errcode = 'P0002';
  end if;
  select count(distinct rc.recipe_id) into v_recipe_count
  from public.recipe_components rc
  where rc.inventory_item_id = p_item_id;
  v_has_history :=
    exists (select 1 from public.stock_movements sm where sm.inventory_item_id = p_item_id)
    or exists (select 1 from public.stock_transfer_lines tl where tl.inventory_item_id = p_item_id);
  v_outcome := case when v_has_history then 'archived' else 'deleted' end;
  if p_dry_run then
    return jsonb_build_object(
      'outcome', v_outcome,
      'recipe_count', v_recipe_count,
      'recipe_lines_removed', 0
    );
  end if;
  delete from public.recipe_components rc where rc.inventory_item_id = p_item_id;
  get diagnostics v_lines_removed = row_count;
  if v_has_history then
    update public.inventory_items
    set is_active = false
    where id = p_item_id and tenant_id = p_tenant_id;
  else
    delete from public.inventory_items
    where id = p_item_id and tenant_id = p_tenant_id;
  end if;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'inventory item could not be removed' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'outcome', v_outcome,
    'recipe_count', v_recipe_count,
    'recipe_lines_removed', v_lines_removed
  );
end;
$function$;
`

// ---------------------------------------------------------------------------
// Live triggers on these tables (pg_get_triggerdef), minus the ones left out.
// ---------------------------------------------------------------------------
const TRIGGERS = `
  CREATE TRIGGER inventory_counts_00_needs_grant BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION inventory_write_needs_grant();
  CREATE TRIGGER store_activity_stamp_actor BEFORE INSERT OR UPDATE OF started_by, closed_by ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION store_activity_stamp_client_actor('started_by', 'closed_by');
  CREATE TRIGGER trg_inventory_count_branch BEFORE INSERT OR UPDATE OF tenant_id, outlet_id ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION inventory_count_branch_belongs_to_tenant();
  CREATE TRIGGER inventory_items_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION inventory_items_client_guard();
  CREATE TRIGGER inventory_stock_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.inventory_stock FOR EACH ROW EXECUTE FUNCTION inventory_stock_client_guard();
  CREATE TRIGGER recipe_components_unit_guard BEFORE INSERT OR UPDATE ON public.recipe_components FOR EACH ROW EXECUTE FUNCTION recipe_components_unit_guard();
  CREATE TRIGGER stock_alerts_notify_escalation AFTER UPDATE ON public.stock_alerts REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION stock_alerts_to_notifications();
  CREATE TRIGGER stock_alerts_notify_insert AFTER INSERT ON public.stock_alerts REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION stock_alerts_to_notifications();
  CREATE TRIGGER stock_movements_00_client_guard BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION stock_movements_client_guard();
  CREATE TRIGGER stock_movements_apply BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();
  CREATE TRIGGER stock_movements_stamp_actor BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION stamp_client_actor('created_by');
  CREATE TRIGGER trg_stock_movement_count_session BEFORE INSERT OR UPDATE OF inventory_count_id, reason, tenant_id ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION stock_movement_count_session_is_valid();
  CREATE TRIGGER stock_transfer_lines_00_needs_grant BEFORE INSERT OR DELETE OR UPDATE ON public.stock_transfer_lines FOR EACH ROW EXECUTE FUNCTION inventory_write_needs_grant();
  CREATE TRIGGER stock_transfer_lines_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.stock_transfer_lines FOR EACH ROW EXECUTE FUNCTION stock_transfer_lines_client_guard();
  CREATE TRIGGER stock_transfers_00_needs_grant BEFORE INSERT OR DELETE OR UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION inventory_write_needs_grant();
  CREATE TRIGGER stock_transfers_client_guard BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION stock_transfers_client_guard();
  CREATE TRIGGER store_activity_stamp_actor BEFORE INSERT OR UPDATE OF created_by, sent_by, received_by ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION store_activity_stamp_client_actor('created_by', 'sent_by', 'received_by');
  CREATE TRIGGER trg_stock_transfer_branches BEFORE INSERT OR UPDATE OF tenant_id, from_outlet_id, to_outlet_id ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION stock_transfer_branches_belong_to_tenant();
`

// ---------------------------------------------------------------------------
// Live policies (pg_policies) on these tables.
// ---------------------------------------------------------------------------
const SUPERADMIN = `(EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = 'superadmin'::text))))`
const ADMIN_OF_TENANT = `(tenant_id IN ( SELECT au.tenant_id FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))`
const MENU_STORE_WIDE = `(app_user_has_permission(tenant_id, 'menu'::text) AND app_user_may_reach_branch(tenant_id, NULL::uuid))`

const PLATFORM_STAFF_TABLES = [
  'inventory_counts', 'inventory_items', 'inventory_stock', 'inventory_units', 'presell_stock', 'recipe_components',
  'recipes', 'stock_alerts', 'stock_transfer_lines', 'stock_transfers',
]

function platformStaffPolicies(table) {
  return `
    CREATE POLICY platform_staff_select ON public.${table} FOR SELECT TO authenticated USING (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text])));
    CREATE POLICY platform_staff_insert ON public.${table} FOR INSERT TO authenticated WITH CHECK (( SELECT app_user_platform_can(ARRAY['stores.create'::text])));
    CREATE POLICY platform_staff_update ON public.${table} FOR UPDATE TO authenticated USING (( SELECT app_user_platform_can(ARRAY['stores.edit'::text]))) WITH CHECK (( SELECT app_user_platform_can(ARRAY['stores.edit'::text])));
    CREATE POLICY platform_staff_delete ON public.${table} FOR DELETE TO authenticated USING (( SELECT app_user_platform_can(ARRAY['stores.delete'::text])));
  `
}

const POLICIES = `
  alter table public.inventory_units enable row level security;
  alter table public.inventory_items enable row level security;
  alter table public.inventory_stock enable row level security;
  alter table public.recipes enable row level security;
  alter table public.recipe_components enable row level security;
  alter table public.stock_alerts enable row level security;
  alter table public.merchant_notifications enable row level security;
  alter table public.stock_transfers enable row level security;
  alter table public.stock_transfer_lines enable row level security;
  alter table public.inventory_counts enable row level security;
  alter table public.stock_movements enable row level security;
  alter table public.presell_stock enable row level security;
  alter table public.inventory_audit_log enable row level security;

  CREATE POLICY inventory_audit_log_insert_branch ON public.inventory_audit_log FOR INSERT TO authenticated WITH CHECK ((app_user_may_reach_branch(tenant_id, outlet_id) AND (actor_user_id = auth.uid()) AND (event = 'manual_movement'::text) AND (order_id IS NULL)));
  CREATE POLICY inventory_audit_log_select_branch ON public.inventory_audit_log FOR SELECT TO authenticated USING (app_user_may_reach_branch(tenant_id, outlet_id));
  CREATE POLICY inventory_audit_log_select_superadmin ON public.inventory_audit_log FOR SELECT TO authenticated USING (${SUPERADMIN});

  CREATE POLICY inventory_counts_manage_branch ON public.inventory_counts FOR ALL USING (app_user_may_reach_branch(tenant_id, outlet_id)) WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));
  CREATE POLICY inventory_counts_manage_superadmin ON public.inventory_counts FOR ALL USING (${SUPERADMIN});

  CREATE POLICY "Admins manage own-tenant rows" ON public.inventory_items FOR ALL USING (${ADMIN_OF_TENANT}) WITH CHECK (${ADMIN_OF_TENANT});
  CREATE POLICY "Superadmins manage all rows" ON public.inventory_items FOR ALL USING (${SUPERADMIN});

  CREATE POLICY inventory_stock_manage_branch ON public.inventory_stock FOR ALL USING (app_user_may_reach_branch(tenant_id, outlet_id)) WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));
  CREATE POLICY inventory_stock_manage_superadmin ON public.inventory_stock FOR ALL USING (${SUPERADMIN}) WITH CHECK (${SUPERADMIN});

  CREATE POLICY "Superadmins manage all rows" ON public.inventory_units FOR ALL USING (${SUPERADMIN});
  CREATE POLICY inventory_units_delete_menu ON public.inventory_units FOR DELETE TO authenticated USING (${MENU_STORE_WIDE});
  CREATE POLICY inventory_units_insert_menu ON public.inventory_units FOR INSERT TO authenticated WITH CHECK (${MENU_STORE_WIDE});
  CREATE POLICY inventory_units_select_member ON public.inventory_units FOR SELECT TO authenticated USING (${ADMIN_OF_TENANT});
  CREATE POLICY inventory_units_update_menu ON public.inventory_units FOR UPDATE TO authenticated USING (${MENU_STORE_WIDE}) WITH CHECK (${MENU_STORE_WIDE});

  CREATE POLICY "Admins manage own-tenant rows" ON public.presell_stock FOR ALL USING (${ADMIN_OF_TENANT}) WITH CHECK (${ADMIN_OF_TENANT});
  CREATE POLICY "Superadmins manage all rows" ON public.presell_stock FOR ALL USING (${SUPERADMIN});

  CREATE POLICY "Superadmins manage all rows" ON public.recipe_components FOR ALL USING (${SUPERADMIN});
  CREATE POLICY recipe_components_delete_menu ON public.recipe_components FOR DELETE TO authenticated USING (${MENU_STORE_WIDE});
  CREATE POLICY recipe_components_insert_menu ON public.recipe_components FOR INSERT TO authenticated WITH CHECK (${MENU_STORE_WIDE});
  CREATE POLICY recipe_components_select_member ON public.recipe_components FOR SELECT TO authenticated USING (${ADMIN_OF_TENANT});
  CREATE POLICY recipe_components_update_menu ON public.recipe_components FOR UPDATE TO authenticated USING (${MENU_STORE_WIDE}) WITH CHECK (${MENU_STORE_WIDE});

  CREATE POLICY "Superadmins manage all rows" ON public.recipes FOR ALL USING (${SUPERADMIN});
  CREATE POLICY recipes_delete_menu ON public.recipes FOR DELETE TO authenticated USING (${MENU_STORE_WIDE});
  CREATE POLICY recipes_insert_menu ON public.recipes FOR INSERT TO authenticated WITH CHECK (${MENU_STORE_WIDE});
  CREATE POLICY recipes_select_member ON public.recipes FOR SELECT TO authenticated USING (${ADMIN_OF_TENANT});
  CREATE POLICY recipes_update_menu ON public.recipes FOR UPDATE TO authenticated USING (${MENU_STORE_WIDE}) WITH CHECK (${MENU_STORE_WIDE});

  CREATE POLICY "Superadmins manage all rows" ON public.stock_alerts FOR ALL USING (${SUPERADMIN});
  CREATE POLICY stock_alerts_manage_branch ON public.stock_alerts FOR ALL TO authenticated
    USING (((EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.tenant_id = stock_alerts.tenant_id) AND (au.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))) AND ((outlet_id IS NULL) OR app_user_may_reach_branch(tenant_id, outlet_id))))
    WITH CHECK (((EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND (au.tenant_id = stock_alerts.tenant_id) AND (au.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))) AND ((outlet_id IS NULL) OR app_user_may_reach_branch(tenant_id, outlet_id))));

  CREATE POLICY platform_staff_insert ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (( SELECT app_user_platform_can(ARRAY['stores.create'::text])));
  CREATE POLICY platform_staff_select ON public.stock_movements FOR SELECT TO authenticated USING (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text])));
  CREATE POLICY stock_movements_insert_branch ON public.stock_movements FOR INSERT TO authenticated WITH CHECK ((app_user_may_reach_branch(tenant_id, outlet_id) AND app_user_has_permission(tenant_id, 'inventory'::text)));
  CREATE POLICY stock_movements_insert_superadmin ON public.stock_movements FOR INSERT WITH CHECK (${SUPERADMIN});
  CREATE POLICY stock_movements_select_branch ON public.stock_movements FOR SELECT USING (app_user_may_reach_branch(tenant_id, outlet_id));
  CREATE POLICY stock_movements_select_superadmin ON public.stock_movements FOR SELECT USING (${SUPERADMIN});

  CREATE POLICY stock_transfer_lines_manage_branch ON public.stock_transfer_lines FOR ALL
    USING ((EXISTS ( SELECT 1 FROM stock_transfers t WHERE ((t.id = stock_transfer_lines.transfer_id) AND (t.tenant_id = stock_transfer_lines.tenant_id) AND (app_user_may_reach_branch(t.tenant_id, t.from_outlet_id) OR app_user_may_reach_branch(t.tenant_id, t.to_outlet_id))))))
    WITH CHECK ((EXISTS ( SELECT 1 FROM stock_transfers t WHERE ((t.id = stock_transfer_lines.transfer_id) AND (t.tenant_id = stock_transfer_lines.tenant_id) AND (app_user_may_reach_branch(t.tenant_id, t.from_outlet_id) OR app_user_may_reach_branch(t.tenant_id, t.to_outlet_id))))));
  CREATE POLICY stock_transfer_lines_manage_superadmin ON public.stock_transfer_lines FOR ALL USING (${SUPERADMIN});

  CREATE POLICY stock_transfers_manage_branch ON public.stock_transfers FOR ALL
    USING ((app_user_may_reach_branch(tenant_id, from_outlet_id) OR app_user_may_reach_branch(tenant_id, to_outlet_id)))
    WITH CHECK ((app_user_may_reach_branch(tenant_id, from_outlet_id) OR app_user_may_reach_branch(tenant_id, to_outlet_id)));
  CREATE POLICY stock_transfers_manage_superadmin ON public.stock_transfers FOR ALL USING (${SUPERADMIN});

  ${PLATFORM_STAFF_TABLES.map(platformStaffPolicies).join('\n')}
`

async function installInventorySchema(db) {
  await db.exec(TABLES)
  await db.exec(FUNCTIONS)
  await db.exec(TRIGGERS)
  await db.exec(POLICIES)
}

module.exports = { installInventorySchema }
