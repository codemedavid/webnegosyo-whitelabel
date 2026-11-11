-- ===========================================================================
-- 'block' stock policy, enforced by the SERVER (owner decision 2026-11-09).
-- Plan: docs/plans/2026-11-10-pos-block-server.md.
--
-- On a store with tenants.pos_stock_policy = 'block' an ONLINE register sale
-- that sells past the shelf needs a manager approval the server can verify;
-- a sale taken OFFLINE is kept but flagged for the owner. 'warn' stores and the
-- web checkout (service role / anon) are unchanged.
--
-- Platform register sales are DIRECT PostgREST inserts from the cashier's
-- session, written behind (after the customer already has the food). So the
-- stock judgement happens at Charge, in POST /api/pos/stock-clearance (the
-- same TS engine as the ceilings and the checkout guard), and the database
-- refuses any client write that did not go through it:
--
--   1. pos_stock_clearances: the server's verdict for ONE sale, bound to the
--      store, branch, cashier, the order id the register minted, and the
--      per-dish quantities it judged. An oversell carries its approver (a
--      manager's PIN, or the cashier's own `inventory` right). Service role
--      only: no client can read, write or forge one.
--   2. orders_pos_stock_guard (BEFORE INSERT on orders, `authenticated` only,
--      every source): on a block store the row needs a clearance for
--      (store, its id, auth.uid(), its branch) or the offline marker
--      customer_data.pos.stockCheck = 'offline'. Else 42501.
--   3. order_items_pos_stock_guard (AFTER INSERT statement, `authenticated`
--      only): a fresh order (no revision yet) holding a clearance may not
--      hold more of any dish than that clearance judged, however its items
--      are split across inserts. Edits claim a revision first and are judged
--      by the ledger flag instead.
--   4. stock_movements_pos_oversell (AFTER INSERT, a register order's `sale`
--      movement leaving an active shelf below zero on a block store): ONE
--      Store Activity row `stock.oversold` per order. Approved → the
--      approver, no flag; offline marker → `oversold_offline`; anything else
--      (an edit, a race, an option swap) → `oversold_unapproved`.
--
-- What the server cannot verify is a register that SAYS it is offline. That is
-- the owner's rule (never lose a sale already handed over); every such
-- oversell is flagged.
--
-- Older app builds never ask for a clearance: on a block store every sale they
-- write is refused at sync. Ship the app OTA BEFORE applying this file.
--
-- Idempotent. Runner: tests/sql/run-pos-stock-block-server.cjs.
-- Rollback:
--   drop trigger if exists stock_movements_pos_oversell on public.stock_movements;
--   drop trigger if exists order_items_pos_stock_guard on public.order_items;
--   drop trigger if exists orders_pos_stock_guard on public.orders;
--   drop function if exists public.orders_pos_stock_guard();
--   drop function if exists public.order_items_pos_stock_guard();
--   drop schema if exists pos_private cascade;
--   drop table if exists public.pos_stock_clearances;
--   (restore store_activity_category_of + store_activity_flags_ck from 20261027170000)
-- ===========================================================================

-- orders / order_items / stock_movements are hot: never queue behind a long
-- transaction holding them.
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Clearances
-- ---------------------------------------------------------------------------
create table if not exists public.pos_stock_clearances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- No FK: evidence must survive a branch removal.
  outlet_id uuid,
  -- The id the register minted; the order does not exist yet (no FK).
  order_id uuid not null,
  cashier_user_id uuid not null,
  cashier_name text,
  -- Set exactly when the sale sold past the shelf (shortfalls non-empty).
  approver_user_id uuid,
  approver_name text,
  -- menu item id -> units of that dish the sale may hold.
  quantities jsonb not null,
  -- What was short when the server judged it: [{menuItemId, requested, producible}].
  shortfalls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_stock_clearances_quantities_ck check (jsonb_typeof(quantities) = 'object'),
  constraint pos_stock_clearances_shortfalls_ck check (jsonb_typeof(shortfalls) = 'array'),
  constraint pos_stock_clearances_approval_ck check (
    (approver_user_id is not null) = (jsonb_array_length(shortfalls) > 0)
  ),
  constraint pos_stock_clearances_names_ck check (
    (cashier_name is null or length(cashier_name) <= 200)
    and (approver_name is null or length(approver_name) <= 200)
  )
);

