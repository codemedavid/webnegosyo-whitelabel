-- ===========================================================================
-- Profit report: a sale / void stock movement counts only while its order is
-- live (fix to 20261022120300_report_profit.sql; plan
-- docs/plans/2026-10-21-expense-tracker.md §2.2).
--
-- Before: reporting.profit_facts counted every sale / void movement by its
-- created_at whatever became of the order, while sales count only LIVE
-- orders. An order sold on the 30th and cancelled on the 3rd put its
-- ingredient cost in one month (with no sales) and the give-back in the next.
--
-- Now: the window's sale / void movements whose order is not live (the sales
-- model's rule: status not cancelled/canceled/refunded/voided and total ≥ 0,
-- exactly reporting.order_figures.is_live / isLiveOrder) are left out, in
-- both periods. A live order edited down keeps its void. Movements with no
-- order, or whose order the caller cannot read, still count.
--
-- Twin: src/lib/reports/profit-facts.ts (movementFacts). Parity:
-- tests/unit/reports/report-profit-parity.property.test.ts (generates orders
-- cancelled days after their sale).
--
-- Plan safety (the 2026-10-14 outage): the window's movements are read once
-- (tenant_id, created_at index) into `moves`; their orders are read BY KEY
-- with `o.id = any (array(select distinct …))` (orders_pkey; uuid equality is
-- leakproof, applied before RLS). No join over orders or order_items. Still
-- SECURITY INVOKER + RETURN QUERY EXECUTE … USING (a custom plan per call).
--
-- Only reporting.profit_facts changes: the public report_profit_* functions
-- and their grants are untouched (they call it by name).
--
-- NOT APPLIED by this file's author: the lead applies it after review, then
-- probes the function body (pg_get_functiondef contains 'reversed as').
-- ===========================================================================

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
      (l.placed_at at time zone 'Asia/Manila')::date as day,
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
      and e.spent_on >= reporting.manila_day_on_or_after($2)
      and e.spent_on < reporting.manila_day_on_or_after($3)
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
    (m.created_at at time zone 'Asia/Manila')::date,
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
  select 'payout'::text, (s.created_at at time zone 'Asia/Manila')::date, reporting.cents(s.amount), 0::numeric, 1::bigint, null::text, null::boolean
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
  $q$ using p_tenant, p_from, p_to, p_outlet, p_unassigned;
end;
$fn$;

-- Grants unchanged by CREATE OR REPLACE; restated so the file stands alone.
revoke all on function reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;

-- Rollback (manual): re-run the reporting.profit_facts definition from
-- 20261022120300_report_profit.sql.
