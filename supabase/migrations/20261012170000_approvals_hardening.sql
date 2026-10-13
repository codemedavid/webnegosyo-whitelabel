-- Approvals hardening — follow-up to 20261012160000_approvals.sql (Phase 3)
--
-- An independent security review (2026-10-13) of the approvals migration.
-- 20261012160000 is applied and is never edited; every fix lands here.
--
-- H1  The legacy refund door. order_payments_insert_admin (Phase 0) lets any
--     order_refund holder INSERT a kind='refund' row of any size straight from
--     a phone, unlocked, which skips every approval cap and can race
--     execute_refund. A BEFORE INSERT trigger now locks the order and refuses
--     a refund larger than what is left to give back, for EVERY role. For a
--     client role it also applies the direct-refund limits (approval_direct_allowed's
--     refund branch). The POS edit flow keeps working inside those limits.
-- H2  The direct cap was per request, so it could be split into several requests.
--     A direct refund now also needs:
--       order's refunds so far + this ≤ the cap that applies, AND
--       (for order_refund staff) this person's direct refunds today + this ≤ the manager cap.
-- H3  Discount approvals authorised nothing (the register never redeems the
--     token). create_approval_request refuses kind 'discount' until it does;
--     tokens are stored as sha256 only.
-- M1  A write-off of an ingredient with no cost on file is never direct.
-- M2  An idempotency key replayed with a different request → idempotency_conflict.
-- M3  Implicit ledgers (paid by status, no payment rows) read the tender the
--     register recorded; an unknown method counts as cash (open drawer required).
-- M4  Item refunds are worth what the order really charged: a line's value is
--     scaled by orders.total ÷ Σ(line subtotal − line discount), so order-level
--     discounts, vouchers, service charge and fees are shared out pro rata.
--     Rounding: each refunded line is rounded half-away-from-zero to the
--     centavo (numeric round); the per-request total is capped at what is left
--     to refund, and the refund lowers orders.total by exactly that amount, so
--     the remaining lines keep the same ratio.
-- M5  claim_approval_side_effects(): executed refunds whose after-the-fact work
--     (stock, pre-sell, loyalty) never reported back are claimed for a re-run.
-- M6  Over-limit approvers may DECLINE (the limit bounds yes, not no).
-- L6  Approving a cash refund needs the requester's open drawer — refused before the CAS.
--
-- Rollback at end.

set lock_timeout = '3s';

-- ============================================
-- Columns / indexes
-- ============================================
alter table public.approval_requests add column if not exists payload_hash text;
comment on column public.approval_requests.payload_hash is
  'sha256 of (kind, order, payload, reason, note, direct) as asked; a replayed idempotency key must match it.';

create index if not exists approval_requests_side_effects_due_idx
  on public.approval_requests (executed_at)
  where status = 'executed' and kind in ('refund', 'cancel_paid');

-- ============================================
-- New helpers
-- ============================================

-- The tender of an order paid by status only. The register keeps cash
-- tendered in customer_data.pos; with no name and no cash tendered the method
-- is unknown (NULL), which the allocation treats as cash.
create or replace function public.approval_implicit_method(p_method_name text, p_customer_data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p_method_name), ''),
    nullif(btrim(p_customer_data -> 'pos' ->> 'paymentMethod'), ''),
    nullif(btrim(p_customer_data ->> 'paymentMethod'), ''),
    case when (p_customer_data -> 'pos' ->> 'cashTendered') is not null then 'Cash' end
  )
$$;

