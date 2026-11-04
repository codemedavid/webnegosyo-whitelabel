-- ===========================================================================
-- Profit report days follow the business day (CONTRACTS W3.1; bizday's note
-- at reporting.profit_facts).
--
-- Every profit fact (live order, order line, ledger movement, unsorted drawer
-- pay-out) is dated by business_day_of(store, instant) instead of its Manila
-- calendar date, and an expense dated D is in [p_from, p_to) when D's
-- BUSINESS-DAY START is (reporting.business_day_on_or_after, the twin of
-- businessDayOnOrAfter in src/lib/reports/profit-facts.ts). No cutoff rows =
-- exactly the previous answers (Manila midnight).
--
-- Bodies: reporting.profit_facts from 20261022130100 (live) and
-- report_expenses_by_category from 20261022120300 (live), with ONLY the day
-- expressions changed. Speed: one cutoff over the window (the usual case)
-- dates with a constant shift (reporting.constant_cutoff, 20261027140000).
-- Parity: tests/unit/reports/report-profit-parity.property.test.ts runs random
-- schedules (tests/sql/report-profit-worker.cjs loads this file).
-- ===========================================================================

set lock_timeout = '3s';

-- The first business day whose START is at or after p_at.
create or replace function reporting.business_day_on_or_after(p_tenant uuid, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select case when (select b.start_at from public.business_day_bounds(p_tenant, d.day) b) >= p_at then d.day else d.day + 1 end
    from (select public.business_day_of(p_tenant, p_at) as day) d
$$;
revoke all on function reporting.business_day_on_or_after(uuid, timestamptz) from public, anon;
grant execute on function reporting.business_day_on_or_after(uuid, timestamptz) to authenticated, service_role;

create or replace function reporting.profit_facts(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean)
returns table (
  fact text,
  day date,
  cents numeric,
  cents2 numeric,
  n bigint,
  tag text,
  flag boolean
)
language plpgsql
stable
set search_path = ''
as $fn$
declare
  -- ONE cutoff over the window (the usual case): a constant shift, no per-row lookup.
  v_cut interval := reporting.constant_cutoff(p_tenant, p_from, p_to);
begin
  return query execute $q$
  with live as (
    select f.order_id, f.placed_at, f.net_cents, f.collected_cents
    from reporting.order_figures($1, $2, $3, $4, $5) f
    where f.is_live
  ),
  -- Orders the ledger costs: any `sale` movement, whenever it was written.
  tracked as (
    select distinct m.order_id
    from public.stock_movements m
    where m.order_id = any (array(select l.order_id::text from live l))
      and m.tenant_id = $1
      and m.reason = 'sale'
  ),
  orders as (
    select
      l.order_id,
      (case when $6::interval is not null then ((l.placed_at at time zone 'Asia/Manila') - $6::interval)::date else public.business_day_of($1, l.placed_at) end) as day,
      l.net_cents,
      l.collected_cents,
      not exists (select 1 from tracked t where t.order_id = l.order_id::text) as uses_fallback
    from live l
  ),
  lines as (
    select i.id, i.order_id, i.menu_item_id, i.menu_item_name, coalesce(i.quantity, 0)::bigint as quantity
    from public.order_items i
    where i.order_id = any (array(select o.order_id from orders o))
  ),
  costs as (
    select c.order_item_id, c.unit_cost
    from public.order_item_costs c
    where c.order_item_id = any (array(select li.id from lines li))
  ),
  -- Usage movements created in the window (one index range scan).
  moves as (
    select m.created_at, m.quantity_delta, m.unit_cost, m.reason, m.order_id
    from public.stock_movements m
    where m.tenant_id = $1
      and m.created_at >= $2
      and m.created_at < $3
      and m.reason = any (array['sale', 'void', 'waste', 'stocktake'])
      and ($4 is null or m.outlet_id = $4)
      and (not coalesce($5, false) or m.outlet_id is null)
  ),
  -- The orders of those sale / void movements that are NOT live (the sales
  -- model's rule, reporting.order_figures.is_live), whenever they were
  -- placed: read BY KEY (orders_pkey), never a scan of orders. Their
  -- movements do not count, as their sales do not, so a cancel written in a
  -- later window cannot move the order's cost there. An order the caller
  -- cannot read (RLS) or that no longer exists counts as live.
  reversed as (
    select o.id::text as order_id
    from public.orders o
    where o.id = any (array(
        select distinct mv.order_id::uuid
        from moves mv
        where mv.reason = any (array['sale', 'void'])
          and mv.order_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ))
      and o.tenant_id = $1
      and not coalesce(
        lower(reporting.trim_text(coalesce(o.status, ''))) <> all (array['cancelled', 'canceled', 'refunded', 'voided'])
          and reporting.cents(o.total) >= 0,
        false
      )
  ),
  booked as (
    select e.outlet_id, e.amount_cents, e.spent_on, e.is_stock_purchase, c.grp
    from public.expenses e
    join public.expense_categories c on c.id = e.category_id
    where e.tenant_id = $1
      and e.status = 'recorded'
      and e.spent_on >= reporting.business_day_on_or_after($1, $2)
      and e.spent_on < reporting.business_day_on_or_after($1, $3)
  )
  select 'order'::text, o.day, o.net_cents, o.collected_cents, 1::bigint, null::text, o.uses_fallback
  from orders o
  union all
  select
    'line'::text,
    o.day,
    case when o.uses_fallback and c.unit_cost is not null then round(c.unit_cost * li.quantity * 100) else 0 end,
    0::numeric,
    li.quantity,
    case
      when li.menu_item_id is not null then 'id:' || li.menu_item_id::text
      else 'name:' || reporting.fold_name(li.menu_item_name)
    end,
    c.unit_cost is not null
  from lines li
  join orders o on o.order_id = li.order_id
  left join costs c on c.order_item_id = li.id
  union all
  select
    'movement'::text,
    (case when $6::interval is not null then ((m.created_at at time zone 'Asia/Manila') - $6::interval)::date else public.business_day_of($1, m.created_at) end),
    case when m.unit_cost is null then null else -round(m.quantity_delta * m.unit_cost * 100) end,
    0::numeric,
    1::bigint,
    m.reason,
    null::boolean
  from moves m
  where not (
    m.reason = any (array['sale', 'void'])
    and exists (select 1 from reversed r where r.order_id = m.order_id)
  )
  union all
  select 'expense'::text, b.spent_on, b.amount_cents::numeric, 0::numeric, 1::bigint, b.grp, b.is_stock_purchase
  from booked b
  where ($4 is null or b.outlet_id = $4)
    and (not coalesce($5, false) or b.outlet_id is null)
  union all
  select 'store_wide_expense'::text, b.spent_on, b.amount_cents::numeric, 0::numeric, 1::bigint, b.grp, false
  from booked b
  where $4 is not null
    and b.outlet_id is null
    and b.grp = any (array['ingredients', 'staff', 'occupancy', 'utilities', 'operating', 'admin', 'other'])
  union all
  select 'payout'::text, (case when $6::interval is not null then ((s.created_at at time zone 'Asia/Manila') - $6::interval)::date else public.business_day_of($1, s.created_at) end), reporting.cents(s.amount), 0::numeric, 1::bigint, null::text, null::boolean
  from public.shift_cash_movements s
  where s.tenant_id = $1
    and s.kind = 'pay_out'
    and s.created_at >= $2
    and s.created_at < $3
    and ($4 is null or s.outlet_id = $4)
    and (not coalesce($5, false) or s.outlet_id is null)
    and not exists (
      select 1 from public.expenses e where e.shift_cash_movement_id = s.id
    )
  $q$ using p_tenant, p_from, p_to, p_outlet, p_unassigned, v_cut;
end;
$fn$;


revoke all on function reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;

create or replace function public.report_expenses_by_category(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  category_id uuid,
  name text,
  icon text,
  category_group text,
  system_key text,
  cents bigint,
  stock_purchase_cents bigint,
  expenses bigint
)
language plpgsql
stable
set search_path = ''
as $fn$
begin
  perform reporting.assert_profit_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query execute $q$
  select
    c.id,
    c.name,
    c.icon,
    c.grp,
    c.system_key,
    sum(e.amount_cents)::bigint,
    coalesce(sum(e.amount_cents) filter (where e.is_stock_purchase), 0)::bigint,
    count(*)
  from public.expenses e
  join public.expense_categories c on c.id = e.category_id
  where e.tenant_id = $1
    and e.status = 'recorded'
    and e.spent_on >= reporting.business_day_on_or_after($1, $2)
    and e.spent_on < reporting.business_day_on_or_after($1, $3)
    and ($4 is null or e.outlet_id = $4)
    and (not coalesce($5, false) or e.outlet_id is null)
  group by c.id, c.name, c.icon, c.grp, c.system_key
  $q$ using p_tenant, p_from, p_to, p_outlet, p_unassigned;
end;
$fn$;

-- Rollback (manual): re-run reporting.profit_facts from 20261022130100 and
-- report_expenses_by_category from 20261022120300;
-- drop function if exists reporting.business_day_on_or_after(uuid, timestamptz);
