-- Inventory ledger guards: Phase 0a of the Reports & Inventory suite
-- (docs/plans/2026-10-12-reports-and-inventory-suite.md, §1.3 / §8.2).
--
-- Stock may change only through a stock movement, and a movement written from
-- a staff device may claim to be only what that device can actually do.
-- A 2026-10-12 audit, made against the live database, found that ANY staff
-- token (a cashier with only the register) could:
--   * PATCH inventory_items.current_qty / unit_cost, or inventory_stock.current_qty,
--     straight through PostgREST. No ledger row and no audit row were written,
--     so "shelf = ledger sum" broke and a theft could hide inside a variance.
--   * INSERT stock_movements as reason 'sale' / 'void', with a sign that
--     contradicts the reason (a "waste" that adds stock), tied to any order,
--     or as a transfer leg for a transfer that does not exist.
--   * DELETE order_stock_applications, so the next retry deducted an order
--     twice; or INSERT one ahead of time, so an order was never deducted.
--   * rewrite store-wide recipes and units from a branch-locked or
--     kitchen-only account.
--   * archive any ingredient through delete_inventory_item (it checked store
--     membership only).
--   * as the RECEIVING branch, edit the sender's half of a transfer document.
--
-- Not repeated here: actor and time stamping on stock_movements, and the
-- 'menu' grant on movement inserts. Both belong to the Store Activity
-- security floor (20261012140000_security_floor_activity.sql).
--
-- The mechanism: BEFORE triggers that police client roles only.
--   * The service role (order depletion, transfer-free server writers) and
--     SECURITY DEFINER functions run as other roles, so they pass.
--   * apply_stock_movement() runs as the INVOKER and updates
--     inventory_items / inventory_stock one trigger level down, so those
--     updates arrive at pg_trigger_depth() > 1 and pass. A PostgREST request
--     cannot reach depth 2 any other way: no client-writable table has a
--     trigger that writes these tables.
--
-- Writers checked on 2026-10-12 (src/, webnegosyo-app/, webnegosyo-desktop/,
-- supabase/functions, convex-template):
--   * current_qty: written only by apply_stock_movement. Clients only ever
--     insert inventory_stock par rows at 0 (branch-par-service.ts).
--   * unit_cost: the ingredient forms (web + app) and the receive blend in
--     stock-service.ts. All of them already require 'menu' in code.
--   * client movement reasons: receive / stocktake / waste (manual), plus
--     transfer_out / transfer_in / waste carrying stock_transfer_id
--     (stock-transfers-service.ts). sale / void come only from the service
--     role (order-stock-service.ts). Live: all 2,714 sale/void rows carry
--     order_id and no actor.
--   * order_stock_applications: written only by order-stock-service.ts
--     through the service role.
--
-- Rollback (manual):
--   drop trigger if exists inventory_items_client_guard on public.inventory_items;
--   drop trigger if exists inventory_stock_client_guard on public.inventory_stock;
--   drop trigger if exists stock_movements_00_client_guard on public.stock_movements;
--   drop trigger if exists stock_transfers_client_guard on public.stock_transfers;
--   drop trigger if exists stock_transfer_lines_client_guard on public.stock_transfer_lines;
--   then recreate "Admins manage own-tenant rows" (ALL, tenant membership) on
--   recipes / recipe_components / inventory_units / order_stock_applications,
--   re-grant insert/update/delete on order_stock_applications, and restore
--   delete_inventory_item from 20261005100000_delete_inventory_item.sql.

-- ============================================
-- 1. inventory_items: the running total belongs to the ledger
-- ============================================

create or replace function public.inventory_items_client_guard()
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

  if not (
    public.app_user_has_permission(v_tenant, 'menu')
    or public.app_user_platform_can(array['stores.edit'])
  ) then
    raise exception 'Managing ingredients needs the Menu permission' using errcode = '42501';
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
    return new;
  end if;

  return old;
end;
$$;

comment on function public.inventory_items_client_guard() is
  'Client roles: ingredient writes need menu; current_qty only changes via apply_stock_movement (trigger depth > 1). Phase 0a, reports & inventory suite.';

revoke all on function public.inventory_items_client_guard() from public, anon, authenticated;

drop trigger if exists inventory_items_client_guard on public.inventory_items;
create trigger inventory_items_client_guard
  before insert or update or delete on public.inventory_items
  for each row execute function public.inventory_items_client_guard();

-- ============================================
-- 2. inventory_stock: a branch's shelf belongs to the ledger
-- ============================================

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

  -- No row means ZERO stock (multi-branch inventory), so deleting a row would
  -- be a write-off with no ledger entry.
  if tg_op = 'DELETE' then raise exception 'A branch shelf cannot be deleted. Count it to zero instead.'
    using errcode = '42501';
  end if;

  if not (
    public.app_user_has_permission(v_tenant, 'menu')
    or public.app_user_platform_can(array['stores.edit'])
  ) then
    raise exception 'Managing stock needs the Menu permission' using errcode = '42501';
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

comment on function public.inventory_stock_client_guard() is
  'Client roles: par rows insert at 0, current_qty/owner columns never change directly, rows never deleted. Phase 0a, reports & inventory suite.';

revoke all on function public.inventory_stock_client_guard() from public, anon, authenticated;

drop trigger if exists inventory_stock_client_guard on public.inventory_stock;
create trigger inventory_stock_client_guard
  before insert or update or delete on public.inventory_stock
  for each row execute function public.inventory_stock_client_guard();

-- ============================================
-- 3. stock_movements: a client may only claim what a client can do
-- ============================================

create or replace function public.stock_movements_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Sales and voids are derived from orders by the server. A client claiming
  -- one is either a bug or a way to hide stock behind a plausible reason.
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

  -- A leg (or a shortfall write-off) sits on one of ITS transfer's two shelves.
  if new.stock_transfer_id is not null and not exists (
    select 1
      from public.stock_transfers t
     where t.id = new.stock_transfer_id
       and t.tenant_id = new.tenant_id
       and (new.outlet_id is not distinct from t.from_outlet_id
            or new.outlet_id is not distinct from t.to_outlet_id)
  ) then
    raise exception 'This transfer does not move stock on that shelf.' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.stock_movements_client_guard() is
  'Client roles: only receive/stocktake/waste/transfer legs, no order link, sign matches reason, transfer legs on their own transfer. Fires before stock_movements_apply. Phase 0a, reports & inventory suite.';

revoke all on function public.stock_movements_client_guard() from public, anon, authenticated;

-- BEFORE triggers fire in name order: this one must run before
-- stock_movements_apply touches any running total.
drop trigger if exists stock_movements_00_client_guard on public.stock_movements;
create trigger stock_movements_00_client_guard
  before insert on public.stock_movements
  for each row execute function public.stock_movements_client_guard();