-- M4: what the order charged per peso of its lines (total ÷ Σ line net).
-- 1 when the lines are worth nothing (nothing to scale).
create or replace function public.approval_order_line_ratio(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(g.gross, 0) <= 0 then 1 else o.total / g.gross end
    from public.orders o
    cross join lateral (
      select sum(greatest(i.subtotal - coalesce(i.discount_amount, 0), 0)) as gross
        from public.order_items i where i.order_id = o.id
    ) g
   where o.id = p_order_id
$$;

-- M4: `p_take` pieces of a line, at the order's real price, rounded to the centavo.
create or replace function public.approval_scaled_line_value(
  p_order_id uuid, p_subtotal numeric, p_discount numeric, p_quantity integer, p_take integer
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_quantity <= 0 or p_take <= 0 then 0
    else round(
      greatest(p_subtotal - coalesce(p_discount, 0), 0)
        * least(p_take, p_quantity)::numeric / p_quantity
        * coalesce(public.approval_order_line_ratio(p_order_id), 1),
      2)
  end
$$;

-- H2: refunds this person gave back DIRECTLY today (Asia/Manila), at this
-- store. Refunds paid out on someone else's approval are not "direct" and
-- don't count; refund rows written straight from the register do.
create or replace function public.approval_requester_direct_today(p_tenant_id uuid, p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(p.amount), 0)
    from public.order_payments p
   where p.tenant_id = p_tenant_id
     and p.recorded_by = p_user_id
     and p.kind = 'refund'
     and p.created_at >= public.store_activity_manila_day_start(now())
     and not exists (
       select 1
         from public.order_refunds f
         join public.approval_requests r on r.id = f.approval_id
        where f.tenant_id = p_tenant_id
          and p.id = any (f.payment_row_ids)
          and not r.is_direct
     )
$$;

-- What an order already gave back.
create or replace function public.approval_order_refunded(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(p.amount), 0) from public.order_payments p
   where p.order_id = p_order_id and p.kind = 'refund'
$$;

-- The ONE rule for "may this person refund this much on this order without
-- asking" — used by approval_direct_allowed (requests) and by the
-- order_payments refund guard (the register's own refund rows).
-- p_already = what the order already gave back.
create or replace function public.approval_refund_within_own_limit(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_amount numeric, p_order_created_at timestamptz, p_already numeric
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := public.approval_rules_effective(p_tenant_id);
  v_cap numeric := public.approval_approver_cap(p_tenant_id, p_user_id);
  v_total numeric := coalesce(p_already, 0) + p_amount;
begin
  if public.approval_user_is_owner(p_tenant_id, p_user_id) then
    return true;
  end if;
  -- An approver may refund directly what they could approve: the ORDER's
  -- refunds stay within their limit, however they are split.
  if v_cap is not null and v_cap >= 0 and v_total <= v_cap then
    return true;
  end if;
  if not public.approval_user_can(p_tenant_id, p_user_id, 'order_refund') then
    return false;
  end if;
  if p_kind = 'cancel_paid' and not public.approval_user_can(p_tenant_id, p_user_id, 'orders') then
    return false;
  end if;
  return v_total <= (v_rules ->> 'directRefundCap')::numeric
    and (
      (v_rules ->> 'staffRefundWindow') = 'any'
      or (p_order_created_at is not null
          and public.store_activity_manila_day_start(p_order_created_at) = public.store_activity_manila_day_start(now()))
    )
    and public.approval_requester_direct_today(p_tenant_id, p_user_id) + p_amount
        <= (v_rules ->> 'managerApproveCap')::numeric;
end;
$$;

-- H2: replaces the 6-argument version (now order-aware). Callers resolve the
-- new signature by name; 5/6-argument calls still work through the defaults.
drop function if exists public.approval_direct_allowed(uuid, uuid, text, numeric, timestamptz, numeric);
create or replace function public.approval_direct_allowed(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_amount numeric, p_order_created_at timestamptz,
  p_discount_pct numeric default null, p_order_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := public.approval_rules_effective(p_tenant_id);
  v_cap numeric := public.approval_approver_cap(p_tenant_id, p_user_id);
  v_order uuid := public.store_activity_try_uuid(p_order_id);
begin
  if public.approval_user_is_owner(p_tenant_id, p_user_id) then
    return true;
  end if;
  if p_kind in ('refund', 'cancel_paid') then
    return public.approval_refund_within_own_limit(
      p_tenant_id, p_user_id, p_kind, p_amount, p_order_created_at,
      case when v_order is null then 0 else public.approval_order_refunded(v_order) end);
  end if;
  if v_cap is not null and v_cap >= 0 and p_amount <= v_cap then
    return true;
  end if;
  if p_kind = 'discount' then
    return p_discount_pct is not null
      and p_discount_pct <= (v_rules ->> 'discountPctNeedsApproval')::numeric
      and (public.approval_user_can(p_tenant_id, p_user_id, 'pos') or public.approval_user_can(p_tenant_id, p_user_id, 'orders'));
  elsif p_kind = 'stock_writeoff' then
    return p_amount <= (v_rules ->> 'writeoffCostNeedsApproval')::numeric
      and public.approval_user_can(p_tenant_id, p_user_id, 'menu');
  end if;
  return false;
end;
$$;

-- ============================================
-- H1: every refund row is checked where it is written
-- ============================================
-- The check itself, SECURITY DEFINER (it must lock and read the order and
-- its ledger whatever the caller's RLS allows). It writes nothing: callable
-- directly it can only answer or refuse. p_is_client comes from the invoker
-- trigger below, which alone can see the role doing the INSERT.
create or replace function public.order_refund_insert_check(p_order_id uuid, p_amount numeric, p_is_client boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_rows integer;
  v_charged numeric;
  v_refunded numeric;
  v_actor uuid;
begin
  select o.id, o.tenant_id, o.total, o.payment_status, o.created_at
    into v_order
    from public.orders o where o.id = p_order_id
    for update;
  if not found then
    return; -- the foreign key refuses the row
  end if;

  select count(*),
         coalesce(sum(p.amount) filter (where p.kind = 'charge'), 0),
         coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0)
    into v_rows, v_charged, v_refunded
    from public.order_payments p where p.order_id = p_order_id;
  -- Same implicit-ledger rule as approval_order_ledger: paid by status, no rows.
  if v_rows = 0 and coalesce(v_order.payment_status, '') in ('paid', 'verified') then
    v_charged := v_order.total;
  end if;

  if v_refunded + p_amount > v_charged then
    raise exception 'This refund is more than was paid on this order.' using errcode = '23514';
  end if;

  if not coalesce(p_is_client, false) then
    return; -- the server (execute_refund, service role) has done its own checks
  end if;

  v_actor := auth.uid();
  if v_actor is null or not public.approval_refund_within_own_limit(
    v_order.tenant_id, v_actor, 'refund', p_amount, v_order.created_at, v_refunded
  ) then
    raise exception 'This refund needs approval. Ask a manager to approve it.' using errcode = '42501';
  end if;
end;
$$;

-- SECURITY INVOKER on purpose: current_user must be the role doing the INSERT
-- (same reason as Phase 0's stamp_client_actor). Runs between
-- order_payments_inherit_branch and order_payments_stamp_actor (name order).
create or replace function public.order_payments_refund_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.order_refund_insert_check(new.order_id, new.amount, current_user in ('anon', 'authenticated'));
  return new;
end;
$$;

drop trigger if exists order_payments_refund_guard on public.order_payments;
create trigger order_payments_refund_guard
  before insert on public.order_payments
  for each row
  when (new.kind = 'refund')
  execute function public.order_payments_refund_guard();

-- ============================================
-- M5: after-the-fact work that never reported back
-- ============================================
-- Claims executed refunds whose result.sideEffects is missing (older than 5
-- minutes) or stuck "running" (older than 15), marks them running, returns them.
create or replace function public.claim_approval_side_effects(p_tenant_id uuid default null, p_limit integer default 10)
returns setof public.approval_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.approvals_writer', 'on', true);
  return query
    update public.approval_requests r
       set result = coalesce(r.result, '{}'::jsonb)
                    || jsonb_build_object('sideEffects', jsonb_build_object('status', 'running', 'claimedAt', now())),
           updated_at = now()
     where r.id in (
       select x.id from public.approval_requests x
        where x.status = 'executed'
          and x.kind in ('refund', 'cancel_paid')
          and x.executed_at < now() - interval '5 minutes'
          and (p_tenant_id is null or x.tenant_id = p_tenant_id)
          and (
            x.result -> 'sideEffects' is null
            or (x.result -> 'sideEffects' ->> 'status' = 'running'
                and (x.result -> 'sideEffects' ->> 'claimedAt')::timestamptz < now() - interval '15 minutes')
          )
        order by x.executed_at
        limit greatest(1, least(coalesce(p_limit, 10), 100))
        for update skip locked
     )
    returning r.*;
end;
$$;

-- ============================================
-- Replaced functions (bodies as in 20261012160000, with the fixes marked)
-- ============================================

-- M3: implicit ledger tender (and unknown method = cash)

create or replace function public.approval_order_ledger(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_tenders jsonb;
  v_net numeric;
  v_rows integer;
begin
  select o.total, o.payment_status, o.payment_method_id, o.payment_method_name, o.customer_data
    into v_order
    from public.orders o where o.id = p_order_id;
  if not found then
    return null;
  end if;

  select count(*) into v_rows from public.order_payments p where p.order_id = p_order_id;

  if v_rows = 0 then
    if coalesce(v_order.payment_status, '') in ('paid', 'verified') and v_order.total > 0 then
      return jsonb_build_object(
        'implicit', true, 'net', v_order.total, 'charged', v_order.total, 'refunded', 0,
        'tenders', jsonb_build_array(jsonb_build_object(
          'methodId', v_order.payment_method_id,
          -- The register keeps cash tendered in customer_data.pos; a nameless
          -- sale with cash tendered was a cash sale (so the drawer rule applies).
          'methodName', public.approval_implicit_method(v_order.payment_method_name, v_order.customer_data),
          'net', v_order.total, 'lastChargeAt', null)));
    end if;
    return jsonb_build_object('implicit', false, 'net', 0, 'charged', 0, 'refunded', 0, 'tenders', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'methodId', t.method_id, 'methodName', nullif(t.method_name, ''),
           'net', t.charged - t.refunded, 'lastChargeAt', t.last_charge_at)
           order by t.last_charge_at desc nulls last), '[]'::jsonb),
         coalesce(sum(t.charged - t.refunded), 0)
    into v_tenders, v_net
    from (
      select coalesce(p.payment_method_name, '') as method_name,
             (array_agg(p.payment_method_id order by p.created_at desc) filter (where p.kind = 'charge'))[1] as method_id,
             coalesce(sum(p.amount) filter (where p.kind = 'charge'), 0) as charged,
             coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0) as refunded,
             max(p.created_at) filter (where p.kind = 'charge') as last_charge_at
        from public.order_payments p
       where p.order_id = p_order_id
       group by 1
    ) t;

  return jsonb_build_object(
    'implicit', false, 'net', v_net,
    'charged', (select coalesce(sum(amount), 0) from public.order_payments where order_id = p_order_id and kind = 'charge'),
    'refunded', (select coalesce(sum(amount), 0) from public.order_payments where order_id = p_order_id and kind = 'refund'),
    'tenders', v_tenders);
end;
$$;

create or replace function public.approval_refund_allocation(p_ledger jsonb, p_amount numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_left numeric := round(p_amount, 2);
  v_take numeric;
  v_tender jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_ledger is null or v_left <= 0 then
    return '[]'::jsonb;
  end if;
  for v_tender in select value from jsonb_array_elements(coalesce(p_ledger -> 'tenders', '[]'::jsonb)) loop
    exit when v_left <= 0;
    v_take := least(v_left, round(coalesce((v_tender ->> 'net')::numeric, 0), 2));
    if v_take > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'methodId', v_tender -> 'methodId',
        'methodName', v_tender ->> 'methodName',
        'amount', v_take,
        -- An unknown method could have been cash: treat it as cash so the
        -- requester's open drawer is required (it is the safer mistake).
        'isCash', nullif(btrim(coalesce(v_tender ->> 'methodName', '')), '') is null
                  or (v_tender ->> 'methodName') ~* '\mcash\M'));
      v_left := v_left - v_take;
    end if;
  end loop;
  if v_left > 0 then
    return '[]'::jsonb;
  end if;
  return v_out;
end;
$$;

-- M4: line values scaled to what the order really charged

create or replace function public.approval_order_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId', o.id,
    'orderNumber', public.store_activity_order_label(o.daily_number, o.id::text),
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentMethodName', o.payment_method_name,
    'source', o.source,
    'orderType', o.order_type,
    'total', o.total,
    'revisionNumber', o.revision_number,
    'createdAt', o.created_at,
    'outletId', o.outlet_id,
    'ledger', public.approval_order_ledger(o.id),
    'lineRatio', public.approval_order_line_ratio(o.id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'name', i.menu_item_name, 'menuItemId', i.menu_item_id,
               'quantity', i.quantity,
               'lineTotal', public.approval_scaled_line_value(o.id, i.subtotal, i.discount_amount, i.quantity, i.quantity))
               order by i.menu_item_name, i.id), '[]'::jsonb)
        from public.order_items i where i.order_id = o.id))
  from public.orders o
  where o.id = p_order_id
