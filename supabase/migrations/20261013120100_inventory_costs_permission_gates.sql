-- ===========================================================================
-- Move the database's inventory and cost gates off `menu` (Phase 0d, §6.1).
-- Requires 20261013120000_staff_permission_keys (app_user_has_permission).
--
--   menu      keeps: the ingredient master (add / rename / archive an
--             ingredient, its unit, category, photo), recipes, units,
--             delete_inventory_item.
--   inventory gets:  recording stock (deliveries, waste, counts, transfers),
--             reorder levels, branch shelves, count sessions, transfer
--             paperwork.
--   costs     gets:  changing what an ingredient costs (directly, or by
--             pricing a delivery), reading the frozen dish cost of every
--             sale (order_item_costs).
--
-- Nobody loses access on apply: the backfill below gives `inventory` and
-- `costs` to every scoped account holding `menu` in the same transaction as
-- the gates move, and NULL permissions hold all keys.
--
-- APPLY WITH THE DEPLOY, NOT BEFORE: the web and the manage-staff edge
-- function in production validate permission lists against their own key
-- registry and refuse a list holding an unknown key, so backfilled accounts
-- could not be edited by their owner until the new registry ships.
--
-- NOT covered here (still open, plan §8.8): `inventory_items.unit_cost` and
-- `stock_movements.unit_cost` stay readable by every staff account of the
-- branch. Hiding a column breaks `select *` readers on three clients, so cost
-- moves to its own `costs`-gated table with the profit pages (Phase 3/5).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One-time backfill: whoever can manage stock and see costs through `menu`
-- today keeps both. Owners and NULL (full access) need nothing.
--
-- Replica mode skips app_users' row triggers for this statement only:
--   * enforce_staff_limit would refuse the UPDATE on a store already over
--     today's seat allowance (a legacy store may be), failing the migration;
--   * store_activity_on_app_users would file one "Changed X's access" event
--     per account, attributed to nobody, for a change no person made;
--   * set_updated_at would make every touched account look freshly edited.
-- ---------------------------------------------------------------------------
set session_replication_role = replica;

update public.app_users au
   set permissions = au.permissions || array(
         select key
           from unnest(array['inventory', 'costs']) as key
          where key <> all (au.permissions)
       )
 where au.role = 'admin'
   and au.is_owner is not true
   and au.permissions is not null
   and 'menu' = any (au.permissions)
   and not (au.permissions @> array['inventory', 'costs']);

set session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- inventory_items: the ingredient master is `menu`; its price is `costs`;
-- changing its reorder level is `inventory` (a starting level rides with
-- adding the ingredient, which is `menu`). Each changed column needs its own grant, so a
-- form that resubmits unchanged fields asks for nothing extra.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_items_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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

    -- An UPDATE that changes nothing above still needs one inventory-side grant:
    -- a register-only account has no business writing this table at all.
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
$$;

-- ---------------------------------------------------------------------------
-- inventory_stock (branch shelves + their reorder levels): `inventory`.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_stock_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- stock_movements: recording stock is `inventory`; pricing a delivery is
-- `costs`. Otherwise unchanged from 20261012170200.
-- ---------------------------------------------------------------------------
create or replace function public.stock_movements_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  -- A priced receive rewrites the ingredient's cost (apply_stock_movement
  -- blends it in at trigger depth 2, where inventory_items_client_guard does
  -- not look), so a delivery price IS a cost change and needs `costs`.
  -- Without it the price is dropped and the delivery recorded uncosted, which
  -- leaves the stored cost alone; on every other reason the ledger trigger
  -- writes the frozen cost itself.
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
$$;

alter policy stock_movements_insert_branch on public.stock_movements
  with check (public.app_user_may_reach_branch(tenant_id, outlet_id) and public.app_user_has_permission(tenant_id, 'inventory'));

-- ---------------------------------------------------------------------------
-- order_item_costs: the frozen dish cost of every sale is `costs`.
-- ---------------------------------------------------------------------------
alter policy order_item_costs_select_menu on public.order_item_costs rename to order_item_costs_select_costs;
alter policy order_item_costs_select_costs on public.order_item_costs
  using (public.app_user_has_permission(tenant_id, 'costs') and public.app_user_may_reach_branch(tenant_id, null));

-- ---------------------------------------------------------------------------
-- Count sessions and transfer paperwork: read by the branch, written with
-- `inventory`. (Their stock legs already needed the grant through
-- stock_movements; the paperwork did not, so a register-only account could
-- open counts and draft transfers it could never complete.)
-- ---------------------------------------------------------------------------
create or replace function public.inventory_write_needs_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;

revoke all on function public.inventory_write_needs_grant() from public, anon, authenticated;

-- A FOR ALL policy's WITH CHECK does not run on DELETE, and its USING clause
-- also gates reads, so writes are policed by a trigger instead of by splitting
-- three policies into twelve.
create or replace trigger inventory_counts_00_needs_grant
  before insert or update or delete on public.inventory_counts
  for each row execute function public.inventory_write_needs_grant();
create or replace trigger stock_transfers_00_needs_grant
  before insert or update or delete on public.stock_transfers
  for each row execute function public.inventory_write_needs_grant();
create or replace trigger stock_transfer_lines_00_needs_grant
  before insert or update or delete on public.stock_transfer_lines
  for each row execute function public.inventory_write_needs_grant();

-- The low-stock bell (app_user_may_read_merchant_notifications) still checks
-- `menu`. Its migration and its two mirrors (the push recipient rule and the
-- app's canSeeMerchantNotifications) live in the merchant-notifications
-- workstream, not on this branch; that workstream moves all three to
-- `inventory` together. Until then nobody loses the bell: every `menu` holder
-- was given `inventory` above.
