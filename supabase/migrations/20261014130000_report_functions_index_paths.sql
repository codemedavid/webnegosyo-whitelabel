-- ===========================================================================
-- Report functions: read order lines and payments BY ORDER (index paths).
--
-- 20261014110000 joined order_items / order_payments to the window's orders.
-- Inside these (non-inlined) SQL functions the planner chose to hash-join the
-- WHOLE shared order_items table, evaluating its RLS EXISTS for every line of
-- every store: a 30-day probe for one store on 2026-10-14 06:52 UTC ran long
-- enough to stop the platform database accepting connections until it
-- restarted (07:00 UTC). The functions were not yet called by any screen.
--
-- Two changes, both about the plan (results are unchanged):
--   * The per-order and per-line helpers become PL/pgSQL that EXECUTEs their
--     query, so every call is planned with its real store and window. As
--     plain SQL functions they got a generic plan whose estimates (a handful
--     of orders) chose nested loops that re-read every line per order.
--   * `order_id = any (array(select …))` is an index condition on
-- order_items_order_idx / order_payments_order_idx (uuid equality is
-- leakproof, so it is applied BEFORE the RLS check), so each store reads only
-- its own window's rows. Results are unchanged: the parity and access suites
-- (tests/unit/reports/report-sql-*.test.ts) load this file after 120000.
-- ===========================================================================

create or replace function reporting.order_figures(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean)
returns table (
  order_id uuid,
  placed_at timestamptz,
  outlet_id uuid,
  source text,
  order_type text,
  method_id uuid,
  method_name text,
  is_live boolean,
  billed_cents numeric,
  gross_cents numeric,
  discount_cents numeric,
  delivery_discount_cents numeric,
  net_cents numeric,
  service_cents numeric,
  delivery_cents numeric,
  refund_cents numeric,
  ledger_cents numeric,
  collected_cents numeric,
  unpaid_cents numeric,
  overpaid_cents numeric,
  line_count bigint,
  line_quantity bigint,
  line_gap_cents numeric
)
language plpgsql
stable
set search_path = ''
as $fn$
begin
  -- EXECUTE: planned with this call's real values (a custom plan), never
  -- a generic one that guesses the window is tiny and re-scans per order.
  return query execute $q$
  with base as (
    select
      o.id,
      o.created_at,
      o.outlet_id,
      o.source,
      o.order_type,
      o.payment_method_id,
      o.payment_method_name,
      lower(reporting.trim_text(coalesce(o.status, ''))) as status_key,
      o.payment_status is null as has_no_payment_status,
      lower(reporting.trim_text(o.payment_status)) as payment_key,
      reporting.cents(o.total) as billed,
      reporting.cents(o.service_charge_amount) as service,
      greatest(reporting.cents(o.delivery_fee), 0) as delivery_fee,
      reporting.discount_payload(o.discount_data, o.customer_data) as discount,
      reporting.has_table(o.customer_data) as has_table
    from public.orders o
    where o.tenant_id = $1
      and o.created_at >= $2
      and o.created_at < $3
      and ($4 is null or o.outlet_id = $4)
      and (not coalesce($5, false) or o.outlet_id is null)
  ),
  ledger as (
    select
      p.order_id,
      coalesce(sum(reporting.cents(p.amount)) filter (where lower(reporting.trim_text(coalesce(p.kind, ''))) <> 'refund'), 0) as charge,
      coalesce(sum(reporting.cents(p.amount)) filter (where lower(reporting.trim_text(coalesce(p.kind, ''))) = 'refund'), 0) as refund
    from public.order_payments p
    where p.order_id = any (array(select b.id from base b))
    group by p.order_id
  ),
  lines as (
    select i.order_id, count(*) as line_count, coalesce(sum(i.quantity), 0) as line_quantity, sum(reporting.cents(i.subtotal)) as line_sum
    from public.order_items i
    where i.order_id = any (array(select b.id from base b))
    group by i.order_id
  ),
  discounted as (
    select
      b.*,
      case when b.discount is null then 0 else greatest(reporting.cents((b.discount ->> 'total')::numeric), 0) end as discount_total,
      case
        when jsonb_typeof(b.discount -> 'deliveryDiscount') = 'number'
          then greatest(reporting.cents((b.discount ->> 'deliveryDiscount')::numeric), 0)
        else 0
      end as delivery_requested
    from base b
  ),
  figured as (
    select
      d.*,
      least(d.delivery_requested, d.delivery_fee, d.discount_total) as delivery_discount,
      coalesce(l.charge, 0) - coalesce(l.refund, 0) as ledger_net,
      coalesce(l.refund, 0) as refund,
      coalesce(li.line_count, 0) as line_count,
      coalesce(li.line_quantity, 0) as line_quantity,
      li.line_sum,
      d.has_no_payment_status
        or d.payment_key in ('paid', 'verified')
        or (d.status_key = 'delivered' and not d.has_table) as settled_by_status
    from discounted d
    left join ledger l on l.order_id = d.id
    left join lines li on li.order_id = d.id
  ),
  settled as (
    select
      f.*,
      f.discount_total - f.delivery_discount as food_discount,
      f.delivery_fee - f.delivery_discount as delivery,
      f.settled_by_status or f.ledger_net >= f.billed as is_settled
    from figured f
  ),
  final as (
    select
      s.*,
      s.billed - s.service - s.delivery + s.food_discount as gross,
      case when s.is_settled then greatest(s.ledger_net, s.billed) else s.ledger_net end as collected
    from settled s
  )
  select
    f.id,
    f.created_at,
    f.outlet_id,
    f.source,
    f.order_type,
    f.payment_method_id,
    f.payment_method_name,
    f.status_key <> all (array['cancelled', 'canceled', 'refunded', 'voided']) and f.billed >= 0,
    f.billed,
    f.gross,
    f.food_discount,
    f.delivery_discount,
    f.gross - f.food_discount,
    f.service,
    f.delivery,
    f.refund,
    f.ledger_net,
    f.collected,
    greatest(f.billed - f.collected, 0),
    greatest(f.collected - f.billed, 0),
    f.line_count,
    f.line_quantity,
    case when f.line_count > 0 then f.line_sum - f.gross end
  from final f
  $q$ using p_tenant, p_from, p_to, p_outlet, p_unassigned;