$$;

-- M1 / M4 / H2 facts

create or replace function public.approval_quote(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_external_order_id text, p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ledger jsonb;
  v_net numeric;
  v_amount numeric;
  v_scope text;
  v_line jsonb;
  v_item public.order_items%rowtype;
  v_qty integer;
  v_seen uuid[] := '{}'::uuid[];
  v_remaining integer;
  v_alloc jsonb;
  v_cash boolean;
  v_shift uuid;
  v_inv record;
  v_wo_qty numeric;
  v_outlet uuid;
begin
  if p_kind = 'stock_writeoff' then
    begin
      v_wo_qty := (p_payload ->> 'quantity')::numeric;
    exception when others then
      return public.approval_refusal('invalid_payload', 'Enter how much to write off.');
    end;
    if v_wo_qty is null or v_wo_qty <= 0 or v_wo_qty > 100000 then
      return public.approval_refusal('invalid_payload', 'Enter how much to write off.');
    end if;
    select i.id, i.name, i.unit_cost, coalesce(nullif(u.abbreviation, ''), u.name) as unit
      into v_inv
      from public.inventory_items i
      left join public.inventory_units u on u.id = i.stock_unit_id
     where i.id = public.store_activity_try_uuid(p_payload ->> 'inventoryItemId') and i.tenant_id = p_tenant_id;
    if not found then
      return public.approval_refusal('not_found', 'That ingredient is not in this store.');
    end if;
    v_outlet := public.store_activity_try_uuid(p_payload ->> 'outletId');
    if v_outlet is not null and not exists (select 1 from public.outlets o where o.id = v_outlet and o.tenant_id = p_tenant_id) then
      return public.approval_refusal('not_found', 'That branch is not in this store.');
    end if;
    return jsonb_build_object(
      'ok', true,
      'amount', round(v_wo_qty * coalesce(v_inv.unit_cost, 0), 2),
      'outletId', v_outlet,
      'orderNumber', null,
      'orderCreatedAt', null,
      'snapshot', jsonb_build_object('ingredientName', v_inv.name, 'unit', v_inv.unit,
                                     'unitCost', v_inv.unit_cost, 'quantity', v_wo_qty),
      'allocation', '[]'::jsonb, 'cashInvolved', false, 'requesterShiftId', null,
      -- No cost on file = no way to know what is being written off: never direct.
      'costUnknown', coalesce(v_inv.unit_cost, 0) <= 0);
  end if;

  select * into v_order from public.orders o
   where o.id = public.store_activity_try_uuid(p_external_order_id) and o.tenant_id = p_tenant_id;
  if not found then
    return public.approval_refusal('order_not_found', 'That order is not in this store.');
  end if;

  v_ledger := public.approval_order_ledger(v_order.id);
  v_net := coalesce((v_ledger ->> 'net')::numeric, 0);

  if p_kind = 'discount' then
    begin
      v_amount := round((p_payload ->> 'amountOff')::numeric, 2);
    exception when others then
      return public.approval_refusal('invalid_payload', 'Enter the discount.');
    end;
    if v_amount is null or v_amount <= 0 or v_amount > v_order.total then
      return public.approval_refusal('invalid_payload', 'The discount must be more than ₱0 and no more than the order total.');
    end if;
    if v_order.status = 'cancelled' then
      return public.approval_refusal('order_cancelled', 'This order was cancelled.');
    end if;
    return jsonb_build_object('ok', true, 'amount', v_amount, 'outletId', v_order.outlet_id,
      -- The percent is the database's arithmetic, never the client's claim.
      'pct', round(v_amount / nullif(v_order.total, 0) * 100, 2),
      'orderNumber', public.store_activity_order_label(v_order.daily_number, v_order.id::text),
      'orderCreatedAt', v_order.created_at, 'snapshot', public.approval_order_snapshot(v_order.id),
      'allocation', '[]'::jsonb, 'cashInvolved', false, 'requesterShiftId', null);
  end if;

  if p_kind not in ('refund', 'cancel_paid') then
    return public.approval_refusal('invalid_payload', 'Unknown request kind.');
  end if;

  v_scope := case when p_kind = 'cancel_paid' then 'whole' else coalesce(p_payload ->> 'scope', '') end;

  if v_net <= 0 then
    return public.approval_refusal('nothing_to_refund', 'Nothing was paid on this order, so there is nothing to give back.');
  end if;
  if v_scope in ('items', 'amount') and v_order.status = 'cancelled' then
    return public.approval_refusal('order_cancelled', 'This order was cancelled. Refund the whole order instead.');
  end if;

  if v_scope = 'whole' then
    v_amount := v_net;
  elsif v_scope = 'amount' then
    begin
      v_amount := round((p_payload ->> 'amount')::numeric, 2);
    exception when others then
      return public.approval_refusal('invalid_payload', 'Enter the amount to give back.');
    end;
    if v_amount is null or v_amount <= 0 then
      return public.approval_refusal('invalid_payload', 'Enter the amount to give back.');
    end if;
  elsif v_scope = 'items' then
    if jsonb_typeof(p_payload -> 'lines') <> 'array' or jsonb_array_length(p_payload -> 'lines') = 0 then
      return public.approval_refusal('invalid_lines', 'Pick the items to refund.');
    end if;
    v_amount := 0;
    for v_line in select value from jsonb_array_elements(p_payload -> 'lines') loop
      select * into v_item from public.order_items i
       where i.id = public.store_activity_try_uuid(v_line ->> 'orderItemId') and i.order_id = v_order.id;
      begin
        v_qty := (v_line ->> 'quantity')::integer;
      exception when others then
        v_qty := null;
      end;
      if v_item.id is null or v_qty is null or v_qty <= 0 or v_qty > v_item.quantity or v_item.id = any (v_seen) then
        return public.approval_refusal('invalid_lines', 'One of the items is no longer on this order. Reopen it and try again.');
      end if;
      v_seen := v_seen || v_item.id;
      v_amount := v_amount + public.approval_scaled_line_value(v_order.id, v_item.subtotal, v_item.discount_amount, v_item.quantity, v_qty);
    end loop;
    -- Taking every piece of every line is a whole-order refund (an order is
    -- never emptied by editing; it is cancelled).
    select coalesce(sum(i.quantity), 0) into v_remaining from public.order_items i where i.order_id = v_order.id;
    if v_remaining <= (
      select coalesce(sum((l ->> 'quantity')::integer), 0) from jsonb_array_elements(p_payload -> 'lines') l
    ) then
      return public.approval_refusal('empty_order', 'That is every item on the order. Choose "Whole order" instead.');
    end if;
    if v_amount <= 0 then
      return public.approval_refusal('invalid_lines', 'Those items were free, so there is nothing to refund.');
    end if;
  else
    return public.approval_refusal('invalid_payload', 'Choose items, an amount or the whole order.');
  end if;

  if v_amount > v_net then
    return public.approval_refusal('over_refund',
      'That is more than was paid on this order (' || public.store_activity_peso(v_net) || ' can still be refunded).');
  end if;

  v_alloc := public.approval_refund_allocation(v_ledger, v_amount);
  if jsonb_array_length(v_alloc) = 0 then
    return public.approval_refusal('over_refund', 'The payments on this order cannot cover that refund.');
  end if;
  select coalesce(bool_or((a ->> 'isCash')::boolean), false) into v_cash from jsonb_array_elements(v_alloc) a;
  v_shift := public.approval_open_shift(p_tenant_id, p_user_id, v_order.outlet_id);

  return jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'scope', v_scope,
    'outletId', v_order.outlet_id,
    'orderNumber', public.store_activity_order_label(v_order.daily_number, v_order.id::text),
    'orderCreatedAt', v_order.created_at,
    'snapshot', public.approval_order_snapshot(v_order.id),
    'allocation', v_alloc,
    'cashInvolved', v_cash,
    'requesterShiftId', v_shift,
    -- For the direct-limit rules (H2): what this order already gave back, and
    -- what this person already refunded directly today.
    'orderRefunded', coalesce((v_ledger ->> 'refunded')::numeric, 0),
    'requesterDirectToday', public.approval_requester_direct_today(p_tenant_id, p_user_id));
