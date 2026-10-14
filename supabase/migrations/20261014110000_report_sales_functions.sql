-- ===========================================================================
-- Sales report functions for platform stores (Phase 1 of
-- docs/plans/2026-10-12-reports-and-inventory-suite.md, §5 and §7.3).
--
-- The metric dictionary lives in TypeScript: src/lib/reports/sales-model.ts
-- (per-order figures), sales-breakdowns.ts (items, categories, periods,
-- hours) and payment-buckets.ts (money by method). These functions compute
-- the SAME numbers next to the data, because a busy store's month (6.5k
-- orders, 13k lines) is far too many rows to ship to the server and sum.
-- tests/unit/reports/report-sql-parity.property.test.ts runs both over
-- generated stores in PGlite and fails on a one-centavo difference: change a
-- rule in one place and the other must follow.
--
-- Security:
--   * Every function is SECURITY INVOKER: the caller's row-level security
--     decides which orders exist (store, branch, and after 20261013120200 the
--     order-read keys). Nothing here widens what a caller can read.
--   * The public functions also refuse callers without the `reports` key
--     (42501): an account holding `orders` reads the live queue, not reports.
--     The service role (server jobs) is allowed; it already reads everything.
--   * Ranges are validated here: p_from < p_to, at most 93 days.
--   * Helpers live in schema `reporting`, which PostgREST does not expose.
--
-- Money is integer centavos, rounded half away from zero per value (numeric
-- round). Shares use the largest remainder with EXACT integer arithmetic,
-- ties to the earlier line (lines ordered by id) — allocateCents.
-- ===========================================================================

create schema if not exists reporting;
revoke all on schema reporting from public, anon;
grant usage on schema reporting to authenticated, service_role;

-- JS String.prototype.trim(): every whitespace, not only spaces.
create or replace function reporting.trim_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(p_value, '^\s+|\s+$', '', 'g')
$$;