end;
$fn$;


create or replace function reporting.line_figures(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean)
returns table (
  order_id uuid,
  line_id uuid,
  placed_at timestamptz,
  menu_item_id uuid,
  name text,
  category_name text,
  category_from_menu boolean,
  quantity bigint,
  is_unrecorded boolean,
  gross_cents numeric,
  discount_cents numeric,
  net_cents numeric
)
language plpgsql
stable
set search_path = ''
as $fn$
begin
  -- EXECUTE: planned with this call's real values (a custom plan), never
  -- a generic one that guesses the window is tiny and re-scans per order.
  return query execute $q$
  with live as (
    select f.order_id, f.placed_at, f.gross_cents, f.discount_cents, f.line_count
    from reporting.order_figures($1, $2, $3, $4, $5) f
    where f.is_live
  ),
  raw as (
    select
      o.order_id,
      i.id as line_id,
      o.placed_at,
      i.menu_item_id,
      coalesce(i.menu_item_name, '') as name,
      nullif(reporting.trim_text(i.category_name), '') as snapshot_category,
      coalesce(i.quantity, 0)::bigint as quantity,
      false as is_unrecorded,
      greatest(reporting.cents(i.subtotal), 0) as weight,
      o.gross_cents,
      o.discount_cents
    from live o
    join public.order_items i on i.order_id = o.order_id
    where i.order_id = any (array(select l.order_id from live l))
    union all
    select o.order_id, null, o.placed_at, null, 'Items not recorded', null, 0, true, 0, o.gross_cents, o.discount_cents
    from live o
    where o.line_count = 0
  ),
  -- Round 1: the order's gross across its lines.
  g1 as (
    select
      r.*,
      row_number() over (partition by r.order_id order by r.line_id) as idx,
      sum(r.weight) over (partition by r.order_id) as weight_sum,
      count(*) over (partition by r.order_id) as line_total
    from raw r
  ),
  g2 as (
    select
      g.*,
      case when g.weight_sum > 0 then g.weight else 1 end as basis,
      case when g.weight_sum > 0 then g.weight_sum else g.line_total end as basis_sum,
      abs(g.gross_cents) as whole
    from g1 g
  ),
  g3 as (
    select g.*, div(g.whole * g.basis, g.basis_sum) as floor_share, mod(g.whole * g.basis, g.basis_sum) as remainder
    from g2 g
  ),
  g4 as (
    select
      g.*,
      row_number() over (partition by g.order_id order by g.remainder desc, g.idx) as rank_in_order,
      g.whole - sum(g.floor_share) over (partition by g.order_id) as spare
    from g3 g
  ),
  grossed as (
    select
      g.order_id, g.line_id, g.placed_at, g.menu_item_id, g.name, g.snapshot_category, g.quantity, g.is_unrecorded, g.idx, g.discount_cents,
      (g.floor_share + case when g.rank_in_order <= g.spare then 1 else 0 end)
        * case when g.gross_cents < 0 then -1 else 1 end as line_gross
    from g4 g
  ),
  -- Round 2: the food discount across the gross shares.
  d1 as (
    select
      g.*,
      greatest(g.line_gross, 0) as weight,
      sum(greatest(g.line_gross, 0)) over (partition by g.order_id) as weight_sum,
      count(*) over (partition by g.order_id) as line_total
    from grossed g
  ),
  d2 as (
    select
      d.*,
      case when d.weight_sum > 0 then d.weight else 1 end as basis,
      case when d.weight_sum > 0 then d.weight_sum else d.line_total end as basis_sum,
      abs(d.discount_cents) as whole
    from d1 d
  ),
  d3 as (
    select d.*, div(d.whole * d.basis, d.basis_sum) as floor_share, mod(d.whole * d.basis, d.basis_sum) as remainder
    from d2 d
  ),
  d4 as (
    select
      d.*,
      row_number() over (partition by d.order_id order by d.remainder desc, d.idx) as rank_in_order,
      d.whole - sum(d.floor_share) over (partition by d.order_id) as spare
    from d3 d
  ),
  shared as (
    select
      d.*,
      (d.floor_share + case when d.rank_in_order <= d.spare then 1 else 0 end)
        * case when d.discount_cents < 0 then -1 else 1 end as line_discount
    from d4 d
  )
  select
    s.order_id,
    s.line_id,
    s.placed_at,
    s.menu_item_id,
    s.name,
    coalesce(s.snapshot_category, nullif(reporting.trim_text(c.name), '')),
    s.snapshot_category is null and nullif(reporting.trim_text(c.name), '') is not null,
    s.quantity,
    s.is_unrecorded,
    s.line_gross,
    s.line_discount,
    s.line_gross - s.line_discount
  from shared s
  left join public.menu_items mi on s.snapshot_category is null and mi.id = s.menu_item_id and mi.tenant_id = $1
  left join public.categories c on c.id = mi.category_id
  $q$ using p_tenant, p_from, p_to, p_outlet, p_unassigned;
end;
$fn$;


create or replace function public.report_payments(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
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
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query
  with live as (
    select
      f.order_id, f.placed_at, f.collected_cents, f.ledger_cents,
      f.method_id as own_id,
      nullif(reporting.trim_text(f.method_name), '') as own_name,
      reporting.method_key(f.method_id, f.method_name) as own_key
    from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
    where f.is_live
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
  slices as (
    select p.order_id, p.key
    from parts p
    group by p.order_id, p.key
    having sum(p.cents) <> 0
  )
  select
    p.key,
    (array_agg(p.method_id) filter (where p.method_id is not null))[1],
    (array_agg(p.label order by (p.label <> 'Not recorded') desc, p.at desc, p.label collate "C"))[1],
    sum(p.cents)::bigint,
    count(distinct p.order_id)
  from parts p
  join slices s on s.order_id = p.order_id and s.key = p.key
  group by p.key;
end;
$$;