end;
$$;

-- H2 / H3 / M1 / M2

create or replace function public.create_approval_request(
  p_tenant_id uuid,
  p_user_id uuid,
  p_kind text,
  p_external_order_id text,
  p_payload jsonb,
  p_reason_code text,
  p_note text,
  p_idempotency_key text,
  p_direct boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.approval_requests%rowtype;
  v_quote jsonb;
  v_rules jsonb := public.approval_rules_effective(p_tenant_id);
  v_amount numeric;
  v_pending integer;
  v_req public.approval_requests%rowtype;
  v_pct numeric;
  v_payload jsonb;
  v_hash text;
begin
  -- What the request asks for, hashed: a replayed key must ask for the same thing.
  v_hash := encode(sha256(convert_to(jsonb_build_array(
    p_kind, p_external_order_id, coalesce(p_payload, '{}'::jsonb), btrim(coalesce(p_reason_code, '')),
    coalesce(btrim(p_note), ''), p_direct)::text, 'UTF8')), 'hex');

  -- Replay of the same tap: hand back what it made.
  select * into v_existing from public.approval_requests r
   where r.tenant_id = p_tenant_id and r.requested_by = p_user_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payload_hash is not null and v_existing.payload_hash <> v_hash then
      return public.approval_refusal('idempotency_conflict',
        'This request was already sent with different details. Close the sheet and start again.');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'request', to_jsonb(v_existing));
  end if;

  -- H3: the register does not redeem discount tokens yet, so an approval would
  -- authorise nothing. Refused until it does.
  if p_kind = 'discount' then
    return public.approval_refusal('not_supported', 'Discount approvals are coming soon.');
  end if;

  if not public.approval_may_request(p_tenant_id, p_user_id, p_kind) then
    return public.approval_refusal('forbidden', 'Your account cannot ask for this. Ask the owner to give you register access.');
  end if;
  if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
    return public.approval_refusal('reason_required', 'Pick a reason first.');
  end if;
  -- Client-fixable inputs answer with a refusal, never a raised CHECK.
  if length(btrim(p_reason_code)) > 64 or length(coalesce(p_note, '')) > 500
     or length(coalesce(p_idempotency_key, '')) not between 8 and 128
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    return public.approval_refusal('invalid_payload', 'Something in that request is too long or malformed.');
  end if;
  -- Normalised once here, so execution never casts client text.
  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
         'restock', coalesce(p_payload ->> 'restock', 'false') in ('true', 't', '1'),
         'reasonLabel', left(coalesce(nullif(btrim(p_payload ->> 'reasonLabel'), ''), btrim(p_reason_code)), 200));

  v_quote := public.approval_quote(p_tenant_id, p_user_id, p_kind, p_external_order_id, coalesce(p_payload, '{}'::jsonb));
  if not coalesce((v_quote ->> 'ok')::boolean, false) then
    return v_quote;
  end if;
  v_amount := (v_quote ->> 'amount')::numeric;

  if coalesce((v_quote ->> 'cashInvolved')::boolean, false) and (v_quote ->> 'requesterShiftId') is null then
    return public.approval_refusal('no_open_shift',
      'Part of this refund is cash, and you have no open drawer at this branch. Open your shift first, so the cash comes out of your drawer.');
  end if;

  if p_kind = 'discount' then
    v_pct := (v_quote ->> 'pct')::numeric;
  end if;

  -- 3. A branch-locked account acts only on its own branch's orders / stock.
  if not public.approval_user_reaches(p_tenant_id, p_user_id, (v_quote ->> 'outletId')::uuid) then
    return public.approval_refusal('forbidden', 'That belongs to another branch.');
  end if;

  if p_direct and coalesce((v_quote ->> 'costUnknown')::boolean, false) then
    return public.approval_refusal('cost_unknown',
      'This ingredient has no cost on file, so writing it off needs approval.');
  end if;

  if p_direct and not public.approval_direct_allowed(
    p_tenant_id, p_user_id, p_kind, v_amount, (v_quote ->> 'orderCreatedAt')::timestamptz, v_pct, p_external_order_id
  ) then
    return public.approval_refusal('direct_not_allowed', 'This needs approval. Send it for approval instead.');
  end if;

  if not p_direct then
    select count(*) into v_pending from public.approval_requests r
     where r.tenant_id = p_tenant_id and r.requested_by = p_user_id and r.status = 'pending' and r.expires_at > now();
    if v_pending >= (v_rules ->> 'maxPendingPerStaff')::integer then
      return public.approval_refusal('too_many_pending',
        'You already have ' || v_pending || ' requests waiting. Wait for an answer or withdraw one.');
    end if;
  end if;

  perform set_config('app.approvals_writer', 'on', true);
  begin
    insert into public.approval_requests (
      tenant_id, outlet_id, kind, status, is_direct, backend, external_order_id, order_number,
      payload, amount, reason_code, note, order_snapshot, requested_by, requested_by_name,
      requester_shift_id, decided_by, decided_by_name, decided_at, expires_at, idempotency_key, payload_hash
    ) values (
      p_tenant_id, (v_quote ->> 'outletId')::uuid, p_kind,
      case when p_direct then 'approved' else 'pending' end, p_direct, 'platform',
      case when p_kind = 'stock_writeoff' then null else p_external_order_id end,
      v_quote ->> 'orderNumber',
      v_payload || jsonb_strip_nulls(jsonb_build_object('scope', v_quote ->> 'scope',
        'allocation', v_quote -> 'allocation', 'pct', v_quote -> 'pct')),
      v_amount, btrim(p_reason_code), nullif(btrim(coalesce(p_note, '')), ''), v_quote -> 'snapshot',
      p_user_id, public.store_activity_actor_name(p_user_id),
      (v_quote ->> 'requesterShiftId')::uuid,
      case when p_direct then p_user_id end,
      case when p_direct then public.store_activity_actor_name(p_user_id) end,
      case when p_direct then now() end,
      now() + make_interval(mins => (v_rules ->> 'expiryMinutes')::integer),
      p_idempotency_key, v_hash
    )
    returning * into v_req;
  exception when unique_violation then
    -- Either this exact tap (raced) or another open request on the order.
    select * into v_existing from public.approval_requests r
     where r.tenant_id = p_tenant_id and r.requested_by = p_user_id and r.idempotency_key = p_idempotency_key;
    if found then
      if v_existing.payload_hash is not null and v_existing.payload_hash <> v_hash then
        return public.approval_refusal('idempotency_conflict',
          'This request was already sent with different details. Close the sheet and start again.');
      end if;
      return jsonb_build_object('ok', true, 'replayed', true, 'request', to_jsonb(v_existing));
    end if;
    select * into v_existing from public.approval_requests r
     where r.tenant_id = p_tenant_id and r.backend = 'platform' and r.external_order_id = p_external_order_id
       and r.kind = p_kind and r.status in ('pending', 'approved', 'executing')
     limit 1;
    return public.approval_refusal('already_open',
      coalesce(v_existing.requested_by_name, 'Someone') || ' already asked about this order. Wait for that answer.')
      || jsonb_build_object('requestId', v_existing.id);
  end;

  if not p_direct then
    perform public.approvals_activity_for(v_req, 'approval.requested', p_user_id);
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'request', to_jsonb(v_req));
end;
$$;

