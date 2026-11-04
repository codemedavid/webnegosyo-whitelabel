-- ===========================================================================
-- Shift report per cashier (Loly's request 3, 2026-11-04): at the end of her
-- shift a cashier prints HER sales, with quantity and sales per item.
--
--   report_shift_sales(p_shift_id, p_scope default null)
--     'window'  : unchanged answer — the whole branch inside the shift's
--                 window (20261027121000). OWNER DECISION 2026-11-04: only a
--                 cash manager reaching the branch, or the holder when they
--                 also hold `reports`, may ask for it. A plain cashier → 42501.
--     'cashier' : the same figures over HER sales only (below), every item
--                 (≤ 500, `itemsTruncated`), the voids list, her drawer's cash
--                 block and the money she took on other people's bills.
--     omitted / NULL / blank : 'window' when the caller may read it, else
--                 'cashier'. App 1.0.16 (live) calls report_shift_sales(id)
--                 with no scope for End shift / Shift sales; a plain cashier
--                 must keep getting an answer (now HER sales — the cashier
--                 answer carries every key the 1.0.16 parser reads, plus
--                 `scope`), never 42501. Everyone who could read the window
--                 gets it key for key as before.
--   report_shift_nets(p_shift_ids uuid[])   net + orders per shift (cashier
--                 scope) for the "My shifts" list, ≤ 31 DISTINCT shifts per
--                 call; a shift longer than 2 days answers `too_long` without
--                 being added up (a cashier's shift is hours long; a list call
--                 must stay cheap whatever shift ids it is handed).
--
-- "Her sales" mirrors belongsToDrawer (webnegosyo-app/lib/shift-drawer.ts) and
-- its SQL twin cash.shift_expected (20261027130000): source = 'pos' exactly,
-- customer_data.pos.cashierId = the shift's staff_user_id (non-empty), the
-- order's branch (column, else customer_data.outlet_id) = the shift's (NULL =
-- unbranched), created in [opened_at, closed_at or now()). Cancelled ones are
-- kept — they print as VOIDS, never as sales (reporting.order_figures.is_live).
-- Verified live 2026-11-04: Loly's 23 closed shifts in 14 days, every POS
-- order in a window carries a cashierId, equal to staff_shifts.staff_user_id.
--
-- Later payments (the drawer rule credits a collection to whoever recorded
-- it): the SALES figures (orders, gross, discounts, net, PAID BY, items) are
-- the bills she rang in her shift, whoever took the money — the same model as
-- Reports, so Σ items = net and Σ PAID BY = collected. Money SHE recorded in
-- her window on bills she did not ring here (an earlier shift, a colleague's,
-- an online order) is reported apart as `otherCollections` and is already in
-- the CASH block, which is her drawer (expected = float + cash she took + pay
-- in − pay out − pickups: staff_shifts.expected_cash / shift_counts once
-- counted, else cash.shift_expected live). Nothing is counted twice.
--
-- ONE sales definition: reporting.payment_buckets / item_rollup become thin
-- wrappers over *_of(…, p_only uuid[]) whose bodies are the 20261027121000
-- ones plus "and (p_only is null or order_id = any(p_only))". NULL = every
-- order = exactly the old answer (tests/sql/run-shift-report-cashier.cjs
-- pins report_payments / report_sales_by_item / the window scope unchanged).
--
-- Blind count, cashier scope: money stays hidden while the shift is open, the
-- caller is not a cash manager, AND nothing has been counted yet — after
-- count_shift the expectation opens to her (shift_expectations_read,
-- preview_shift_close), so her report does too. The window scope keeps its
-- 20261027121000 rule unchanged.
--
-- Performance: as 20261027121000 — EXECUTE'd statements (custom plans),
-- orders by (tenant_id, created_at) inside the shift's window, children by
-- `order_id = any(array(...))`, windows ≤ 93 days in BOTH scopes (checked
-- before any read). A shift is hours long.
-- statement_timeout is deliberately NOT a function attribute (same call as
-- 20261027121000): `SET statement_timeout` on a function is accepted with
-- SECURITY DEFINER, but the timer is armed when the top-level statement
-- starts, so changing it inside the call does not bound that call. The bound
-- is the window caps above plus the calling role's own timeout (probed live
-- 2026-11-04: authenticated = 8s, authenticator = 8s, anon = 3s).
-- Live probes: `set local statement_timeout = '5s'`, one shift.
-- NOT APPLIED to the platform database by this branch.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- reporting.payment_buckets_of: bucketPayments() over the window's orders, or
-- only the given ones. Body = reporting.payment_buckets (20261027121000) with
-- the p_only filter on `live`.
-- ---------------------------------------------------------------------------
create or replace function reporting.payment_buckets_of(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean, p_only uuid[]
)
returns table (
  method_key text,
  method_id uuid,
  label text,
  cents bigint,
  orders bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  with live as (
    select
      f.order_id, f.placed_at, f.collected_cents, f.ledger_cents,
      f.method_id as own_id,
      nullif(reporting.trim_text(f.method_name), '') as own_name,
      reporting.method_key(f.method_id, f.method_name) as own_key
    from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
    where f.is_live
      and (p_only is null or f.order_id = any (p_only))
  ),
  ledger as (
    select
      o.order_id,
      p.payment_method_id,
      nullif(reporting.trim_text(p.payment_method_name), '') as name,
      p.payment_method_name as raw_name,
      p.created_at,
      reporting.cents(p.amount) * case when lower(reporting.trim_text(coalesce(p.kind, ''))) = 'refund' then -1 else 1 end as cents,
      o.own_id, o.own_name, o.own_key
    from live o
    join public.order_payments p on p.order_id = o.order_id
    where p.order_id = any (array(select l.order_id from live l))
  ),
  parts as (
    -- A ledger row with no method is the order's; so is one naming the
    -- order's method by id alone (paymentMethod()).
    select
      l.order_id,
      case
        when (l.payment_method_id is null and l.name is null) or (l.name is null and l.payment_method_id = l.own_id) then l.own_key
        else reporting.method_key(l.payment_method_id, l.raw_name)
      end as key,
      case
        when (l.payment_method_id is null and l.name is null) or (l.name is null and l.payment_method_id = l.own_id) then l.own_id
        else l.payment_method_id
      end as method_id,
      case
        when (l.payment_method_id is null and l.name is null) or (l.name is null and l.payment_method_id = l.own_id)
          then coalesce(l.own_name, 'Not recorded')
        else coalesce(l.name, 'Not recorded')
      end as label,
      l.created_at as at,
      l.cents
    from ledger l
    union all
    -- Settled beyond the ledger (paid online, handed over): the order's method.
    select o.order_id, o.own_key, o.own_id, coalesce(o.own_name, 'Not recorded'), o.placed_at, o.collected_cents - o.ledger_cents
    from live o
    where o.collected_cents - o.ledger_cents <> 0
  ),
  -- A name-only method joins the id whose parts carry that name, when exactly
  -- one id does in this window (nameAliases() in payment-buckets.ts).
  aliases as (
    select 'name:' || reporting.fold_name(p.label) as name_key, min(p.key) as id_key
    from parts p
    where p.key like 'id:%' and p.label <> 'Not recorded'
    group by 1
    having count(distinct p.key) = 1
  ),
  keyed as (
    select
      p.order_id,
      coalesce(a.id_key, p.key) as key,
      case when a.id_key is not null then substr(a.id_key, 4)::uuid else p.method_id end as method_id,
      p.label,
      p.at,
      p.cents
    from parts p
    left join aliases a on a.name_key = p.key
  ),
  slices as (
    select k.order_id, k.key
    from keyed k
    group by k.order_id, k.key
    having sum(k.cents) <> 0
  )
  select
    k.key,
    (array_agg(k.method_id) filter (where k.method_id is not null))[1],
    (array_agg(k.label order by (k.label <> 'Not recorded') desc, k.at desc, k.label collate "C"))[1],
    sum(k.cents)::bigint,
    count(distinct k.order_id)
  from keyed k
  join slices s on s.order_id = k.order_id and s.key = k.key
  group by k.key;
end;
$$;

create or replace function reporting.payment_buckets(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean
)
returns table (
  method_key text,
  method_id uuid,
  label text,
  cents bigint,
  orders bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query select * from reporting.payment_buckets_of(p_tenant, p_from, p_to, p_outlet, p_unassigned, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- reporting.item_rollup_of: rollupItems() over the window's live lines, or
-- only the given orders' (each order's lines are scaled to ITS total, so a
-- filter after line_figures is exact). Body = reporting.item_rollup
-- (20261027121000) with the p_only filter.
-- ---------------------------------------------------------------------------
create or replace function reporting.item_rollup_of(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean, p_only uuid[]
)
returns table (
  item_key text,
  menu_item_id uuid,
  label text,
  category_label text,
  orders bigint,
  quantity bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint,
  is_unrecorded boolean
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  with keyed as (
    select
      l.*,
      case
        when l.is_unrecorded then 'unrecorded'
        when l.menu_item_id is not null then 'id:' || l.menu_item_id::text
        else 'name:' || reporting.fold_name(l.name)
      end as k
    from reporting.line_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) l
    where p_only is null or l.order_id = any (p_only)
  )
  select
    k.k,
    (array_agg(k.menu_item_id) filter (where k.menu_item_id is not null))[1],
    (array_agg(k.name order by k.placed_at desc, k.name collate "C"))[1],
    (array_agg(k.category_name order by k.placed_at desc, k.category_name collate "C") filter (where k.category_name is not null))[1],
    count(distinct k.order_id),
    sum(k.quantity)::bigint,
    sum(k.gross_cents)::bigint,
    sum(k.discount_cents)::bigint,
    sum(k.net_cents)::bigint,
    bool_or(k.is_unrecorded)
  from keyed k
  group by k.k;
end;
$$;

create or replace function reporting.item_rollup(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean
)
returns table (
  item_key text,
  menu_item_id uuid,
  label text,
  category_label text,
  orders bigint,
  quantity bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint,
  is_unrecorded boolean
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query select * from reporting.item_rollup_of(p_tenant, p_from, p_to, p_outlet, p_unassigned, null);
end;
$$;

revoke all on function reporting.payment_buckets_of(uuid, timestamptz, timestamptz, uuid, boolean, uuid[]) from public, anon;
revoke all on function reporting.item_rollup_of(uuid, timestamptz, timestamptz, uuid, boolean, uuid[]) from public, anon;
grant execute on function reporting.payment_buckets_of(uuid, timestamptz, timestamptz, uuid, boolean, uuid[]) to authenticated, service_role;
grant execute on function reporting.item_rollup_of(uuid, timestamptz, timestamptz, uuid, boolean, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cash.cashier_order_ids: the orders one shift's holder rang in [opened_at,
-- p_to) — the drawer rule's sale test (belongsToDrawer / cash.shift_expected
-- `legacy`), cancelled ones INCLUDED (they are the voids). Internal.
-- ---------------------------------------------------------------------------
create or replace function cash.cashier_order_ids(p_shift public.staff_shifts, p_to timestamptz)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_ids uuid[];
begin
  execute $q$
    select coalesce(array_agg(o.id), '{}'::uuid[])
      from public.orders o
     where o.tenant_id = $1
       and o.created_at >= $2 and o.created_at < $3
       and o.source = 'pos'
       and $4 <> ''
       and cash.pos_cashier(o.customer_data) = $4
       and cash.order_outlet(o.outlet_id, o.customer_data) is not distinct from $5
  $q$ into v_ids
  using p_shift.tenant_id, p_shift.opened_at, p_to, coalesce(p_shift.staff_user_id::text, ''), p_shift.outlet_id::text;
  return v_ids;
end;
$fn$;

revoke all on function cash.cashier_order_ids(public.staff_shifts, timestamptz) from public, anon, authenticated;
grant execute on function cash.cashier_order_ids(public.staff_shifts, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- cash.cashier_sales: the §4 sales object over one holder's own sales in
-- [opened_at, p_to), plus every item (≤ 500), the voids and the money she
-- recorded on other bills. Figures come from reporting.order_figures over
-- the whole store's window narrowed to her order ids (the branch rule is in
-- cash.cashier_order_ids). Internal: report_shift_sales decides who may ask.
-- ---------------------------------------------------------------------------
create or replace function cash.cashier_sales(p_shift public.staff_shifts, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_ids uuid[] := cash.cashier_order_ids(p_shift, p_to);
  v_sales jsonb;
begin
  execute $q$
    with f as materialized (
      select x.* from reporting.order_figures($1, $2, $3, null, false) x where x.order_id = any ($4)
    ),
    o as (
      select o.id, o.daily_number, lower(reporting.trim_text(coalesce(o.status, ''))) as status_key
        from public.orders o
       where o.id = any ($4)
    ),
    r as (
      select f.*, cash.order_number_label(o.daily_number, f.order_id) as number,
             case
               when not f.is_live and o.status_key = 'refunded' then 'refunded'
               when not f.is_live then 'void'
               when f.unpaid_cents > 0 then 'unpaid'
               else 'paid'
             end as receipt_status
        from f join o on o.id = f.order_id
    ),
    types as (
      select cash.order_type_label(f.order_type) as label, count(*) as orders, sum(f.net_cents) as net
        from f where f.is_live group by 1
    ),
    channels as (
      select cash.sale_channel(f.source) as key, count(*) as orders, sum(f.net_cents) as net
        from f where f.is_live group by 1
    ),
    items as materialized (
      select * from reporting.item_rollup_of($1, $2, $3, null, false, $4)
    ),
    recent as (
      select * from r order by r.placed_at desc, r.order_id desc limit $5
    ),
    voided as (
      select * from r where not r.is_live order by r.placed_at, r.order_id limit $7
    ),
    -- Money she recorded in her window on bills that are not hers here
    -- (the drawer rule's ledger arm, minus her own orders).
    collections as (
      select p.order_id,
             reporting.cents(p.amount) * case when lower(reporting.trim_text(coalesce(p.kind, ''))) = 'refund' then -1 else 1 end as cents
        from public.order_payments p
        join public.orders po on po.id = p.order_id
       where p.tenant_id = $1
         and p.created_at >= $2 and p.created_at < $3
         and po.tenant_id = $1
         and not (p.order_id = any ($4))
         and cash.order_outlet(po.outlet_id, po.customer_data) is not distinct from $8
         and coalesce(p.recorded_by::text, cash.pos_cashier(po.customer_data)) = $9
    )
    select jsonb_build_object(
      'summary', (
        select jsonb_build_object(
          'orders', count(*) filter (where f.is_live),
          'grossCents', coalesce(sum(f.gross_cents) filter (where f.is_live), 0)::bigint,
          'discountCents', coalesce(sum(f.discount_cents) filter (where f.is_live), 0)::bigint,
          'netCents', coalesce(sum(f.net_cents) filter (where f.is_live), 0)::bigint,
          'serviceChargeCents', coalesce(sum(f.service_cents) filter (where f.is_live), 0)::bigint,
          'deliveryCents', coalesce(sum(f.delivery_cents) filter (where f.is_live), 0)::bigint,
          'collectedCents', coalesce(sum(f.collected_cents) filter (where f.is_live), 0)::bigint,
          'unpaidCents', coalesce(sum(f.unpaid_cents) filter (where f.is_live), 0)::bigint,
          'overpaidCents', coalesce(sum(f.overpaid_cents) filter (where f.is_live), 0)::bigint,
          'voidCount', count(*) filter (where not f.is_live),
          'voidCents', coalesce(sum(greatest(f.billed_cents, 0)) filter (where not f.is_live), 0)::bigint,
          'refundCents', coalesce(sum(f.refund_cents) filter (where f.is_live), 0)::bigint)
          from f),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object('key', p.method_key, 'label', p.label, 'cents', p.cents, 'count', p.orders)
                         order by p.cents desc, p.label collate "C", p.method_key)
          from reporting.payment_buckets_of($1, $2, $3, null, false, $4) p), '[]'::jsonb),
      'orderTypes', coalesce((
        select jsonb_agg(jsonb_build_object('key', cash.order_type_key(t.label), 'label', t.label, 'orders', t.orders, 'netCents', t.net::bigint)
                         order by t.net desc, t.label)
          from types t), '[]'::jsonb),
      'channels', coalesce((
        select jsonb_agg(jsonb_build_object('key', c.key, 'label', cash.sale_channel_label(c.key), 'orders', c.orders, 'netCents', c.net::bigint)
                         order by c.net desc, c.key)
          from channels c), '[]'::jsonb),
      -- Most sold first (what the cashier checks her stack against), then sales.
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('label', i.label, 'quantity', i.quantity, 'netCents', i.net_cents)
                         order by i.quantity desc, i.net_cents desc, i.label collate "C", i.item_key)
          from (select * from items x
                 order by x.quantity desc, x.net_cents desc, x.label collate "C", x.item_key limit $6) i), '[]'::jsonb),
      'itemsTruncated', (select count(*) > $6 from items),
      'receipts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'orderId', x.order_id, 'number', x.number, 'placedAt', cash.iso(x.placed_at),
                 'orderTypeLabel', cash.order_type_label(x.order_type),
                 'methodLabel', coalesce(nullif(reporting.trim_text(x.method_name), ''), 'Not recorded'),
                 'totalCents', x.billed_cents::bigint, 'status', x.receipt_status)
                 order by x.placed_at desc, x.order_id desc)
          from recent x), '[]'::jsonb),
      'receiptsTruncated', (select count(*) > $5 from f),
      'firstNumber', (select r.number from r order by r.placed_at, r.order_id limit 1),
      'lastNumber', (select r.number from r order by r.placed_at desc, r.order_id desc limit 1),
      'voids', coalesce((
        select jsonb_agg(jsonb_build_object('orderId', v.order_id, 'number', v.number, 'placedAt', cash.iso(v.placed_at),
                                            'totalCents', greatest(v.billed_cents, 0)::bigint, 'status', v.receipt_status)
                         order by v.placed_at, v.order_id)
          from voided v), '[]'::jsonb),
      'voidsTruncated', (select count(*) > $7 from f where not f.is_live),
      'otherCollections', (
        select jsonb_build_object('count', count(distinct c.order_id), 'cents', coalesce(sum(c.cents), 0)::bigint)
          from collections c))
  $q$ into v_sales
  using p_shift.tenant_id, p_shift.opened_at, p_to, v_ids, 500, 500, 200,
        p_shift.outlet_id::text, coalesce(p_shift.staff_user_id::text, '');

  return v_sales;
