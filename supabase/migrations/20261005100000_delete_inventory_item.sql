-- Deleting an ingredient, safely.
--
-- The web's Delete ran a bare `DELETE FROM inventory_items`, which hit two
-- foreign keys:
--   * recipe_components.inventory_item_id is ON DELETE RESTRICT, so ANY
--     ingredient used in a recipe (275 of 768 on the platform) could never be
--     deleted — the merchant saw a generic "Failed to delete ingredient".
--   * stock_movements / inventory_stock / stock_alerts are ON DELETE CASCADE,
--     so an ingredient NOT in a recipe was deleted together with its whole
--     stock ledger — while the confirm dialog promised "Past stock movements
--     are kept".
--
-- This function does what that dialog promised, in one transaction:
--   1. the ingredient's recipe lines are removed (dishes stop using it);
--   2. an ingredient with stock history (movements or transfer lines) is
--      ARCHIVED (is_active = false, the "Not in use" badge) so its history
--      survives; one with no history is deleted outright.
-- `p_dry_run` answers "what would happen?" without changing anything, so the
-- confirm dialog and the write share one decision.
--
-- SECURITY DEFINER because the history check must see EVERY branch's movements:
-- stock_movements SELECT is branch-scoped, so a branch admin running it as
-- themselves would see "no history" and the cascade would erase other
-- branches' ledgers. The caller check mirrors the inventory_items RLS policy
-- ("Admins manage own-tenant rows" + "Superadmins manage all rows").
--
-- Purely additive. Rollback: drop function public.delete_inventory_item(uuid, uuid, boolean);

create or replace function public.delete_inventory_item(
  p_tenant_id uuid,
  p_item_id uuid,
  p_dry_run boolean default false
) returns jsonb
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
  if not exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and (au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = p_tenant_id))
  ) then
    raise exception 'not allowed to manage this store''s inventory' using errcode = '42501';
  end if;

  -- Lock the row so a concurrent stock movement cannot slip in between the
  -- history check and the delete (movements reference this row by FK).
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

revoke all on function public.delete_inventory_item(uuid, uuid, boolean) from public, anon;
grant execute on function public.delete_inventory_item(uuid, uuid, boolean) to authenticated, service_role;

comment on function public.delete_inventory_item(uuid, uuid, boolean) is
  'Removes an ingredient from every recipe, then deletes it — or archives it (is_active=false) when it has stock history, so the ledger is kept. p_dry_run reports the outcome without writing.';