-- M6 / L6

create or replace function public.transition_approval(
  p_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_to text,
  p_reason_code text default null,
  p_note text default null,
  p_approved_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_cap numeric;
  v_amount numeric;
  v_is_owner boolean := public.approval_user_is_owner(p_tenant_id, p_actor);
begin
  perform public.expire_approval_requests(p_tenant_id, 50);

  select * into v_req from public.approval_requests r
   where r.id = p_id and r.tenant_id = p_tenant_id
   for update;
  if not found then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  -- The sweep above is bounded; the row in hand is checked itself.
  if v_req.status = 'pending' and v_req.expires_at <= now() then
    perform set_config('app.approvals_writer', 'on', true);
    update public.approval_requests set status = 'expired', updated_at = now()
     where id = v_req.id returning * into v_req;
    perform public.approvals_activity_for(v_req, 'approval.expired', null);
  end if;
  if v_req.status <> 'pending' then
    return public.approval_refusal(
      case v_req.status when 'expired' then 'expired' when 'withdrawn' then 'withdrawn' else 'not_pending' end,
      case v_req.status
        when 'expired' then 'This request expired.'
        when 'withdrawn' then coalesce(v_req.requested_by_name, 'The requester') || ' withdrew this request.'
        else 'That request was already answered by ' || coalesce(v_req.decided_by_name, 'someone') || '.'
      end) || jsonb_build_object('request', to_jsonb(v_req));
  end if;

  if p_to = 'withdrawn' then
    if p_actor <> v_req.requested_by then
      return public.approval_refusal('not_requester', 'Only the person who asked can withdraw this request.');
    end if;
    perform set_config('app.approvals_writer', 'on', true);
    update public.approval_requests set status = 'withdrawn', updated_at = now()
     where id = v_req.id returning * into v_req;
    perform public.approvals_activity_for(v_req, 'approval.withdrawn', p_actor);
    return jsonb_build_object('ok', true, 'request', to_jsonb(v_req));
  end if;

  if p_to not in ('approved', 'declined') then
    return public.approval_refusal('invalid_transition', 'Unknown decision.');
  end if;

  -- Two names on every money decision: never your own, unless you own the store.
  if p_actor = v_req.requested_by and not v_is_owner then
    return public.approval_refusal('self_approval', 'You cannot answer your own request.');
  end if;
  if not public.approval_user_reaches(p_tenant_id, p_actor, v_req.outlet_id) then
    return public.approval_refusal('not_approver', 'This request is for another branch.');
  end if;
  v_cap := public.approval_approver_cap(p_tenant_id, p_actor);
  if v_cap is not null and v_cap < 0 then
    return public.approval_refusal('not_approver', 'Your account cannot answer requests. Ask the owner for "Approve requests".');
  end if;

  if p_to = 'declined' then
    if nullif(btrim(coalesce(p_reason_code, '')), '') is null then
      return public.approval_refusal('reason_required', 'Pick a reason so they know what to do next.');
    end if;
  end if;

  v_amount := coalesce(p_approved_amount, v_req.amount);
  if p_to = 'approved' and p_approved_amount is not null then
    if v_req.kind <> 'refund' or coalesce(v_req.payload ->> 'scope', '') <> 'amount' then
      return public.approval_refusal('amount_override_not_allowed', 'Only an amount refund can be approved for less.');
    end if;
    if round(p_approved_amount, 2) <= 0 or round(p_approved_amount, 2) > v_req.amount then
      return public.approval_refusal('amount_override_too_high', 'Approve between ₱0.01 and the amount asked.');
    end if;
  end if;
  -- M6: the limit bounds what you may say YES to; anyone who may answer
  -- requests may say no (the owner still sees it in the feed).
  if p_to = 'approved' and v_cap is not null and v_amount > v_cap then
    return public.approval_refusal('over_limit',
      'Over your ' || public.store_activity_peso(v_cap) || ' limit. The owner has been asked.');
  end if;

  -- L6: a cash refund comes out of the REQUESTER's drawer; refuse before the
  -- CAS while they have none open, instead of approving into a failure.
  if p_to = 'approved' and v_req.kind in ('refund', 'cancel_paid')
     and public.approval_open_shift(v_req.tenant_id, v_req.requested_by, v_req.outlet_id) is null
     and exists (
       select 1 from jsonb_array_elements(public.approval_refund_allocation(
         public.approval_order_ledger(public.store_activity_try_uuid(v_req.external_order_id)), v_amount)) a
        where (a ->> 'isCash')::boolean
     ) then
    return public.approval_refusal('no_open_shift',
      coalesce(v_req.requested_by_name, 'They') || ' has no open drawer, and part of this refund is cash. Ask them to open their drawer first.');
  end if;

  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests
     set status = p_to,
         decided_by = p_actor,
         decided_by_name = public.store_activity_actor_name(p_actor),
         decided_at = now(),
         decision_reason_code = nullif(btrim(coalesce(p_reason_code, '')), ''),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         approved_amount = case when p_to = 'approved' and p_approved_amount is not null then round(p_approved_amount, 2) end,
         updated_at = now()
   where id = v_req.id and status = 'pending'
   returning * into v_req;
  if not found then
    return public.approval_refusal('not_pending', 'That request was already answered.');
  end if;

  perform public.approvals_activity_for(v_req,
    case when p_to = 'approved' then 'approval.approved' else 'approval.declined' end, p_actor);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req));
end;
$$;

-- M4 (same scaled line values as the quote)

