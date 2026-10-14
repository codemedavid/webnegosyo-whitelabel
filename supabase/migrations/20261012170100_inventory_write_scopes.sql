-- Inventory write scopes: Phase 0a (part 2) of the Reports & Inventory suite
-- (docs/plans/2026-10-12-reports-and-inventory-suite.md, §1.3 / §8.7).
-- Part 1 (20261012170000_inventory_ledger_guards.sql) explains the audit and
-- guards the ledger itself. This part narrows who may write the tables that
-- DECIDE what the ledger records:
--   * order_stock_applications (deduction claims): server-only;
--   * recipes / recipe_components / inventory_units: menu, store-wide accounts;
--   * delete_inventory_item: menu, store-wide accounts;
--   * transfers: the receiving branch can only record what arrived;
--   * grants: history append-only for clients, nothing truncatable;
--   * an index for reading the ledger by store and time.
-- Rollback: see part 1.

-- ============================================
-- 4. order_stock_applications: deduction claims are server-only
-- ============================================

drop policy if exists "Admins manage own-tenant rows" on public.order_stock_applications;
drop policy if exists order_stock_applications_select_member on public.order_stock_applications;
create policy order_stock_applications_select_member on public.order_stock_applications
  for select to authenticated
  using (
    tenant_id in (
      select au.tenant_id from public.app_users au
       where au.user_id = auth.uid() and au.role in ('admin', 'superadmin')
    )
  );

revoke insert, update, delete, truncate on public.order_stock_applications from anon, authenticated;

-- ============================================
-- 5. recipes / recipe_components / inventory_units: menu, store-wide accounts
-- ============================================
-- app_user_may_reach_branch(tenant, NULL) is true only for an account that can
-- reach the store pool: owners and store-wide (non-branch-locked) accounts.

drop policy if exists "Admins manage own-tenant rows" on public.recipes;
drop policy if exists recipes_select_member on public.recipes;
drop policy if exists recipes_insert_menu on public.recipes;
drop policy if exists recipes_update_menu on public.recipes;
drop policy if exists recipes_delete_menu on public.recipes;
create policy recipes_select_member on public.recipes for select to authenticated
  using (tenant_id in (select au.tenant_id from public.app_users au where au.user_id = auth.uid() and au.role in ('admin', 'superadmin')));
create policy recipes_insert_menu on public.recipes for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));
create policy recipes_update_menu on public.recipes for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null))
  with check (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));
create policy recipes_delete_menu on public.recipes for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));

drop policy if exists "Admins manage own-tenant rows" on public.recipe_components;
drop policy if exists recipe_components_select_member on public.recipe_components;
drop policy if exists recipe_components_insert_menu on public.recipe_components;
drop policy if exists recipe_components_update_menu on public.recipe_components;
drop policy if exists recipe_components_delete_menu on public.recipe_components;
create policy recipe_components_select_member on public.recipe_components for select to authenticated
  using (tenant_id in (select au.tenant_id from public.app_users au where au.user_id = auth.uid() and au.role in ('admin', 'superadmin')));
create policy recipe_components_insert_menu on public.recipe_components for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));
create policy recipe_components_update_menu on public.recipe_components for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null))
  with check (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));
create policy recipe_components_delete_menu on public.recipe_components for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));

drop policy if exists "Admins manage own-tenant rows" on public.inventory_units;
drop policy if exists inventory_units_select_member on public.inventory_units;
drop policy if exists inventory_units_insert_menu on public.inventory_units;
drop policy if exists inventory_units_update_menu on public.inventory_units;
drop policy if exists inventory_units_delete_menu on public.inventory_units;
create policy inventory_units_select_member on public.inventory_units for select to authenticated
  using (tenant_id in (select au.tenant_id from public.app_users au where au.user_id = auth.uid() and au.role in ('admin', 'superadmin')));
create policy inventory_units_insert_menu on public.inventory_units for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));
create policy inventory_units_update_menu on public.inventory_units for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null))
  with check (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));
create policy inventory_units_delete_menu on public.inventory_units for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu') and public.app_user_may_reach_branch(tenant_id, null));

-- ============================================
-- 6. delete_inventory_item: menu, store-wide accounts
-- ============================================
-- Same body as 20261005100000; only the gate changes. It wipes the item from
-- every recipe in the store, so a branch-locked account must not run it.

create or replace function public.delete_inventory_item(p_tenant_id uuid, p_item_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ============================================
-- 7. Transfers: the receiving branch can only receive
-- ============================================
-- stock_transfers_manage_branch admits either end. An account that cannot
-- reach the SENDING branch may only stamp the receipt; everything the sender
-- decided (branches, note, sent quantities) is the sender's.

create or replace function public.stock_transfers_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;

revoke all on function public.stock_transfers_client_guard() from public, anon, authenticated;

drop trigger if exists stock_transfers_client_guard on public.stock_transfers;
create trigger stock_transfers_client_guard
  before update on public.stock_transfers
  for each row execute function public.stock_transfers_client_guard();

create or replace function public.stock_transfer_lines_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;

revoke all on function public.stock_transfer_lines_client_guard() from public, anon, authenticated;

drop trigger if exists stock_transfer_lines_client_guard on public.stock_transfer_lines;
create trigger stock_transfer_lines_client_guard
  before insert or update or delete on public.stock_transfer_lines
  for each row execute function public.stock_transfer_lines_client_guard();

-- ============================================
-- 8. Grants: history is append-only, nothing is truncatable
-- ============================================

revoke update, delete, truncate on public.inventory_audit_log from anon, authenticated;
revoke truncate on public.inventory_items, public.inventory_stock, public.stock_movements,
  public.recipes, public.recipe_components, public.inventory_units,
  public.stock_transfers, public.stock_transfer_lines from anon, authenticated;

-- ============================================
-- 9. Index: reports read the ledger by store and time
-- ============================================

create index if not exists stock_movements_tenant_created_idx
  on public.stock_movements (tenant_id, created_at desc);
