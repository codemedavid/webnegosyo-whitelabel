-- Reports & Inventory suite, Phase 0b part 2: hardening after review.
--
-- 1. Cycle guard. The costing helpers stopped only at a depth cap, so a prep
--    that (indirectly) contains itself, with k ingredients leading back to it,
--    fanned out ~k^8 calls. That ran inside a checkout (order_item_costs) and
--    inside every sale/void of the ingredient, long enough to reach the
--    statement timeout, which no exception handler catches. The order would be
--    lost and the shared database held meanwhile. Now the path is carried, and
--    a revisit is unknown at once, as costing.ts throws.
-- 2. No catch-all on the sale path. `exception when others` opens a
--    subtransaction per row; one sale writes many movement rows in a single
--    statement, and more than 64 subtransactions in one transaction slow
--    snapshot checks for every reader of the shared database. Every failure in
--    stock_movement_frozen_cost and the category snapshot is guarded instead
--    (division, unit conversion, overflow). The checkout cost snapshot keeps
--    its catch: one per order line, and losing an order is worse.
-- 3. An ingredient never priced freezes as NULL ("not recorded"), not 0
--    ("free"). A frozen 0 could never be repriced, and food cost would read low.
-- 4. Costs keep six decimal places. numeric(12,4) rounded a per-gram price of
--    0.00035 to 0.0004 (+14%), and the average was re-rounded on every delivery.

-- ---------------------------------------------------------------------------
-- 1. Costing helpers carry their path.
-- ---------------------------------------------------------------------------
drop function if exists public.inventory_recipe_cost(uuid, uuid, integer);
drop function if exists public.inventory_effective_unit_cost(uuid, uuid, integer);