create or replace function public.execute_refund(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_ledger jsonb;
  v_net numeric;
  v_amount numeric;
  v_scope text;
  v_alloc jsonb;
  v_a jsonb;
  v_cash boolean;
  v_refund_id uuid := gen_random_uuid();
  v_revision_id uuid;
  v_opening_id uuid;
  v_payment_ids uuid[] := '{}'::uuid[];
  v_payment_id uuid;
  v_number integer;
  v_label text;
  v_line jsonb;
  v_item public.order_items%rowtype;
  v_qty integer;
  v_lines jsonb := '[]'::jsonb;
  v_lines_value numeric := 0;
  v_items_before jsonb;
  v_items_after jsonb;
  v_total_after numeric;
  v_cancel boolean;
  v_status_changed boolean := false;
  v_vouchers integer := 0;
  v_method text;
  v_restock boolean;
  v_reason_label text;
  v_cashier uuid;
  v_result jsonb;
  v_code text;
  v_message text;
begin
  select * into v_req from public.approval_requests r where r.id = p_approval_id for update;
  if not found then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  if v_req.status in ('executed', 'failed') then
    return jsonb_build_object('ok', v_req.status = 'executed', 'request', to_jsonb(v_req), 'replayed', true);
  end if;
  if v_req.status <> 'approved' or v_req.kind not in ('refund', 'cancel_paid') then
    return public.approval_refusal('not_approved', 'This request is not approved.');
  end if;

  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests set status = 'executing', updated_at = now()
   where id = v_req.id returning * into v_req;

  -- Activity triggers fired by the writes below (voucher.released, order.*)
  -- name the CASHIER who asked, not "System".
  perform set_config('app.actor_user_id', v_req.requested_by::text, true);

  v_snapshot := coalesce(v_req.order_snapshot, '{}'::jsonb);
  v_scope := case when v_req.kind = 'cancel_paid' then 'whole' else coalesce(v_req.payload ->> 'scope', 'amount') end;
  v_amount := coalesce(v_req.approved_amount, v_req.amount);
  v_restock := coalesce(v_req.payload ->> 'restock', 'false') = 'true';
  v_reason_label := coalesce(v_req.payload ->> 'reasonLabel', v_req.reason_code);
  v_cancel := v_scope = 'whole';

  begin
    select * into v_order from public.orders o
     where o.id = public.store_activity_try_uuid(v_req.external_order_id) and o.tenant_id = v_req.tenant_id
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'order_not_found',
        detail = 'The order was deleted since it was asked about. Nothing was refunded.';
    end if;

    -- The order must be what the approver saw.
    if v_order.revision_number is distinct from (v_snapshot ->> 'revisionNumber')::integer
       or v_order.total is distinct from (v_snapshot ->> 'total')::numeric then
      raise exception using errcode = 'P0001', message = 'order_changed',
        detail = 'The order changed since it was asked about. Nothing was refunded.';
    end if;
    if v_scope in ('items', 'amount') and v_order.status = 'cancelled' then
      raise exception using errcode = 'P0001', message = 'order_changed',
        detail = 'The order was cancelled since it was asked about. Nothing was refunded.';
    end if;

    v_ledger := public.approval_order_ledger(v_order.id);
    v_net := coalesce((v_ledger ->> 'net')::numeric, 0);
    if v_scope = 'whole' and v_net is distinct from ((v_snapshot -> 'ledger') ->> 'net')::numeric then
      raise exception using errcode = 'P0001', message = 'order_changed',
        detail = 'A payment on this order changed since it was asked about. Nothing was refunded.';
    end if;
    if v_amount <= 0 or v_amount > v_net then
      raise exception using errcode = 'P0001', message = 'over_refund',
        detail = 'That is more than is left to refund on this order. Nothing was refunded.';
    end if;

    v_alloc := public.approval_refund_allocation(v_ledger, v_amount);
    if jsonb_array_length(v_alloc) = 0 then
      raise exception using errcode = 'P0001', message = 'over_refund',
        detail = 'The payments on this order cannot cover that refund. Nothing was refunded.';
    end if;
    select coalesce(bool_or((a ->> 'isCash')::boolean), false) into v_cash from jsonb_array_elements(v_alloc) a;
    if v_cash and public.approval_open_shift(v_req.tenant_id, v_req.requested_by, v_order.outlet_id) is null then
      raise exception using errcode = 'P0001', message = 'no_open_shift',
        detail = coalesce(v_req.requested_by_name, 'The cashier') || ' has no open drawer at this branch, so the cash cannot come out of it. Nothing was refunded.';
    end if;

    -- Items: re-price the lines from what is stored now (same revision).
    if v_scope = 'items' then
      for v_line in select value from jsonb_array_elements(coalesce(v_req.payload -> 'lines', '[]'::jsonb)) loop
        select * into v_item from public.order_items i
         where i.id = public.store_activity_try_uuid(v_line ->> 'orderItemId') and i.order_id = v_order.id
         for update;
        v_qty := (v_line ->> 'quantity')::integer;
        if v_item.id is null or v_qty is null or v_qty <= 0 or v_qty > v_item.quantity then
          raise exception using errcode = 'P0001', message = 'order_changed',
            detail = 'An item on this order changed since it was asked about. Nothing was refunded.';
        end if;
        v_lines_value := v_lines_value + public.approval_scaled_line_value(v_order.id, v_item.subtotal, v_item.discount_amount, v_item.quantity, v_qty);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'orderItemId', v_item.id, 'menuItemId', v_item.menu_item_id, 'name', v_item.menu_item_name,
          'quantity', v_qty,
          'amount', public.approval_scaled_line_value(v_order.id, v_item.subtotal, v_item.discount_amount, v_item.quantity, v_qty)));
        end loop;
      if abs(v_lines_value - v_req.amount) > 0.01 then
        raise exception using errcode = 'P0001', message = 'order_changed',
          detail = 'The prices on this order changed since it was asked about. Nothing was refunded.';
      end if;
    elsif v_scope = 'whole' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'orderItemId', i.id, 'menuItemId', i.menu_item_id, 'name', i.menu_item_name, 'quantity', i.quantity,
               'amount', public.approval_scaled_line_value(v_order.id, i.subtotal, i.discount_amount, i.quantity, i.quantity))), '[]'::jsonb)
        into v_lines
        from public.order_items i where i.order_id = v_order.id;
    end if;

    -- R-number.
    insert into public.order_refund_counters as c (tenant_id, last_number)
    values (v_req.tenant_id, 1)
    on conflict (tenant_id) do update set last_number = c.last_number + 1
    returning last_number into v_number;
    v_label := 'R-' || lpad(v_number::text, greatest(4, length(v_number::text)), '0');

    -- An order paid before the ledger existed gets its original payment
    -- written first (at the sale's time, by the cashier who rang it), so the
    -- refund nets against something and every drawer computation
    -- (webnegosyo-app/lib/shift-drawer.ts) still credits the original sale
    -- to the original shift.
    if coalesce((v_ledger ->> 'implicit')::boolean, false) then
      v_opening_id := gen_random_uuid();
      v_cashier := public.store_activity_try_uuid(v_order.customer_data -> 'pos' ->> 'cashierId');
    end if;

    for v_a in select value from jsonb_array_elements(v_alloc) loop
      v_payment_ids := v_payment_ids || gen_random_uuid();
    end loop;
    if v_scope in ('items', 'amount') then
      v_revision_id := gen_random_uuid();
    end if;
    select string_agg(distinct coalesce(a ->> 'methodName', 'Unrecorded method'), ' + ')
      into v_method from jsonb_array_elements(v_alloc) a;

    -- The refund record goes in FIRST: the activity trigger wrappers below
    -- recognise these payment / revision ids and stay quiet, because ONE
    -- refund.issued row (written further down) tells this story.
    insert into public.order_refunds (
      id, tenant_id, outlet_id, order_id, refund_number, scope, lines, amount, method,
      payment_row_ids, opening_payment_id, revision_id, approval_id, reason_code, reason, note,
      restock, cancelled_order, issued_by, issued_by_name, approved_by, approved_by_name
    ) values (
      v_refund_id, v_req.tenant_id, v_order.outlet_id, v_order.id::text, v_number, v_scope, v_lines, v_amount, v_method,
      v_payment_ids, v_opening_id, v_revision_id, v_req.id, v_req.reason_code, v_reason_label, v_req.note,
      v_restock, v_cancel and v_order.status <> 'cancelled',
      v_req.requested_by, v_req.requested_by_name,
      case when v_req.is_direct then null else v_req.decided_by end,
      case when v_req.is_direct then null else v_req.decided_by_name end
    );

    if v_opening_id is not null then
      insert into public.order_payments (
        id, tenant_id, order_id, kind, amount, payment_method_id, payment_method_name,
        recorded_by, outlet_id, note, created_at
      ) values (
        v_opening_id, v_order.tenant_id, v_order.id, 'charge', v_order.total,
        v_order.payment_method_id,
        coalesce(v_order.payment_method_name, (v_ledger -> 'tenders' -> 0 ->> 'methodName')),
        v_cashier, v_order.outlet_id,
        'Opening record: paid before the payment ledger (written with refund ' || v_label || ')',
        v_order.created_at
      );
    end if;

    -- The money: one refund row per tender, recorded_by = the CASHIER who
    -- asked (their drawer pays it out), never the approver.
    for v_a, v_payment_id in
      select a.value, ids.id
        from jsonb_array_elements(v_alloc) with ordinality a(value, n)
        join unnest(v_payment_ids) with ordinality ids(id, n) using (n)
    loop
      insert into public.order_payments (
        id, tenant_id, order_id, kind, amount, payment_method_id, payment_method_name,
        recorded_by, outlet_id, note, created_at
      ) values (
        v_payment_id, v_order.tenant_id, v_order.id, 'refund', (v_a ->> 'amount')::numeric,
        public.store_activity_try_uuid(v_a ->> 'methodId'), v_a ->> 'methodName',
        v_req.requested_by, v_order.outlet_id,
        'Refund ' || v_label || ' · ' || v_reason_label, now()
      );
    end loop;

    -- Items / amount: the bill shrinks by what went back, as a revision.
    if v_scope in ('items', 'amount') then
      v_items_before := public.approval_order_items_json(v_order.id);
      if v_scope = 'items' then
        for v_line in select value from jsonb_array_elements(v_lines) loop
          select * into v_item from public.order_items i where i.id = (v_line ->> 'orderItemId')::uuid;
          v_qty := (v_line ->> 'quantity')::integer;
          if v_qty >= v_item.quantity then
            delete from public.order_items where id = v_item.id;
          else
            update public.order_items
               set quantity = v_item.quantity - v_qty,
                   subtotal = round(v_item.subtotal * (v_item.quantity - v_qty) / v_item.quantity, 2),
                   discount_amount = round(v_item.discount_amount * (v_item.quantity - v_qty) / v_item.quantity, 2)
             where id = v_item.id;
          end if;
            end loop;
      end if;
      v_items_after := public.approval_order_items_json(v_order.id);
      v_total_after := greatest(round(v_order.total - v_amount, 2), 0);

      insert into public.order_revisions (
        id, tenant_id, order_id, revision_number, items_before, items_after,
        total_before, total_after, reason, revised_by, outlet_id, created_at
      ) values (
        v_revision_id, v_order.tenant_id, v_order.id, v_order.revision_number + 1, v_items_before, v_items_after,
        v_order.total, v_total_after, 'Refund ' || v_label || ' · ' || v_reason_label,
        v_req.requested_by, v_order.outlet_id, now()
      );

      update public.orders
         set total = v_total_after,
             revision_number = v_order.revision_number + 1,
             item_count = (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = v_order.id),
             edited_at = now(),
             edited_by = v_req.requested_by
       where id = v_order.id;
    end if;

    -- Whole / cancel paid: the order is cancelled and its vouchers come back.
    if v_cancel then
      if v_order.status <> 'cancelled' then
        -- Our own order.cancelled row, under the key the orders trigger would
        -- use (set_updated_at stamps now(), the transaction's time), so the
        -- trigger's ON CONFLICT drops its copy: this one names the approver
        -- and carries no paid_then_cancelled flag — the refund IS recorded.
        perform public.approvals_activity(
          p_tenant_id => v_order.tenant_id, p_kind => 'order.cancelled',
          p_event_key => 'orders:' || v_order.id || ':status:cancelled:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
          p_source_table => 'orders', p_source_id => v_order.id::text,
          p_outlet_id => v_order.outlet_id, p_actor_user_id => v_req.requested_by,
          p_approved_by => case when v_req.is_direct then null else v_req.decided_by end,
          p_amount => v_order.total, p_reason => v_reason_label, p_note => v_req.note,
          p_subject_type => 'order', p_subject_ref => v_order.id::text,
          p_order_number => public.store_activity_order_label(v_order.daily_number, v_order.id::text),
          p_external_order_id => v_order.id::text,
          p_before => jsonb_build_object('status', v_order.status),
          p_after => jsonb_build_object('status', 'cancelled'),
          p_summary => jsonb_strip_nulls(jsonb_build_object(
            'title', public.store_activity_order_label(v_order.daily_number, v_order.id::text) || ' cancelled',
            'refundNumber', v_label, 'amountRefunded', v_amount, 'approvalId', v_req.id,
            'customer', public.store_activity_mask_name(v_order.customer_name), 'source', v_order.source)),
          p_flags => case when public.store_activity_flag_repeat_cancels(v_order.tenant_id, v_req.requested_by, now())
                          then array['repeat_cancels'] else '{}'::text[] end);
        update public.orders
           set status = 'cancelled',
               cancel_reason = left(v_reason_label, 500)
         where id = v_order.id;
        v_status_changed := true;
      end if;
      v_vouchers := public.release_voucher_redemptions(v_order.tenant_id, v_order.id::text);
    end if;

    -- The one refund.issued row, with both names.
    perform public.approvals_activity(
      p_tenant_id => v_order.tenant_id, p_kind => 'refund.issued',
      p_event_key => 'order_refunds:' || v_refund_id,
      p_source_table => 'order_refunds', p_source_id => v_refund_id::text,
      p_outlet_id => v_order.outlet_id, p_actor_user_id => v_req.requested_by,
      p_approved_by => case when v_req.is_direct then null else v_req.decided_by end,
      p_amount => -v_amount, p_reason => v_reason_label, p_note => v_req.note,
      p_subject_type => 'order', p_subject_ref => v_order.id::text,
      p_order_number => public.store_activity_order_label(v_order.daily_number, v_order.id::text),
      p_external_order_id => v_order.id::text,
      p_before => jsonb_build_object('total', v_order.total, 'amountPaid', v_net),
      p_after => jsonb_build_object('total', coalesce(v_total_after, v_order.total), 'amountPaid', v_net - v_amount),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Refunded ' || public.store_activity_peso(v_amount) || ' on '
                 || public.store_activity_order_label(v_order.daily_number, v_order.id::text) || ' · ' || v_label,
        'refundNumber', v_label, 'scope', v_scope, 'paymentMethod', v_method,
        'approvalId', v_req.id, 'direct', v_req.is_direct, 'cancelled', v_status_changed,
        'lines', case when jsonb_array_length(v_lines) > 0 and v_scope = 'items' then v_lines end)),
      p_strict => true);

    v_result := jsonb_build_object(
      'refundId', v_refund_id, 'refundNumber', v_number, 'refundLabel', v_label,
      'amount', v_amount, 'scope', v_scope, 'paymentRowIds', to_jsonb(v_payment_ids),
      'openingPaymentId', v_opening_id, 'revisionId', v_revision_id,
      'revisionNumber', case when v_revision_id is not null then v_order.revision_number + 1 end,
      'statusChanged', v_status_changed, 'vouchersReleased', v_vouchers,
      'cashInvolved', v_cash, 'restock', v_restock, 'lines', v_lines, 'allocation', v_alloc);
  exception when others then
    get stacked diagnostics v_code = message_text, v_message = pg_exception_detail;
    if v_code not in ('order_not_found', 'order_changed', 'over_refund', 'no_open_shift') then
      raise warning 'execute_refund(%) failed: % (%)', p_approval_id, sqlerrm, sqlstate;
      v_message := 'Something went wrong while refunding. Nothing was refunded.';
      v_code := 'execution_error';
    end if;
    v_req := public.approval_finish(v_req, false, jsonb_build_object('code', v_code), v_message);
    return public.approval_refusal(v_code, v_message) || jsonb_build_object('request', to_jsonb(v_req));
  end;

  v_req := public.approval_finish(v_req, true, v_result, null);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'result', v_result);
