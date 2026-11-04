-- ===========================================================================
-- Inventory permission hardening, part 3: rows stay inside their own store.
-- (inventory DB security audit 2026-11-03, finding M5)
--
-- The unique shelf indexes idx_inventory_stock_item_outlet
-- (inventory_item_id, outlet_id) and idx_inventory_stock_item_store_pool
-- (inventory_item_id) carry no tenant_id, and nothing checked that a shelf's
-- ingredient belongs to the shelf's store. Store B could insert a shelf naming
-- store A's ingredient; A's next movement then missed its own shelf (the
-- UPDATE filters on tenant_id), hit B's row on INSERT, retried the UPDATE,
-- still matched nothing and wrote balance_after NULL. The same kind of
-- foreign reference was possible on recipes, recipe lines, alerts, transfer
-- lines and pre-sell rows.
--
-- Fix: one BEFORE INSERT/UPDATE trigger per table refuses a row whose
-- ingredient / branch / unit / menu item / recipe / transfer belongs to another
-- store, for EVERY role (live had 0 such rows on 2026-11-03, so nothing
-- existing is refused; unchanged references are not re-checked on UPDATE).
-- Once a shelf's inventory_item_id can only name its own store's ingredient,
-- inventory_item_id determines tenant_id and the existing indexes are already
-- per-store, so they are left as they are and apply_stock_movement's
-- insert / unique_violation retry is unchanged (it is not redefined here).
--
-- Also:
--   stock_alerts_to_notifications  joins its ingredient / unit / branch only
--     within the alert's own store (live body, only the join predicates added).
--   recipe_components_unit_guard   raised nothing when the line's unit or
--     ingredient was not in the store (returned NEW); now refuses (live body,
--     only that branch changed).
-- app_user_may_reach_branch is NOT changed (it is on nearly every inventory
-- policy; a lookup there costs every row). The gap it leaves — a store-wide
-- account naming another store's branch — is closed per table here, by the
-- existing transfer/count/movement branch triggers, and for the audit log by
-- 20261103130000.
-- Runner: tests/sql/run-inventory-permission-hardening.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- One generic guard. Arguments are '<column>:<kind>' pairs; a NULL reference
-- passes (the column's own NOT NULL / FK decide that). Definer: it must see
-- the referenced row whatever the caller may read.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_same_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_tenant uuid := (v_new ->> 'tenant_id')::uuid;
  v_spec text;
  v_col text;
  v_kind text;
  v_id uuid;
  v_ok boolean;
begin
  foreach v_spec in array tg_argv loop
    v_col := split_part(v_spec, ':', 1);
    v_kind := split_part(v_spec, ':', 2);
    v_id := (v_new ->> v_col)::uuid;
    continue when v_id is null;
    continue when v_old is not null
      and (v_old ->> 'tenant_id') is not distinct from (v_new ->> 'tenant_id')
      and (v_old ->> v_col) is not distinct from (v_new ->> v_col);

    v_ok := case v_kind
      when 'item' then exists (select 1 from public.inventory_items x where x.id = v_id and x.tenant_id = v_tenant)
      when 'outlet' then exists (select 1 from public.outlets x where x.id = v_id and x.tenant_id = v_tenant)
      when 'unit' then exists (select 1 from public.inventory_units x where x.id = v_id and x.tenant_id = v_tenant)
      when 'menu_item' then exists (select 1 from public.menu_items x where x.id = v_id and x.tenant_id = v_tenant)
      when 'recipe' then exists (select 1 from public.recipes x where x.id = v_id and x.tenant_id = v_tenant)
      when 'transfer' then exists (select 1 from public.stock_transfers x where x.id = v_id and x.tenant_id = v_tenant)
    end;

    if v_ok is null then
      raise exception 'inventory_same_tenant_guard: unknown kind % on %.%', v_kind, tg_table_name, v_col;
    end if;
    if not v_ok then
      raise exception '%.% points at another store''s %', tg_table_name, v_col,
        case v_kind when 'item' then 'ingredient' when 'outlet' then 'branch' else replace(v_kind, '_', ' ') end
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.inventory_same_tenant_guard() from public, anon, authenticated;

drop trigger if exists inventory_stock_01_same_tenant on public.inventory_stock;
create trigger inventory_stock_01_same_tenant
  before insert or update of tenant_id, inventory_item_id, outlet_id on public.inventory_stock
  for each row execute function public.inventory_same_tenant_guard('inventory_item_id:item', 'outlet_id:outlet');

drop trigger if exists inventory_items_01_same_tenant on public.inventory_items;
create trigger inventory_items_01_same_tenant
  before insert or update of tenant_id, stock_unit_id on public.inventory_items
  for each row execute function public.inventory_same_tenant_guard('stock_unit_id:unit');

drop trigger if exists recipes_01_same_tenant on public.recipes;
create trigger recipes_01_same_tenant
  before insert or update of tenant_id, menu_item_id, prep_item_id, yield_unit_id on public.recipes
  for each row execute function public.inventory_same_tenant_guard('menu_item_id:menu_item', 'prep_item_id:item', 'yield_unit_id:unit');

drop trigger if exists recipe_components_01_same_tenant on public.recipe_components;
create trigger recipe_components_01_same_tenant
  before insert or update of tenant_id, recipe_id, inventory_item_id, unit_id on public.recipe_components
  for each row execute function public.inventory_same_tenant_guard('recipe_id:recipe', 'inventory_item_id:item', 'unit_id:unit');

drop trigger if exists stock_alerts_01_same_tenant on public.stock_alerts;
create trigger stock_alerts_01_same_tenant
  before insert or update of tenant_id, inventory_item_id, outlet_id on public.stock_alerts
  for each row execute function public.inventory_same_tenant_guard('inventory_item_id:item', 'outlet_id:outlet');

drop trigger if exists stock_transfer_lines_01_same_tenant on public.stock_transfer_lines;
create trigger stock_transfer_lines_01_same_tenant
  before insert or update of tenant_id, transfer_id, inventory_item_id on public.stock_transfer_lines
  for each row execute function public.inventory_same_tenant_guard('transfer_id:transfer', 'inventory_item_id:item');

drop trigger if exists presell_stock_01_same_tenant on public.presell_stock;
create trigger presell_stock_01_same_tenant
  before insert or update of tenant_id, menu_item_id on public.presell_stock
  for each row execute function public.inventory_same_tenant_guard('menu_item_id:menu_item');

-- ---------------------------------------------------------------------------
-- stock_alerts_to_notifications: live body; joins now stay in the alert's store.
-- ---------------------------------------------------------------------------
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
      left join inventory_items ii on ii.id = n.inventory_item_id and ii.tenant_id = n.tenant_id
      left join inventory_units iu on iu.id = ii.stock_unit_id and iu.tenant_id = n.tenant_id
      left join outlets o on o.id = n.outlet_id and o.tenant_id = n.tenant_id
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
      left join inventory_items ii on ii.id = n.inventory_item_id and ii.tenant_id = n.tenant_id
      left join inventory_units iu on iu.id = ii.stock_unit_id and iu.tenant_id = n.tenant_id
      left join outlets o on o.id = n.outlet_id and o.tenant_id = n.tenant_id
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

-- ---------------------------------------------------------------------------
-- recipe_components_unit_guard: live body; a unit or ingredient outside the
-- line's store now refuses instead of passing silently.
-- ---------------------------------------------------------------------------
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
    raise exception 'This recipe line names an ingredient or unit from another store'
      using errcode = '42501';
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