create or replace function public.inventory_recipe_cost(
  p_tenant_id uuid,
  p_recipe_id uuid,
  p_path uuid[] default '{}'
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_line record;
  v_quantity numeric;
  v_line_cost numeric;
  v_total numeric := 0;
begin
  if not exists (
    select 1 from public.recipes r where r.id = p_recipe_id and r.tenant_id = p_tenant_id
  ) then
    return null;
  end if;

  for v_line in
    select c.quantity, c.unit_id, c.inventory_item_id, i.stock_unit_id
      from public.recipe_components c
      left join public.inventory_items i
        on i.id = c.inventory_item_id and i.tenant_id = p_tenant_id
     where c.recipe_id = p_recipe_id
       and c.tenant_id = p_tenant_id
  loop
    if v_line.stock_unit_id is null then return null; end if;
    v_quantity := public.inventory_convert_quantity(v_line.quantity, v_line.unit_id, v_line.stock_unit_id);
    v_line_cost := v_quantity
      * public.inventory_effective_unit_cost(p_tenant_id, v_line.inventory_item_id, p_path);
    if v_line_cost is null then return null; end if;
    v_total := v_total + v_line_cost;
  end loop;

  return v_total;
end;
$$;

create or replace function public.inventory_effective_unit_cost(
  p_tenant_id uuid,
  p_item_id uuid,
  p_path uuid[] default '{}'
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_is_prep boolean;
  v_unit_cost numeric;
  v_stock_unit_id uuid;
  v_recipe_id uuid;
  v_yield_quantity numeric;
  v_yield_unit_id uuid;
  v_yield_in_stock numeric;
  v_recipe_cost numeric;
begin
  -- costing.ts throws on a cycle: a prep met again on its own path is
  -- unknown. 32 nested preps is far past any real kitchen.
  if p_item_id = any(p_path) or cardinality(p_path) >= 32 then return null; end if;

  select i.is_prep, i.unit_cost, i.stock_unit_id into v_is_prep, v_unit_cost, v_stock_unit_id
    from public.inventory_items i
   where i.id = p_item_id and i.tenant_id = p_tenant_id;
  if not found then return null; end if;

  if v_is_prep then
    select r.id, r.yield_quantity, r.yield_unit_id into v_recipe_id, v_yield_quantity, v_yield_unit_id
      from public.recipes r
     where r.prep_item_id = p_item_id
       and r.tenant_id = p_tenant_id
       and r.target_type = 'prep_item'
       and r.yield_quantity is not null
       and r.yield_unit_id is not null;

    if v_recipe_id is not null then
      v_yield_in_stock := public.inventory_convert_quantity(v_yield_quantity, v_yield_unit_id, v_stock_unit_id);
      if v_yield_in_stock is null or v_yield_in_stock <= 0 then return null; end if;
      v_recipe_cost := public.inventory_recipe_cost(p_tenant_id, v_recipe_id, p_path || p_item_id);
      if v_recipe_cost is null then return null; end if;
      return v_recipe_cost / v_yield_in_stock;
    end if;
  end if;

  return coalesce(v_unit_cost, 0);
end;
$$;

revoke all on function public.inventory_recipe_cost(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.inventory_effective_unit_cost(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.inventory_recipe_cost(uuid, uuid, uuid[]) to service_role;
grant execute on function public.inventory_effective_unit_cost(uuid, uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 2 + 3. The frozen cost, guarded rather than caught; unpriced = NULL.
-- ---------------------------------------------------------------------------
create or replace function public.stock_movement_frozen_cost(
  p_tenant_id uuid,
  p_item_id uuid,
  p_reason text,
  p_outlet_id uuid,
  p_order_id text,
  p_transfer_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost numeric;
  v_value numeric;
  v_quantity numeric;
  v_uncosted integer;
  v_found integer;
begin
  if pg_trigger_depth() < 1 then
    raise exception 'stock_movement_frozen_cost is only called by the stock ledger' using errcode = '42501';
  end if;

  if p_reason = 'void' and p_order_id is not null then
    -- What this order still has out, at what it went out at. A weighted
    -- average over everything the order recorded nets a cancelled order's
    -- food cost to zero, however its lines were split across entered units.
    select count(*), count(*) filter (where m.unit_cost is null),
           sum(-m.quantity_delta * m.unit_cost) filter (where m.unit_cost is not null),
           sum(-m.quantity_delta) filter (where m.unit_cost is not null)
      into v_found, v_uncosted, v_value, v_quantity
      from public.stock_movements m
     where m.order_id = p_order_id
       and m.tenant_id = p_tenant_id
       and m.inventory_item_id = p_item_id
       and m.outlet_id is not distinct from p_outlet_id;

    -- A sale recorded without a cost: its void must not invent one, or the
    -- cancelled order nets to a negative food cost.
    if v_uncosted > 0 then return null; end if;
    if v_quantity > 0 then v_cost := v_value / v_quantity; end if;

  elsif p_reason in ('transfer_in', 'waste') and p_transfer_id is not null then
    -- Stock moving between branches keeps the cost it left at; the shortfall
    -- written off on arrival is valued the same way.
    select count(*), max(m.unit_cost) into v_found, v_cost
      from public.stock_movements m
     where m.stock_transfer_id = p_transfer_id
       and m.tenant_id = p_tenant_id
       and m.inventory_item_id = p_item_id
       and m.reason = 'transfer_out';
    if v_found > 0 and v_cost is null then return null; end if;
  end if;

  if v_cost is null then
    v_cost := public.inventory_effective_unit_cost(p_tenant_id, p_item_id);
  end if;

  -- Never priced is unknown, not free. numeric(16,6) tops out below 1e10; an
  -- absurd recipe is unknown rather than an overflow that fails the movement.
  if v_cost is null or v_cost <= 0 or v_cost >= 100000000 then return null; end if;
  return round(v_cost, 6);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The category snapshot: one guarded select, no catch-all.
-- ---------------------------------------------------------------------------
create or replace function public.order_items_category_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not editable after the fact: the same dish keeps its first category, so a
  -- menu reshuffle (or a crafted PATCH) can't move last month's sales.
  if tg_op = 'UPDATE' and new.menu_item_id is not distinct from old.menu_item_id then
    new.category_name := old.category_name;
    return new;
  end if;

  new.category_name := null;
  if new.menu_item_id is null then return new; end if;

  select c.name into new.category_name
    from public.orders o
    join public.menu_items mi on mi.id = new.menu_item_id and mi.tenant_id = o.tenant_id
    join public.categories c on c.id = mi.category_id and c.tenant_id = o.tenant_id
   where o.id = new.order_id
   limit 1;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Six decimal places for unit costs (per stock unit, often per gram).
-- ---------------------------------------------------------------------------
alter table public.stock_movements alter column unit_cost type numeric(16,6);
alter table public.inventory_items alter column unit_cost type numeric(16,6);
