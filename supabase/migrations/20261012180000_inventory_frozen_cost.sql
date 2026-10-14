-- Reports & Inventory suite, Phase 0b: every movement carries its cost.
--
-- Before this, only a delivery stored a price. A sale, a waste or a count was
-- valued at report time with whatever the ingredient costs TODAY, so editing a
-- cost rewrote every past month's food cost, and a cancelled order could come
-- back at a different price than it went out at. The weighted average was
-- blended in the web request from an item read before the insert, so two
-- deliveries landing together each blended against the same stale shelf.
--
-- After this:
--   * a delivery keeps the price it was given (blank = uncosted, never free) and
--     the ledger trigger blends it into the average under the row lock;
--   * every other movement has its cost set by the database, whatever the
--     caller sent: a void reuses what its order took out, a transfer arrival
--     reuses what it left at, everything else freezes today's cost;
--   * a prep is costed from its recipe ÷ yield, mirroring costing.ts;
--   * an order line carries the category it was sold under, and its dish cost
--     goes to `order_item_costs`, which only cost-readers can see.
--
-- History is not rewritten: movements and lines from before this keep NULL
-- ("not recorded"), and reports label them.

-- ---------------------------------------------------------------------------
-- 1. Costing helpers, a line-for-line mirror of src/lib/inventory/costing.ts.
--    NULL means "cannot be known" wherever costing.ts would throw.
-- ---------------------------------------------------------------------------