comment on table public.pos_stock_clearances is
  'Server verdict for one register sale on a block store (fits, or approved oversell), bound to store/branch/cashier/order id/quantities. Written only by POST /api/pos/stock-clearance (service role).';

create index if not exists pos_stock_clearances_order_idx
  on public.pos_stock_clearances (tenant_id, order_id, created_at desc);

alter table public.pos_stock_clearances enable row level security;
revoke all on public.pos_stock_clearances from public, anon, authenticated, service_role;
grant select, insert on public.pos_stock_clearances to service_role;

-- ---------------------------------------------------------------------------
-- 2. Helpers. A schema PostgREST does not expose, so the definer helpers the
--    invoker guards call are not an RPC surface; executable only by the role
--    the guards run as.
-- ---------------------------------------------------------------------------
create schema if not exists pos_private;
revoke all on schema pos_private from public, anon;
grant usage on schema pos_private to authenticated;

-- May this client insert this order? Reads tenants + clearances as the owner.
create or replace function pos_private.order_insert_allowed(
  p_tenant uuid, p_order uuid, p_outlet uuid, p_customer_data jsonb
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select t.pos_stock_policy from public.tenants t where t.id = p_tenant), 'warn') <> 'block'
    or coalesce(p_customer_data #>> '{pos,stockCheck}', '') = 'offline'
    or exists (
      select 1 from public.pos_stock_clearances c
       where c.tenant_id = p_tenant
         and c.order_id = p_order
         and c.cashier_user_id = auth.uid()
         and c.outlet_id is not distinct from p_outlet
    )
$$;

-- Do this order's items stay within what its clearance judged?
create or replace function pos_private.order_items_allowed(p_order uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_data jsonb;
  v_quantities jsonb;
begin
  select o.tenant_id, o.customer_data into v_tenant, v_data
    from public.orders o where o.id = p_order;
  if v_tenant is null then return true; end if;  -- the FK answers for a missing order
  if coalesce((select t.pos_stock_policy from public.tenants t where t.id = v_tenant), 'warn') <> 'block' then
    return true;
  end if;
  if coalesce(v_data #>> '{pos,stockCheck}', '') = 'offline' then return true; end if;
  -- An edit claims its revision before re-inserting items: the ledger judges it.
  if exists (select 1 from public.order_revisions r where r.order_id = p_order) then return true; end if;

  select c.quantities into v_quantities
    from public.pos_stock_clearances c
   where c.tenant_id = v_tenant and c.order_id = p_order
   order by c.created_at desc, c.id desc
   limit 1;
  -- No clearance: the order was not written by a client under 'block'
  -- (service role, or before the switch); guard 2 owns client inserts.
  if v_quantities is null then return true; end if;

  return not exists (
    select 1
      from (
        select i.menu_item_id, sum(i.quantity) as units
          from public.order_items i
         where i.order_id = p_order and i.menu_item_id is not null
         group by i.menu_item_id
      ) held
     where held.units > coalesce((v_quantities ->> held.menu_item_id::text)::numeric, 0)
  );
end;
$$;

revoke all on function pos_private.order_insert_allowed(uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function pos_private.order_items_allowed(uuid) from public, anon, authenticated, service_role;
grant execute on function pos_private.order_insert_allowed(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function pos_private.order_items_allowed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guards. SECURITY INVOKER on purpose: current_user must be the caller's
--    role (as guard_tenant_pos_stock_policy). Only `authenticated` is judged.
-- ---------------------------------------------------------------------------
create or replace function public.orders_pos_stock_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if pos_private.order_insert_allowed(new.tenant_id, new.id, new.outlet_id, new.customer_data) then
    return new;
  end if;
  raise exception 'POS_STOCK_NEEDS_APPROVAL: this store needs a manager to approve selling past the stock count'
    using errcode = '42501',
          hint = 'Ask POST /api/pos/stock-clearance for this order id before writing it.';
end;
$$;

revoke all on function public.orders_pos_stock_guard() from public, anon;

drop trigger if exists orders_pos_stock_guard on public.orders;
create trigger orders_pos_stock_guard
  before insert on public.orders
  for each row execute function public.orders_pos_stock_guard();

create or replace function public.order_items_pos_stock_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order uuid;
begin
  if current_user <> 'authenticated' then
    return null;
  end if;
  for v_order in select distinct i.order_id from pos_inserted_items i loop
    if not pos_private.order_items_allowed(v_order) then
      raise exception 'POS_STOCK_ITEMS_NOT_CLEARED: this sale holds more than its stock check approved'
        using errcode = '42501';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.order_items_pos_stock_guard() from public, anon;

drop trigger if exists order_items_pos_stock_guard on public.order_items;
create trigger order_items_pos_stock_guard
  after insert on public.order_items
  referencing new table as pos_inserted_items
  for each statement execute function public.order_items_pos_stock_guard();

-- ---------------------------------------------------------------------------
-- 4. Store Activity vocabulary: the kind `stock.oversold` and two flags.
--    The body is 20261027170000's with 'stock.oversold' added; the TS mirror
--    (src/lib/activity/taxonomy.ts) is test-enforced equal to the newest file.
-- ---------------------------------------------------------------------------
create or replace function public.store_activity_category_of(p_kind text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_kind in ('order.cancelled', 'order.reopened', 'order.edited', 'order.deleted', 'order.placed', 'order.status_changed', 'order.completed') then 'orders'
    when p_kind in ('refund.issued', 'payment.recorded', 'payment.marked_paid', 'payment.proof_approved', 'payment.proof_rejected', 'discount.applied', 'voucher.redeemed', 'voucher.released', 'payment.charged') then 'money'
    when p_kind in ('shift.opened', 'shift.closed', 'cash.pay_in', 'cash.pay_out', 'cash.collected', 'receipt.reprinted', 'shift.reconciled', 'cash.remitted', 'cash.remittance_accepted', 'cash.remittance_disputed', 'cash.remittance_resolved', 'day.closed', 'day.reopened', 'day.deposit_recorded') then 'cash'
    when p_kind in ('stock.received', 'stock.wasted', 'stock.counted', 'stock.adjusted', 'stock.transfer_sent', 'stock.transfer_received', 'stock.duplicate_blocked', 'stock.alert', 'stock.sale', 'stock.restored', 'stock.oversold') then 'stock'
    when p_kind in ('loyalty.reward_claimed', 'loyalty.reward_voided', 'loyalty.stamps_adjusted', 'loyalty.program_changed', 'loyalty.stamps_earned', 'loyalty.reward_issued') then 'loyalty'
    when p_kind in ('menu.price_changed', 'menu.availability_changed', 'menu.item_added', 'menu.item_removed') then 'menu'
    when p_kind in ('staff.added', 'staff.removed', 'staff.access_changed', 'settings.changed', 'rules.changed', 'assistant.action_confirmed', 'campaign.status_changed', 'voucher.status_changed') then 'team'
    when p_kind in ('approval.requested', 'approval.approved', 'approval.declined', 'approval.expired', 'approval.withdrawn', 'approval.executed', 'approval.failed') then 'approvals'
    when p_kind in ('expense.recorded', 'expense.voided') then 'expenses'
  end
$$;
revoke all on function public.store_activity_category_of(text) from public, anon, authenticated;

alter table public.store_activity drop constraint if exists store_activity_flags_ck;
alter table public.store_activity
  -- store_activity_flags_ck
  add constraint store_activity_flags_ck check (flags <@ array[
    'paid_then_cancelled', 'cash_refund_noncash_order', 'after_hours', 'drawer_variance',
    'removed_after_kitchen', 'repeat_cancels', 'count_variance', 'duplicate_deduction',
    'forced_close', 'remittance_discrepancy', 'day_reopened', 'oversold_offline', 'oversold_unapproved'
  ]::text[]) not valid;

-- ---------------------------------------------------------------------------
-- 5. The ledger flag. Fires only on a sale movement that left the shelf below
--    zero (the WHEN clause), so an ordinary sale pays nothing.
-- ---------------------------------------------------------------------------
create or replace function pos_private.record_pos_oversell()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_source text;
  v_number text;
  v_data jsonb;
  v_item text;
  v_cashier uuid;
  v_cashier_name text;
  v_approver uuid;
  v_approver_name text;
  v_is_offline boolean;
  v_flags text[];
  v_title text;
begin
  if coalesce((select t.pos_stock_policy from public.tenants t where t.id = new.tenant_id), 'warn') <> 'block' then
    return null;
  end if;
  -- Platform order ids are uuids; anything else is not a register sale here.
  if new.order_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_order_id := new.order_id::uuid;

  select o.source, o.order_number, o.customer_data into v_source, v_number, v_data
    from public.orders o
   where o.id = v_order_id and o.tenant_id = new.tenant_id;
  if not found or v_source not in ('pos', 'qr_handoff') then
    return null;
  end if;

  -- An inactive ingredient is not judged (producible.ts: no opinion).
  select i.name into v_item
    from public.inventory_items i
   where i.id = new.inventory_item_id and i.tenant_id = new.tenant_id and i.is_active;
  if not found then
    return null;
  end if;

  select c.cashier_user_id, c.cashier_name, c.approver_user_id, c.approver_name
    into v_cashier, v_cashier_name, v_approver, v_approver_name
    from public.pos_stock_clearances c
   where c.tenant_id = new.tenant_id and c.order_id = v_order_id
   order by c.created_at desc, c.id desc
   limit 1;

  if v_cashier is null and coalesce(v_data #>> '{pos,cashierId}', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_cashier := (v_data #>> '{pos,cashierId}')::uuid;
  end if;

  v_is_offline := coalesce(v_data #>> '{pos,stockCheck}', '') = 'offline';
  v_flags := case
    when v_approver is not null then '{}'::text[]
    when v_is_offline then array['oversold_offline']
    else array['oversold_unapproved']
  end;
  v_title := 'Sold past stock: ' || v_item || ' went below zero';

  insert into public.store_activity (
    tenant_id, outlet_id, occurred_at, category, kind, is_routine,
    actor_user_id, actor_name, approved_by, approved_by_name, quantity,
    subject_type, subject_ref, order_number, backend, external_order_id,
    after, summary, flags, source_table, source_id, event_key
  ) values (
    new.tenant_id, new.outlet_id, new.created_at, 'stock', 'stock.oversold', false,
    v_cashier, v_cashier_name, v_approver, v_approver_name, new.balance_after,
    'order', v_order_id::text, v_number, 'platform', v_order_id::text,
    jsonb_build_object('quantity', new.balance_after),
    jsonb_build_object('title', v_title, 'itemName', v_item, 'offline', v_is_offline, 'approved', v_approver is not null),
    v_flags, 'stock_movements', new.id::text,
    'stock.oversold:' || new.tenant_id::text || ':' || v_order_id::text
  )
  on conflict (event_key) do nothing;

  return null;
end;
$$;

revoke all on function pos_private.record_pos_oversell() from public, anon, authenticated, service_role;

drop trigger if exists stock_movements_pos_oversell on public.stock_movements;
create trigger stock_movements_pos_oversell
  after insert on public.stock_movements
  for each row
  when (new.reason = 'sale' and new.order_id is not null and new.quantity_delta < 0 and new.balance_after < -0.0001)
  execute function pos_private.record_pos_oversell();
