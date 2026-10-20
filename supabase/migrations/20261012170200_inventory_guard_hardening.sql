-- Inventory guard hardening: Phase 0a (part 3) of the Reports & Inventory suite.
-- Redefines the three ledger guards from 20261012170000 after the security
-- review of 2026-10-12:
--
-- 1. A client movement needs the 'menu' grant (the grant that gates inventory
--    on every surface). Store Activity's security floor (20261012140000) adds
--    the same rule as an RLS policy; until it is applied a cashier token could
--    still post a receive or a count. Both say the same thing, so neither has
--    to wait for the other. Phase 0d replaces 'menu' with the 'inventory' key
--    in BOTH places.
-- 2. A transfer leg is bounded by its transfer. Before, any transfer of the
--    store "covered" a leg on either of its shelves, so a client could post a
--    transfer_in of 10,000 against an old transfer. Now (the service writes the
--    legs while the document is still in the state it leaves — draft for the
--    send, sent for the receipt — see stock-transfers-service.ts):
--      * the item must be on the transfer, and |delta| <= what was sent;
--      * transfer_out: the sending shelf, while the transfer is a draft;
--      * transfer_in: either shelf (receipt, or a shortfall back onto the
--        sender), while the transfer is sent;
--      * waste on a transfer: the sending shelf, while the transfer is sent;
--      * each (transfer, item, reason, shelf) leg once.
-- 3. stock_unit_id cannot change while the item holds stock: switching kg to g
--    re-reads every quantity on the shelf with no ledger row. (The forms block
--    it; the database now does too.)
-- 4. Platform staff are checked against the grant for the operation
--    (stores.create / stores.edit / stores.delete), matching their RLS policies.
--
-- Depends on public.app_user_has_permission (live since the gov-discounts
-- branch, 20261012120000; redefined by the Store Activity floor). This repo
-- branch does not carry that migration; the function's signature is stable.

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

  if not (
    public.app_user_has_permission(v_tenant, 'menu')
    or (v_platform_grant = 'stores.create' and public.app_user_platform_can(array['stores.create']))
    or (v_platform_grant = 'stores.edit' and public.app_user_platform_can(array['stores.edit']))
    or (v_platform_grant = 'stores.delete' and public.app_user_platform_can(array['stores.delete']))
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
    if new.stock_unit_id is distinct from old.stock_unit_id and old.current_qty <> 0 then
      raise exception 'Change the stock unit only while this ingredient is at zero. Count it to zero first.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return old;
end;
$$;

comment on function public.inventory_items_client_guard() is
  'Client roles: ingredient writes need menu (platform staff: the stores.* grant for the operation); current_qty only via apply_stock_movement (depth > 1); stock unit fixed while stock is held. Phase 0a, reports & inventory suite.';

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

  -- No row means ZERO stock, so deleting a row would be a write-off with no
  -- ledger entry.
  if tg_op = 'DELETE' then raise exception 'A branch shelf cannot be deleted. Count it to zero instead.'
    using errcode = '42501';
  end if;

  if not (
    public.app_user_has_permission(v_tenant, 'menu')
    or (tg_op = 'INSERT' and public.app_user_platform_can(array['stores.create']))
    or (tg_op = 'UPDATE' and public.app_user_platform_can(array['stores.edit']))
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
  'Client roles: par rows insert at 0, current_qty/owner columns never change directly, rows never deleted; writes need menu (platform staff: stores.create/edit). Phase 0a, reports & inventory suite.';

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
    public.app_user_has_permission(new.tenant_id, 'menu')
    or public.app_user_platform_can(array['stores.edit'])
  ) then
    raise exception 'Recording stock needs the Menu permission' using errcode = '42501';
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
  if new.stock_transfer_id is null then
    return new;
  end if;

  -- A transfer leg is bounded by its transfer.
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
  else -- waste written against a transfer: the shortfall, on the sender's shelf
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

comment on function public.stock_movements_client_guard() is
  'Client roles: menu grant; only receive/stocktake/waste/transfer legs, no order link, sign matches reason; transfer legs bounded by their transfer (item, quantity, status, once). Fires before stock_movements_apply. Phase 0a, reports & inventory suite.';
