-- ===========================================================================
-- Inventory permission hardening, part 4: units can't be reinterpreted, and
-- only a store-wide account deletes an ingredient.
-- (inventory DB security audit 2026-11-03, findings L3 and L4)
--
-- L3 A quantity is a bare number read in its unit. inventory_items_client_guard
--    locks stock_unit_id only while the ROLLUP current_qty is non-zero, but
--    branch shelves (+5 here, -5 there) can sum to zero; and nothing stopped a
--    unit's to_base_factor / dimension changing under the ingredients and
--    recipe lines that use it (12 "pack" of 12 becoming 12 "pack" of 6).
--    Now, for client roles:
--      - stock_unit_id changes only while EVERY shelf of the ingredient is 0;
--      - a unit's to_base_factor / dimension change only while no ingredient
--        is stocked in it and no recipe line or prep yield uses it.
--    Renaming a unit, or resubmitting the same factor, still works
--    (src/lib/inventory/units-service.ts sends the whole row).
-- L4 (partial) A client DELETE of an ingredient now needs a store-wide account,
--    as delete_inventory_item already requires. The web deletes ONLY through
--    that RPC (definer, unaffected) and the merchant app never deletes.
--    NOT done: requiring store-wide for every ingredient INSERT/UPDATE. The
--    merchant app's ingredient editor (app/(main)/ingredient/edit) creates and
--    edits ingredients for branch-scoped accounts too (opening stock "on this
--    branch's shelf"), and the deployed app/web gate those writes by
--    permission only. Restricting them is a product decision; reported.
--
-- Separate triggers, so inventory_items_client_guard / inventory_stock_client_guard
-- (and the counted_at guard of 20261103120000) are not redefined here.
-- Runner: tests/sql/run-inventory-permission-hardening.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- Definer: a branch-locked caller sees only its own shelves, and the lock must
-- hold for the shelves it cannot see.
create or replace function public.inventory_item_has_stock_on_any_shelf(p_tenant_id uuid, p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inventory_stock s
     where s.tenant_id = p_tenant_id
       and s.inventory_item_id = p_item_id
       and s.current_qty <> 0
  );
$$;

revoke all on function public.inventory_item_has_stock_on_any_shelf(uuid, uuid) from public, anon;
grant execute on function public.inventory_item_has_stock_on_any_shelf(uuid, uuid) to authenticated, service_role;

create or replace function public.inventory_units_in_use(p_tenant_id uuid, p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.inventory_items i where i.tenant_id = p_tenant_id and i.stock_unit_id = p_unit_id)
      or exists (select 1 from public.recipe_components c where c.tenant_id = p_tenant_id and c.unit_id = p_unit_id)
      or exists (select 1 from public.recipes r where r.tenant_id = p_tenant_id and r.yield_unit_id = p_unit_id);
$$;

revoke all on function public.inventory_units_in_use(uuid, uuid) from public, anon;
grant execute on function public.inventory_units_in_use(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- L3a stock unit: every shelf at zero.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_items_stock_unit_shelf_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.stock_unit_id is distinct from old.stock_unit_id
     and public.inventory_item_has_stock_on_any_shelf(old.tenant_id, old.id) then
    raise exception 'Change the stock unit only while every branch holds zero of this ingredient. Count it to zero first.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.inventory_items_stock_unit_shelf_guard() from public, anon, authenticated;

drop trigger if exists inventory_items_02_stock_unit_shelves on public.inventory_items;
create trigger inventory_items_02_stock_unit_shelves
  before update of stock_unit_id on public.inventory_items
  for each row execute function public.inventory_items_stock_unit_shelf_guard();

-- ---------------------------------------------------------------------------
-- L3b unit meaning: fixed while anything measures in it.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_units_meaning_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return new;
  end if;
  if (new.to_base_factor, new.dimension) is distinct from (old.to_base_factor, old.dimension)
     and public.inventory_units_in_use(old.tenant_id, old.id) then
    raise exception 'This unit is in use by an ingredient or recipe, so its size cannot change. Add a new unit instead.'
      using errcode = '42501';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'A unit cannot move to another store' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.inventory_units_meaning_guard() from public, anon, authenticated;

drop trigger if exists inventory_units_01_meaning on public.inventory_units;
create trigger inventory_units_01_meaning
  before update on public.inventory_units
  for each row execute function public.inventory_units_meaning_guard();

-- ---------------------------------------------------------------------------
-- L4 (partial) deleting an ingredient is store-wide, like delete_inventory_item.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_items_store_wide_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return old;
  end if;
  if public.app_user_may_reach_branch(old.tenant_id, null)
     or exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
     or public.app_user_platform_can(array['stores.delete']) then
    return old;
  end if;
  raise exception 'Only a store-wide account can delete an ingredient.' using errcode = '42501';
end;
$$;

revoke all on function public.inventory_items_store_wide_delete_guard() from public, anon, authenticated;

drop trigger if exists inventory_items_02_store_wide_delete on public.inventory_items;
create trigger inventory_items_02_store_wide_delete
  before delete on public.inventory_items
  for each row execute function public.inventory_items_store_wide_delete_guard();