-- unit-conversion.ts convertQuantity: same unit as is; weight and volume share
-- a base (water density, 1 g = 1 ml); count converts only to count.
create or replace function public.inventory_convert_quantity(
  p_quantity numeric,
  p_from_unit_id uuid,
  p_to_unit_id uuid
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from_dimension text;
  v_from_factor numeric;
  v_to_dimension text;
  v_to_factor numeric;
begin
  if p_quantity is null then return null; end if;
  if p_from_unit_id = p_to_unit_id then return p_quantity; end if;

  select u.dimension, u.to_base_factor into v_from_dimension, v_from_factor
    from public.inventory_units u where u.id = p_from_unit_id;
  select u.dimension, u.to_base_factor into v_to_dimension, v_to_factor
    from public.inventory_units u where u.id = p_to_unit_id;

  if v_from_factor is null or v_to_factor is null or v_to_factor = 0 then return null; end if;
  if v_from_dimension <> v_to_dimension
     and not (v_from_dimension in ('weight', 'volume') and v_to_dimension in ('weight', 'volume')) then
    return null;
  end if;

  return p_quantity * v_from_factor / v_to_factor;
end;
$$;

-- costing.ts costRecipe: Σ component quantity (in the ingredient's stock unit)
-- × the ingredient's effective unit cost.
create or replace function public.inventory_recipe_cost(
  p_tenant_id uuid,
  p_recipe_id uuid,
  p_depth integer default 0
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
  -- costing.ts throws on a cycle; a prep that (indirectly) contains itself
  -- recurses until here and ends as unknown.
  if p_depth > 16 then return null; end if;
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
      * public.inventory_effective_unit_cost(p_tenant_id, v_line.inventory_item_id, p_depth + 1);
    if v_line_cost is null then return null; end if;
    v_total := v_total + v_line_cost;
  end loop;

  return v_total;
end;
$$;

-- costing.ts resolveIngredientUnitCost: a raw ingredient costs its own unit
-- cost (unpriced reads as 0); a prep with a yielding recipe costs that recipe
-- ÷ its yield in the prep's stock unit; a prep without one falls back to its
-- own unit cost, as graph-builder.ts does.
create or replace function public.inventory_effective_unit_cost(
  p_tenant_id uuid,
  p_item_id uuid,
  p_depth integer default 0
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
  if p_depth > 16 then return null; end if;

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
      v_recipe_cost := public.inventory_recipe_cost(p_tenant_id, v_recipe_id, p_depth + 1);
      if v_recipe_cost is null then return null; end if;
      return v_recipe_cost / v_yield_in_stock;
    end if;
  end if;

  return coalesce(v_unit_cost, 0);
end;
$$;

revoke all on function public.inventory_convert_quantity(numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_recipe_cost(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.inventory_effective_unit_cost(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.inventory_convert_quantity(numeric, uuid, uuid) to service_role;
grant execute on function public.inventory_recipe_cost(uuid, uuid, integer) to service_role;
grant execute on function public.inventory_effective_unit_cost(uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The cost a non-delivery movement is frozen at.
--
-- SECURITY DEFINER because the ledger trigger runs as the caller, and a
-- branch-locked receiver cannot see the sender's `transfer_out` row (nor the
-- recipes behind a prep) under its own RLS. Callable only from inside a
-- trigger: a direct RPC is depth 0 and refused, so it cannot be used to read
-- another store's costs.
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

  begin
    if p_reason = 'void' and p_order_id is not null then
      -- What this order still has out, at what it went out at. A weighted
      -- average over everything the order recorded (sales, edit corrections,
      -- earlier voids) nets a cancelled order's food cost to exactly zero,
      -- however its lines were split across entered units.
      select count(*), count(*) filter (where m.unit_cost is null),
             sum(-m.quantity_delta * m.unit_cost) filter (where m.unit_cost is not null),
             sum(-m.quantity_delta) filter (where m.unit_cost is not null)
        into v_found, v_uncosted, v_value, v_quantity
        from public.stock_movements m
       where m.order_id = p_order_id
         and m.tenant_id = p_tenant_id
         and m.inventory_item_id = p_item_id
         and m.outlet_id is not distinct from p_outlet_id;

      -- A sale written before costs were frozen has none; its void must not
      -- invent one, or the cancelled order nets to a negative food cost.
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

    -- numeric(12,4) tops out below 1e8; an absurd recipe must not overflow
    -- and take the movement down with it.
    if v_cost is null or v_cost < 0 or v_cost >= 100000000 then return null; end if;
    return round(v_cost, 4);
  exception when others then
    -- A cost is never worth losing a sale over: record it as unknown, loudly.
    raise warning 'stock_movement_frozen_cost(tenant %, item %, %): % (%)',
      p_tenant_id, p_item_id, p_reason, sqlerrm, sqlstate;
    return null;
  end;
end;
$$;

revoke all on function public.stock_movement_frozen_cost(uuid, uuid, text, uuid, text, uuid) from public, anon;
grant execute on function public.stock_movement_frozen_cost(uuid, uuid, text, uuid, text, uuid) to authenticated, service_role;

alter table public.stock_movements
  add constraint stock_movements_unit_cost_nonnegative check (unit_cost is null or unit_cost >= 0);

-- ---------------------------------------------------------------------------
-- 3. The ledger trigger: unchanged, plus the cost.
--    Live body as of 2026-10-12 (20260810120000_apply_stock_movement_merge).
-- ---------------------------------------------------------------------------
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
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
    -- A delivery states its own price (per stock unit); blank is uncosted and
    -- leaves the average alone. stock-ledger.ts movingAverageUnitCost: an
    -- empty, negative or never-priced shelf takes the delivery price outright.
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
$$;

-- ---------------------------------------------------------------------------
-- 4. Order lines: the category they were sold under.
--    Older lines stay NULL and are reported "by current menu".
-- ---------------------------------------------------------------------------
alter table public.order_items add column if not exists category_name text;

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

  begin
    select c.name into new.category_name
      from public.orders o
      join public.menu_items mi on mi.id = new.menu_item_id and mi.tenant_id = o.tenant_id
      join public.categories c on c.id = mi.category_id and c.tenant_id = o.tenant_id
     where o.id = new.order_id;
  exception when others then
    -- A label is never worth losing an order over.
    raise warning 'order_items_category_snapshot(order %): % (%)', new.order_id, sqlerrm, sqlstate;
    new.category_name := null;
  end;
  return new;
end;
$$;

revoke all on function public.order_items_category_snapshot() from public, anon, authenticated;

drop trigger if exists order_items_category_snapshot on public.order_items;
create trigger order_items_category_snapshot before insert or update on public.order_items
  for each row execute function public.order_items_category_snapshot();

-- ---------------------------------------------------------------------------
-- 5. Dish costs at the moment of sale, in a table of their own.
--
-- Not a column on `order_items`: every staff account that can see an order
-- can read its lines, and a dish's cost is the owner's margin. The cost is the
-- dish's BASE recipe (what depletion spends for a saved order line), else the
-- owner's typed product cost, else no row ("not costed").
-- ---------------------------------------------------------------------------
create table if not exists public.order_item_costs (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  source text not null check (source in ('recipe', 'manual')),
  costed_at timestamptz not null default now()
);

create index if not exists order_item_costs_tenant_costed_idx
  on public.order_item_costs (tenant_id, costed_at desc);

alter table public.order_item_costs enable row level security;
revoke all on public.order_item_costs from anon, authenticated;
grant select on public.order_item_costs to authenticated;
grant all on public.order_item_costs to service_role;

-- Store-wide accounts with Menu (cost) access; Phase 0d moves this to `costs`.
drop policy if exists order_item_costs_select_menu on public.order_item_costs;
create policy order_item_costs_select_menu on public.order_item_costs for select to authenticated using (
  public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null)
);

drop policy if exists order_item_costs_select_platform on public.order_item_costs;
create policy order_item_costs_select_platform on public.order_item_costs for select to authenticated using (
  (select public.app_user_platform_can(array['stores.view', 'tenants.view', 'overview.view']))
);

create or replace function public.order_items_cost_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_recipe_id uuid;
  v_cost numeric;
  v_source text;
begin
  if tg_op = 'UPDATE' and new.menu_item_id is not distinct from old.menu_item_id then
    return null;
  end if;

  begin
    select o.tenant_id into v_tenant_id from public.orders o where o.id = new.order_id;

    if v_tenant_id is not null and new.menu_item_id is not null then
      select r.id into v_recipe_id
        from public.recipes r
       where r.tenant_id = v_tenant_id
         and r.menu_item_id = new.menu_item_id
         and r.target_type = 'menu_item';

      if v_recipe_id is not null then
        v_cost := public.inventory_recipe_cost(v_tenant_id, v_recipe_id);
        if v_cost > 0 then v_source := 'recipe'; else v_cost := null; end if;
      end if;

      if v_cost is null then
        select pc.cost_price into v_cost
          from public.product_costs pc
         where pc.tenant_id = v_tenant_id
           and pc.menu_item_id = new.menu_item_id;
        if v_cost > 0 then v_source := 'manual'; else v_cost := null; end if;
      end if;
    end if;

    if v_cost is not null and v_cost < 100000000 then
      insert into public.order_item_costs (order_item_id, tenant_id, unit_cost, source)
      values (new.id, v_tenant_id, round(v_cost, 4), v_source)
      on conflict (order_item_id) do update
        set unit_cost = excluded.unit_cost, source = excluded.source, costed_at = now();
    elsif tg_op = 'UPDATE' then
      delete from public.order_item_costs where order_item_id = new.id;
    end if;
  exception when others then
    -- A checkout must never fail because a dish could not be costed.
    raise warning 'order_items_cost_snapshot(order item %): % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.order_items_cost_snapshot() from public, anon, authenticated;

drop trigger if exists order_items_cost_snapshot on public.order_items;
create trigger order_items_cost_snapshot after insert or update of menu_item_id on public.order_items
  for each row execute function public.order_items_cost_snapshot();