end;
$$;

-- H3: hash-only discount tokens (requests are refused anyway until the register redeems them)

create or replace function public.execute_discount_approval(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
  v_result jsonb;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into v_req from public.approval_requests r where r.id = p_approval_id for update;
  if not found or v_req.kind <> 'discount' then
    return public.approval_refusal('not_found', 'This request could not be found.');
  end if;
  if v_req.status in ('executed', 'failed') then
    return jsonb_build_object('ok', v_req.status = 'executed', 'request', to_jsonb(v_req), 'replayed', true);
  end if;
  if v_req.status <> 'approved' then
    return public.approval_refusal('not_approved', 'This request is not approved.');
  end if;
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests set status = 'executing', updated_at = now()
   where id = v_req.id returning * into v_req;
  v_result := jsonb_build_object(
    -- Only the token's hash is kept; the token itself is returned once.
    'tokenSha256', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    'amountOff', coalesce(v_req.approved_amount, v_req.amount),
    'pct', v_req.payload -> 'pct',
    'orderId', v_req.external_order_id,
    'tokenExpiresAt', now() + interval '2 hours',
    'consumedAt', null);
  v_req := public.approval_finish(v_req, true, v_result, null);
  return jsonb_build_object('ok', true, 'request', to_jsonb(v_req), 'result', v_result || jsonb_build_object('discountToken', v_token));
end;
$$;

create or replace function public.consume_discount_approval(p_tenant_id uuid, p_order_id text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests%rowtype;
begin
  select * into v_req from public.approval_requests r
   where r.tenant_id = p_tenant_id and r.kind = 'discount' and r.status = 'executed'
     and r.external_order_id = p_order_id and r.result ->> 'tokenSha256' = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    return public.approval_refusal('not_found', 'That discount approval is not valid for this order.');
  end if;
  if (v_req.result ->> 'consumedAt') is not null then
    return public.approval_refusal('already_used', 'That discount approval was already used.');
  end if;
  if (v_req.result ->> 'tokenExpiresAt')::timestamptz < now() then
    return public.approval_refusal('expired', 'That discount approval expired. Ask again.');
  end if;
  perform set_config('app.approvals_writer', 'on', true);
  update public.approval_requests
     set result = result || jsonb_build_object('consumedAt', now()), updated_at = now()
   where id = v_req.id returning * into v_req;
  return jsonb_build_object('ok', true, 'amountOff', v_req.result -> 'amountOff', 'pct', v_req.result -> 'pct');
end;
$$;

-- M2: payload_hash never changes

create or replace function public.approval_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_identity constant text[] := array[
    'id', 'tenant_id', 'outlet_id', 'kind', 'is_direct', 'backend', 'external_order_id', 'order_number',
    'payload', 'amount', 'reason_code', 'note', 'order_snapshot', 'requested_by', 'requested_by_name',
    'requester_shift_id', 'expires_at', 'idempotency_key', 'payload_hash', 'created_at'
  ];
  v_col text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
      return old;
    end if;
    raise exception 'approval requests are never deleted' using errcode = '42501';
  end if;

  if coalesce(current_setting('app.approvals_writer', true), '') <> 'on' then
    raise exception 'approval requests change only through the approvals functions' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'approved') then
      raise exception 'a request starts pending (or approved, when acted on directly)' using errcode = '23514';
    end if;
    return new;
  end if;

  foreach v_col in array v_identity loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception 'approval request column % never changes', v_col using errcode = '42501';
    end if;
  end loop;

  -- Once decided, the decision itself is history.
  if old.status <> 'pending' then
    foreach v_col in array array['decided_by', 'decided_by_name', 'decided_at', 'decision_reason_code',
                                 'decision_note', 'approved_amount'] loop
      if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
        raise exception 'approval request column % never changes after the decision', v_col using errcode = '42501';
      end if;
    end loop;
  end if;

  if new.status is distinct from old.status then
    if not public.approval_transition_allowed(old.status, new.status) then
      raise exception 'approval request cannot move from % to %', old.status, new.status using errcode = '23514';
    end if;
    return new;
  end if;

  -- Same status: only the post-commit side-effect report on a finished row.
  if old.status in ('executed', 'failed')
     and (to_jsonb(new) - array['result', 'updated_at']) = (to_jsonb(old) - array['result', 'updated_at']) then
    return new;
  end if;
  raise exception 'approval request is not editable in status %', old.status using errcode = '42501';
end;
$$;

-- ============================================
-- Privileges
-- ============================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.approval_order_line_ratio(uuid)',
    'public.approval_scaled_line_value(uuid, numeric, numeric, integer, integer)',
    'public.approval_requester_direct_today(uuid, uuid)',
    'public.approval_order_refunded(uuid)',
    'public.approval_refund_within_own_limit(uuid, uuid, text, numeric, timestamptz, numeric)',
    'public.approval_direct_allowed(uuid, uuid, text, numeric, timestamptz, numeric, text)',
    'public.claim_approval_side_effects(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end;
$$;

revoke all on function public.approval_implicit_method(text, jsonb) from public, anon, authenticated;
revoke all on function public.order_payments_refund_guard() from public, anon, authenticated;
-- The invoker trigger runs AS the inserting staff member, so they must be able
-- to execute the check. It writes nothing and refuses or returns.
revoke all on function public.order_refund_insert_check(uuid, numeric, boolean) from public, anon;
grant execute on function public.order_refund_insert_check(uuid, numeric, boolean) to authenticated, service_role;

reset lock_timeout;

-- ============================================
-- Rollback (manual)
-- ============================================
-- drop trigger if exists order_payments_refund_guard on public.order_payments;
-- drop function if exists public.order_payments_refund_guard();
-- drop function if exists public.order_refund_insert_check(uuid, numeric, boolean);
-- drop function if exists public.claim_approval_side_effects(uuid, integer);
-- drop function if exists public.approval_direct_allowed(uuid, uuid, text, numeric, timestamptz, numeric, text);
-- then re-run the 20261012160000 definitions of approval_direct_allowed (6 args), approval_order_ledger,
-- approval_refund_allocation, approval_order_snapshot, approval_quote, create_approval_request,
-- transition_approval, execute_refund, execute_discount_approval, consume_discount_approval,
-- approval_requests_guard;
-- drop function if exists public.approval_refund_within_own_limit(uuid, uuid, text, numeric, timestamptz, numeric);
-- drop function if exists public.approval_order_refunded(uuid);
-- drop function if exists public.approval_requester_direct_today(uuid, uuid);
-- drop function if exists public.approval_scaled_line_value(uuid, numeric, numeric, integer, integer);
-- drop function if exists public.approval_order_line_ratio(uuid);
-- drop function if exists public.approval_implicit_method(text, jsonb);
-- drop index if exists public.approval_requests_side_effects_due_idx;
-- alter table public.approval_requests drop column if exists payload_hash;