-- foldMethodName(): lower case, runs of anything but letters/digits → one space.
create or replace function reporting.fold_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select reporting.trim_text(regexp_replace(lower(coalesce(p_value, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Pesos → centavos, half away from zero (toCents). NULL is 0.
create or replace function reporting.cents(p_value numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round(coalesce(p_value, 0) * 100)
$$;

-- The discount payload readOrderDiscount() trusts: the column, else the POS blob.
create or replace function reporting.discount_payload(p_discount_data jsonb, p_customer_data jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_discount_data) = 'object' and jsonb_typeof(p_discount_data -> 'total') = 'number'
      then p_discount_data
    when jsonb_typeof(p_customer_data -> 'discount') = 'object'
     and jsonb_typeof(p_customer_data -> 'discount' -> 'total') = 'number'
      then p_customer_data -> 'discount'
  end
$$;

-- getOrderTableNumber(customer_data) IS NOT NULL: a dine-in tab.
create or replace function reporting.has_table(p_customer_data jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_customer_data -> 'table_number') = 'string'
    and reporting.trim_text(
      regexp_replace(
        regexp_replace(reporting.trim_text(p_customer_data ->> 'table_number'), '^(?:table|tbl\.?|t\.)?\s*#?\s*', '', 'i'),
        '\s+', ' ', 'g'
      )
    ) <> '',
    false
  )
$$;

-- methodKey(): the payment_methods row, else the folded name, else unspecified.
create or replace function reporting.method_key(p_method_id uuid, p_method_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_method_id is not null then 'id:' || p_method_id::text
    when reporting.fold_name(p_method_name) <> '' then 'name:' || reporting.fold_name(p_method_name)
    else 'unspecified'
  end
$$;

-- Caller and range checks shared by every public report function.
create or replace function reporting.assert_access(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_tenant is null or p_from is null or p_to is null then
    raise exception 'A report needs a store and a date range.' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'A report''s range must end after it starts.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '93 days' then
    raise exception 'A report covers at most 93 days.' using errcode = '22023';
  end if;
  if coalesce(p_unassigned, false) and p_outlet is not null then
    raise exception 'Pick one branch or the unassigned orders, not both.' using errcode = '22023';
  end if;
  if current_user <> 'service_role' and not public.app_user_has_permission(p_tenant, 'reports') then
    raise exception 'Sales reports need the Reports permission.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per order: orderFigures() (sales-model.ts). Every order in the window,
-- reversed ones included (is_live = false), as the caller may read them.
-- ---------------------------------------------------------------------------
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
language sql
stable
set search_path = ''
as $$
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
    where o.tenant_id = p_tenant
      and o.created_at >= p_from
      and o.created_at < p_to
      and (p_outlet is null or o.outlet_id = p_outlet)
      and (not coalesce(p_unassigned, false) or o.outlet_id is null)
  ),
  ledger as (
    select
      p.order_id,
      coalesce(sum(reporting.cents(p.amount)) filter (where lower(reporting.trim_text(coalesce(p.kind, ''))) <> 'refund'), 0) as charge,
      coalesce(sum(reporting.cents(p.amount)) filter (where lower(reporting.trim_text(coalesce(p.kind, ''))) = 'refund'), 0) as refund
    from public.order_payments p
    join base b on b.id = p.order_id
    group by p.order_id
  ),
  lines as (
    select i.order_id, count(*) as line_count, coalesce(sum(i.quantity), 0) as line_quantity, sum(reporting.cents(i.subtotal)) as line_sum
    from public.order_items i
    join base b on b.id = i.order_id
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
$$;

-- ---------------------------------------------------------------------------
-- Per line of a live order: orderLineFigures(). The order's gross is shared
-- across its lines by their subtotals, then its food discount across those
-- gross shares (largest remainder, exact). An order with no recorded lines
-- gets one stand-in line ("Items not recorded"). The category is the one the
-- line was sold under, else the dish's CURRENT category (from_menu = true),
-- for lines sold before the snapshot existed.
-- ---------------------------------------------------------------------------
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
language sql
stable
set search_path = ''
as $$
  with live as (
    select f.order_id, f.placed_at, f.gross_cents, f.discount_cents, f.line_count
    from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
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
  left join public.menu_items mi on s.snapshot_category is null and mi.id = s.menu_item_id and mi.tenant_id = p_tenant
  left join public.categories c on c.id = mi.category_id
$$;

-- ---------------------------------------------------------------------------
-- Public report functions. Arguments shared by all:
--   p_tenant      the store
--   p_from, p_to  half-open [from, to), at most 93 days
--   p_outlet      one branch, or NULL for the whole store
--   p_unassigned  true = only orders with no branch ("Unassigned")
-- ---------------------------------------------------------------------------

-- summarizeSales(): one row.
create or replace function public.report_sales_summary(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  orders bigint,
  gross_cents bigint,
  discount_cents bigint,
  delivery_discount_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  service_cents bigint,
  delivery_cents bigint,
  billed_cents bigint,
  collected_cents bigint,
  unpaid_cents bigint,
  overpaid_cents bigint,
  void_orders bigint,
  void_billed_cents bigint,
  orders_without_lines bigint,
  orders_lines_mismatch bigint,
  line_gap_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query
  select
    count(*) filter (where f.is_live),
    coalesce(sum(f.gross_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.discount_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.delivery_discount_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.refund_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.net_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.service_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.delivery_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.billed_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.collected_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.unpaid_cents) filter (where f.is_live), 0)::bigint,
    coalesce(sum(f.overpaid_cents) filter (where f.is_live), 0)::bigint,
    count(*) filter (where not f.is_live),
    coalesce(sum(greatest(f.billed_cents, 0)) filter (where not f.is_live), 0)::bigint,
    count(*) filter (where f.is_live and f.line_count = 0),
    count(*) filter (where f.is_live and f.line_gap_cents <> 0),
    coalesce(sum(f.line_gap_cents) filter (where f.is_live), 0)::bigint
  from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f;
end;
$$;

-- rollupPeriods(): live orders per bucket of p_grain in p_tz.
create or replace function public.report_sales_by_period(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_grain text,
  p_outlet uuid default null, p_unassigned boolean default false, p_tz text default 'Asia/Manila'
)
returns table (
  bucket text,
  orders bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint,
  billed_cents bigint,
  collected_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  if p_grain is null or p_grain <> all (array['hour', 'day', 'week', 'month']) then
    raise exception 'Unknown report grain: %', p_grain using errcode = '22023';
  end if;
  -- Every store trades in Manila (fixed +08:00, src/lib/inventory/business-day.ts).
  -- An allow-list, not pg_timezone_names: that view reads the zone files on every call.
  if p_tz is null or p_tz <> all (array['Asia/Manila']) then
    raise exception 'Unsupported time zone: %', p_tz using errcode = '22023';
  end if;
  return query
  with local as (
    select f.*, f.placed_at at time zone p_tz as local_at
    from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
    where f.is_live
  )
  select
    case p_grain
      when 'hour' then to_char(l.local_at, 'YYYY-MM-DD"T"HH24')
      when 'day' then to_char(l.local_at, 'YYYY-MM-DD')
      when 'week' then to_char(date_trunc('week', l.local_at), 'YYYY-MM-DD')
      else to_char(date_trunc('month', l.local_at), 'YYYY-MM-DD')
    end as bucket,
    count(*),
    sum(l.gross_cents)::bigint,
    sum(l.discount_cents)::bigint,
    sum(l.net_cents)::bigint,
    sum(l.billed_cents)::bigint,
    sum(l.collected_cents)::bigint
  from local l
  group by 1
  order by 1;
end;
$$;

-- Live orders by a stored column: 'source' (channel), 'order_type' or
-- 'outlet'. Keys are the raw stored values (NULL kept); the app maps and
-- merges them (toSaleChannel, toOrderTypeLabel) — sums merge exactly.
create or replace function public.report_sales_by_dimension(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_dimension text,
  p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  key text,
  orders bigint,
  quantity bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  if p_dimension is null or p_dimension <> all (array['source', 'order_type', 'outlet']) then
    raise exception 'Unknown report dimension: %', p_dimension using errcode = '22023';
  end if;
  return query
  select
    case p_dimension when 'source' then f.source when 'order_type' then f.order_type else f.outlet_id::text end,
    count(*),
    sum(f.line_quantity)::bigint,
    sum(f.gross_cents)::bigint,
    sum(f.discount_cents)::bigint,
    sum(f.net_cents)::bigint
  from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
  where f.is_live
  group by 1;
end;
$$;

-- rollupHours(): live orders by ISO weekday (Monday = 1) × hour in p_tz.
create or replace function public.report_sales_by_hour(
  p_tenant uuid, p_from timestamptz, p_to timestamptz,
  p_outlet uuid default null, p_unassigned boolean default false, p_tz text default 'Asia/Manila'
)
returns table (
  weekday integer,
  hour integer,
  orders bigint,
  net_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  -- Every store trades in Manila (fixed +08:00, src/lib/inventory/business-day.ts).
  -- An allow-list, not pg_timezone_names: that view reads the zone files on every call.
  if p_tz is null or p_tz <> all (array['Asia/Manila']) then
    raise exception 'Unsupported time zone: %', p_tz using errcode = '22023';
  end if;
  return query
  select
    extract(isodow from f.placed_at at time zone p_tz)::integer,
    extract(hour from f.placed_at at time zone p_tz)::integer,
    count(*),
    sum(f.net_cents)::bigint
  from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
  where f.is_live
  group by 1, 2
  order by 1, 2;
end;
$$;

-- rollupItems(): one row per dish (menu row, else folded name; unrecorded
-- lines together). Label = name at the most recent sale, ties by code point.
create or replace function public.report_sales_by_item(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
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
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
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

-- rollupCategories(): one row per category (folded), uncategorised and
-- unrecorded apart. from_current_menu = some lines had no snapshot and were
-- filed under the dish's category today.
create or replace function public.report_sales_by_category(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  category_key text,
  label text,
  orders bigint,
  quantity bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint,
  from_current_menu boolean
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query
  with keyed as (
    select
      l.*,
      case
        when l.is_unrecorded then 'unrecorded'
        when l.category_name is null then 'uncategorised'
        else 'name:' || reporting.fold_name(l.category_name)
      end as k,
      case
        when l.is_unrecorded then l.name
        else coalesce(l.category_name, 'Uncategorised')
      end as category_label
    from reporting.line_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) l
  )
  select
    k.k,
    (array_agg(k.category_label order by k.placed_at desc, k.category_label collate "C"))[1],
    count(distinct k.order_id),
    sum(k.quantity)::bigint,
    sum(k.gross_cents)::bigint,
    sum(k.discount_cents)::bigint,
    sum(k.net_cents)::bigint,
    bool_or(k.category_from_menu)
  from keyed k
  group by k.k;
end;
$$;

-- bucketPayments(): money actually received, by method. Σ cents = collected.
-- What is still owed is NOT here (report_sales_summary.unpaid_cents).
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

-- Grants: signed-in staff (gated inside by `reports` and RLS) and the
-- service role. Never anon.
revoke all on all functions in schema reporting from public, anon;
grant execute on all functions in schema reporting to authenticated, service_role;

revoke all on function public.report_sales_summary(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.report_sales_by_period(uuid, timestamptz, timestamptz, text, uuid, boolean, text) from public, anon;
revoke all on function public.report_sales_by_dimension(uuid, timestamptz, timestamptz, text, uuid, boolean) from public, anon;
revoke all on function public.report_sales_by_hour(uuid, timestamptz, timestamptz, uuid, boolean, text) from public, anon;
revoke all on function public.report_sales_by_item(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.report_sales_by_category(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.report_payments(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;

grant execute on function public.report_sales_summary(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function public.report_sales_by_period(uuid, timestamptz, timestamptz, text, uuid, boolean, text) to authenticated, service_role;
grant execute on function public.report_sales_by_dimension(uuid, timestamptz, timestamptz, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.report_sales_by_hour(uuid, timestamptz, timestamptz, uuid, boolean, text) to authenticated, service_role;
grant execute on function public.report_sales_by_item(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function public.report_sales_by_category(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function public.report_payments(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