end;
$fn$;

revoke all on function cash.cashier_sales(public.staff_shifts, timestamptz) from public, anon, authenticated;
grant execute on function cash.cashier_sales(public.staff_shifts, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- cash.cashier_cash: her drawer, as the remittance slip prints it. Expected =
-- the figure the count was judged against (shift_counts, last attempt) or the
-- one frozen at close (staff_shifts.expected_cash), else — still open and not
-- counted — the server's live figure (cash.shift_expected, platform only).
-- Cash sales = expected − float − pay in + pay out + pickups (the drawer
-- identity, as remittanceSlipInput derives it), so the lines always add up to
-- the expected figure whichever engine produced it. Unknown stays NULL.
-- Internal.
-- ---------------------------------------------------------------------------
create or replace function cash.cashier_cash(p_shift public.staff_shifts)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_float bigint := round(p_shift.opening_float * 100)::bigint;
  v_pay_in bigint;
  v_pay_out bigint;
  v_collected bigint;
  v_expected bigint;
  v_counted bigint;
  v_source text;
  v jsonb;
begin
  select round(coalesce(sum(m.amount) filter (where m.kind = 'pay_in'), 0) * 100)::bigint,
         round(coalesce(sum(m.amount) filter (where m.kind = 'pay_out'), 0) * 100)::bigint,
         round(coalesce(sum(m.amount) filter (where m.kind = 'collect'), 0) * 100)::bigint
    into v_pay_in, v_pay_out, v_collected
    from public.shift_cash_movements m
   where m.shift_id = p_shift.id;

  select c.counted_cents, c.expected_cents, c.expected_source
    into v_counted, v_expected, v_source
    from public.shift_counts c
   where c.shift_id = p_shift.id
   order by c.attempt desc
   limit 1;

  if p_shift.status = 'closed' then
    v_counted := coalesce(round(p_shift.closing_count * 100)::bigint, v_counted);
    v_expected := coalesce(round(p_shift.expected_cash * 100)::bigint, v_expected);
    v_source := coalesce((select e.source from public.shift_expectations e where e.shift_id = p_shift.id), v_source);
  elsif v_expected is null and cash.tenant_order_backend(p_shift.tenant_id) = 'platform' then
    begin
      v := cash.shift_expected(p_shift, now());
      v_expected := (v ->> 'expectedCents')::bigint;
      v_source := 'server';
    exception when others then
      raise warning 'cashier_cash: server expectation failed: % (%)', sqlerrm, sqlstate;
    end;
  end if;

  return jsonb_build_object(
    'floatCents', v_float,
    'cashSalesCents', case when v_expected is null then null else v_expected - v_float - v_pay_in + v_pay_out + v_collected end,
    'payInCents', v_pay_in,
    'payOutCents', v_pay_out,
    'collectedCents', v_collected,
    'expectedCents', v_expected,
    'expectedSource', case when v_source in ('server', 'device') then v_source end,
    'countedCents', v_counted,
    'differenceCents', case when v_counted is not null and v_expected is not null then v_counted - v_expected end);
end;
$fn$;

revoke all on function cash.cashier_cash(public.staff_shifts) from public, anon, authenticated;
grant execute on function cash.cashier_cash(public.staff_shifts) to service_role;

-- ---------------------------------------------------------------------------
-- report_shift_sales(p_shift_id, p_scope). The one-argument form is replaced
-- (not overloaded: PostgREST could not choose between the two for
-- {p_shift_id}); `report_shift_sales(id)` and {p_shift_id} keep working
-- through the NULL default: the window, exactly as before, for whoever may
-- read it; a plain cashier's own sales otherwise (app 1.0.16 compatibility).
-- ---------------------------------------------------------------------------
drop function if exists public.report_shift_sales(uuid);

create or replace function public.report_shift_sales(p_shift_id uuid, p_scope text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  -- NULL = not asked: decided below from what the caller may read.
  v_scope text := lower(nullif(btrim(p_scope), ''));
  s public.staff_shifts%rowtype;
  v_to timestamptz;
  v_reach boolean;
  v_manager boolean;
  v_may_window boolean;
  v_hidden boolean;
  v_head jsonb;
  v_report jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to see shift sales.' using errcode = '42501';
  end if;
  if v_scope is not null and v_scope not in ('window', 'cashier') then
    raise exception 'A shift report is either the store''s (window) or the cashier''s own (cashier).' using errcode = '22023';
  end if;
  select * into s from public.staff_shifts where id = p_shift_id;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  v_reach := public.app_user_may_reach_branch(s.tenant_id, s.outlet_id);
  v_manager := v_reach and public.app_user_manages_cash(s.tenant_id);
  if not (v_manager or (v_reach and s.staff_user_id = v_uid)) then
    raise exception 'Only the cashier on this shift or someone who handles cash can see its sales.' using errcode = '42501';
  end if;
  -- Owner decision 2026-11-04: a cashier sees her own sales, never the store's.
  -- (Past the check above the caller is a manager or the holder reaching the
  -- branch, so `reports` here is the holder's own.)
  v_may_window := v_manager or public.app_user_has_permission(s.tenant_id, 'reports');
  v_scope := coalesce(v_scope, case when v_may_window then 'window' else 'cashier' end);
  if v_scope = 'window' and not v_may_window then
    raise exception 'Your shift report shows your own sales. Store sales need the Reports permission.' using errcode = '42501';
  end if;

  v_to := coalesce(s.closed_at, now());
  if v_to - s.opened_at > interval '93 days' then
    raise exception 'This shift has been open too long to add up. Close it first.' using errcode = '22023';
  end if;
  v_head := jsonb_build_object(
    'source', 'server', 'hidden', false,
    'window', jsonb_build_object('from', cash.iso(s.opened_at), 'to', cash.iso(v_to)),
    'shift', jsonb_build_object(
      'id', s.id, 'staffName', s.staff_name, 'drawerName', s.drawer_name,
      'openedAt', cash.iso(s.opened_at), 'closedAt', cash.iso(s.closed_at),
      'businessDay', to_char(s.business_day, 'YYYY-MM-DD'),
      'servicePeriodName', (select p.name from public.service_periods p where p.id = s.service_period_id)));
  -- The window answer is the 20261027121000 one, key for key.
  if v_scope = 'cashier' then
    v_head := v_head || '{"scope": "cashier"}'::jsonb;
  end if;

  if cash.tenant_order_backend(s.tenant_id) is distinct from 'platform' then
    return v_head || '{"source": "unavailable"}'::jsonb;
  end if;

  if v_scope = 'window' then
    v_report := v_head || cash.window_sales(s.tenant_id, s.opened_at, v_to, s.outlet_id, 500);
    if s.is_blind and s.status = 'open' and not v_manager then
      return cash.hide_money(v_report);
    end if;
    return v_report;
  end if;

  v_hidden := s.is_blind and s.status = 'open' and not v_manager
              and not exists (select 1 from public.shift_counts c where c.shift_id = s.id);
  v_report := v_head || cash.cashier_sales(s, v_to);
  if v_hidden then
    return cash.hide_money(v_report) || jsonb_build_object(
      'itemsTruncated', false, 'cash', null, 'otherCollections', null,
      'voids', coalesce((select jsonb_agg(v || '{"totalCents": null}'::jsonb order by ord)
                           from jsonb_array_elements(v_report -> 'voids') with ordinality as e(v, ord)), '[]'::jsonb));
  end if;
  return v_report || jsonb_build_object('cash', cash.cashier_cash(s));
end;
$$;

comment on function public.report_shift_sales(uuid, text) is
  'Sales during one shift (CONTRACTS §4). p_scope omitted/NULL: window if the caller may read it, else cashier. p_scope window: the branch inside the shift window — cash_manage with branch reach, or the holder holding reports. p_scope cashier: the holder''s own POS sales (belongsToDrawer), every item ≤ 500, voids, drawer cash — the holder or cash_manage. Blind + open + not a cash manager: money hidden (cashier scope: until counted). Non-platform store: source unavailable. 20261104140000.';

revoke all on function public.report_shift_sales(uuid, text) from public, anon;
grant execute on function public.report_shift_sales(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- report_shift_nets(p_shift_ids): the "My shifts" list — each shift's own
-- orders and net (cashier scope), one call. A shift the caller may not read,
-- or one that does not exist, is left out (the list already came from
-- staff_shifts under RLS). Blind + open + uncounted: hidden, no pesos.
-- Non-platform store: unavailable. Longer than 2 days (open: now() −
-- opened_at): too_long, nothing added up. Ids are deduplicated (NULLs
-- dropped) and at most 31 distinct shifts per call.
-- ---------------------------------------------------------------------------
create or replace function public.report_shift_nets(p_shift_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.staff_shifts%rowtype;
  v_to timestamptz;
  v_manager boolean;
  v_wanted uuid[];
  v_ids uuid[];
  v_row jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to see shift sales.' using errcode = '42501';
  end if;
  v_wanted := array(select distinct x from unnest(coalesce(p_shift_ids, '{}'::uuid[])) as u(x) where x is not null);
  if cardinality(v_wanted) > 31 then
    raise exception 'Ask for at most 31 shifts at a time.' using errcode = '22023';
  end if;
  for s in
    select * from public.staff_shifts where id = any (v_wanted) order by opened_at desc
  loop
    continue when not public.app_user_may_reach_branch(s.tenant_id, s.outlet_id);
    v_manager := public.app_user_manages_cash(s.tenant_id);
    continue when not (v_manager or s.staff_user_id = v_uid);
    v_to := coalesce(s.closed_at, now());
    if cash.tenant_order_backend(s.tenant_id) is distinct from 'platform' then
      v_row := jsonb_build_object('status', 'unavailable', 'orders', null, 'netCents', null);
    elsif v_to - s.opened_at > interval '2 days' then
      v_row := jsonb_build_object('status', 'too_long', 'orders', null, 'netCents', null);
    elsif s.is_blind and s.status = 'open' and not v_manager
          and not exists (select 1 from public.shift_counts c where c.shift_id = s.id) then
      v_row := jsonb_build_object('status', 'hidden', 'orders', null, 'netCents', null);
    else
      v_ids := cash.cashier_order_ids(s, v_to);
      select jsonb_build_object(
               'status', 'ok',
               'orders', count(*) filter (where f.is_live),
               'netCents', coalesce(sum(f.net_cents) filter (where f.is_live), 0)::bigint)
        into v_row
        from reporting.order_figures(s.tenant_id, s.opened_at, v_to, null, false) f
       where f.order_id = any (v_ids);
    end if;
    v_rows := v_rows || jsonb_build_array(v_row || jsonb_build_object('shiftId', s.id));
  end loop;
  return jsonb_build_object('shifts', v_rows);
end;
$$;

comment on function public.report_shift_nets(uuid[]) is
  'Orders + net per shift over the holder''s own POS sales (report_shift_sales cashier scope), for the My shifts list. Holder or cash_manage with branch reach; others left out. ≤ 31 distinct shifts; longer than 2 days = too_long (not added up). 20261104140000.';

revoke all on function public.report_shift_nets(uuid[]) from public, anon;
grant execute on function public.report_shift_nets(uuid[]) to authenticated;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop function if exists public.report_shift_nets(uuid[]);
-- drop function if exists public.report_shift_sales(uuid, text);
--   then re-create public.report_shift_sales(uuid) from 20261027121000 (+ its revoke/grant).
-- drop function if exists cash.cashier_cash(public.staff_shifts);
-- drop function if exists cash.cashier_sales(public.staff_shifts, timestamptz);
-- drop function if exists cash.cashier_order_ids(public.staff_shifts, timestamptz);
-- re-create reporting.payment_buckets / reporting.item_rollup from 20261027121000 (inline bodies), then:
-- drop function if exists reporting.item_rollup_of(uuid, timestamptz, timestamptz, uuid, boolean, uuid[]);
-- drop function if exists reporting.payment_buckets_of(uuid, timestamptz, timestamptz, uuid, boolean, uuid[]);
