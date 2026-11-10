-- Cost secrecy, stage 1 of 2 (ADDITIVE; safe to apply before anything else).
--
-- `inventory_items.unit_cost`, `stock_movements.unit_cost` and
-- `stock_transfer_lines.unit_cost` are readable by every staff account of a
-- branch through plain PostgREST selects, although the `costs` key is meant to
-- guard them. Stage 2 (20261107130100) revokes the column. This stage gives
-- every legitimate cost reader a path that survives the revoke:
--
--   * public.inventory_costs_for_tenant(p_tenant_id, p_item_ids, p_after)
--       ingredient costs, `costs` key (42501 otherwise), paged by id, <= 1000.
--   * public.inventory_movement_costs(p_tenant_id, p_movement_ids)
--       ledger costs for <= 1000 given movement ids, `costs` key, and only
--       movements on a branch the caller reaches.
--   * inventory_private.* : the same reads as helpers for INVOKER SQL
--       (SECURITY DEFINER, non-exposed schema, so unreachable from PostgREST).
--   * public.apply_stock_movement(): no longer reads or re-reads unit_cost as the
--       caller. It runs as the invoker (client roles included); after the
--       revoke a `select unit_cost` / `set unit_cost = coalesce(x, unit_cost)`
--       there would fail every client movement with 42501.
--   * reporting.profit_facts() moves in the NEXT file (20261107130050), because
--       it needs the report schema; apply it straight after this one.
--
-- Everything else that reads these columns as a client role is a table read in
-- src/ or webnegosyo-app/ (moved to explicit column lists + the readers above)
-- or runs as a definer (frozen-cost helpers, store-activity triggers, the order
-- pipeline), which keeps working. Trigger functions compare NEW/OLD values,
-- which needs no column privilege.

create schema if not exists inventory_private;
revoke all on schema inventory_private from public;
grant usage on schema inventory_private to anon, authenticated, service_role;

-- The ingredient's current cost. Definer: the caller's role cannot select it.
create or replace function inventory_private.item_unit_cost(p_tenant_id uuid, p_item_id uuid)
returns numeric
language sql
volatile
security definer
set search_path = ''
as $$
  select i.unit_cost from public.inventory_items i where i.id = p_item_id and i.tenant_id = p_tenant_id
$$;

-- Ledger costs for the given movements. Callers: reporting.profit_facts (after
-- assert_profit_access) and public.inventory_movement_costs (after its own gate).
-- A direct call is allowed to the service role, or to a user holding `costs`
-- who reaches the movement's branch.
create or replace function inventory_private.movement_unit_costs(p_tenant_id uuid, p_movement_ids uuid[])
returns table (movement_id uuid, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true), '') <> 'service_role'
     and not public.app_user_has_permission(p_tenant_id, 'costs') then
    raise exception 'Seeing what stock cost needs the Costs permission.' using errcode = '42501';
  end if;
  return query
    select m.id, m.unit_cost
      from public.stock_movements m
     where m.id = any (p_movement_ids)
       and m.tenant_id = p_tenant_id
       and m.unit_cost is not null
       -- The same reach as the stock_movements SELECT policies: the caller's branch
       -- scope, or a superadmin (stock_movements_select_superadmin).
       and (coalesce(current_setting('role', true), '') = 'service_role'
            or public.app_user_may_reach_branch(m.tenant_id, m.outlet_id)
            or exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));
end;
$$;

revoke all on function inventory_private.item_unit_cost(uuid, uuid) from public;
revoke all on function inventory_private.movement_unit_costs(uuid, uuid[]) from public;
grant execute on function inventory_private.item_unit_cost(uuid, uuid) to anon, authenticated, service_role;
grant execute on function inventory_private.movement_unit_costs(uuid, uuid[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The public readers (what the web and the merchant app call).
-- ---------------------------------------------------------------------------
create or replace function public.inventory_costs_for_tenant(
  p_tenant_id uuid,
  p_item_ids uuid[] default null,
  p_after uuid default null
)
returns table (inventory_item_id uuid, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true), '') <> 'service_role'
     and not public.app_user_has_permission(p_tenant_id, 'costs') then
    raise exception 'Seeing what ingredients cost needs the Costs permission.' using errcode = '42501';
  end if;
  return query
    select i.id, i.unit_cost
      from public.inventory_items i
     where i.tenant_id = p_tenant_id
       and (p_item_ids is null or i.id = any (p_item_ids))
       and (p_after is null or i.id > p_after)
     order by i.id
     limit 1000;
end;
$$;

create or replace function public.inventory_movement_costs(p_tenant_id uuid, p_movement_ids uuid[])
returns table (movement_id uuid, unit_cost numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_movement_ids is not null and cardinality(p_movement_ids) > 1000 then
    raise exception 'At most 1000 movements per call.' using errcode = '22023';
  end if;
  return query select * from inventory_private.movement_unit_costs(p_tenant_id, coalesce(p_movement_ids, '{}'));
end;
$$;

revoke all on function public.inventory_costs_for_tenant(uuid, uuid[], uuid) from public, anon;
revoke all on function public.inventory_movement_costs(uuid, uuid[]) from public, anon;
grant execute on function public.inventory_costs_for_tenant(uuid, uuid[], uuid) to authenticated, service_role;
grant execute on function public.inventory_movement_costs(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_stock_movement: the live body (probed 2026-11-07) with ONLY the two
-- reads of the ingredient's cost changed. It still runs as the invoker.
--   1. the cost comes from the definer helper after the row lock is taken;
--   2. the update writes `coalesce(new average, cost read under that lock)`
--      instead of re-reading the column on the right-hand side.
-- ---------------------------------------------------------------------------
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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

  select current_qty into rollup_qty
    from inventory_items
   where id = new.inventory_item_id
     and tenant_id = new.tenant_id
     for update;

  if rollup_qty is null then
    raise exception 'Stock movement references an inventory item outside its tenant';
  end if;

  -- After the lock, so a concurrent receive's new average is what is read.
  v_item_cost := inventory_private.item_unit_cost(new.tenant_id, new.inventory_item_id);

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
         unit_cost = coalesce(v_new_item_cost, v_item_cost)
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
