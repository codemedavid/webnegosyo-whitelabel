-- Cost secrecy, stage 1b: the profit report reads movement costs through the
-- definer helper from 20261107130000 (apply right after it).
--
-- reporting.profit_facts runs as the CALLER (SECURITY INVOKER, RLS applies), and
-- its `moves` CTE selected stock_movements.unit_cost, which the caller's role
-- will not be able to select after 20261107130100. Every public profit report
-- calls reporting.assert_profit_access first (Expenses + Costs keys and branch
-- scope), so routing the cost through inventory_private.movement_unit_costs
-- changes no one's access: ids come from the caller's own RLS-filtered `moves`,
-- and the helper re-checks the `costs` key and branch reach.
-- Same body as 20261027180000 apart from the `mcost` CTE and the movement select.
-- Parity: tests/unit/reports/report-profit-parity.property.test.ts loads this file.

set lock_timeout = '3s';

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
    select m.id, m.created_at, m.quantity_delta, m.reason, m.order_id
    from public.stock_movements m
    where m.tenant_id = $1
      and m.created_at >= $2
      and m.created_at < $3
      and m.reason = any (array['sale', 'void', 'waste', 'stocktake'])
      and ($4 is null or m.outlet_id = $4)
      and (not coalesce($5, false) or m.outlet_id is null)
  ),
  -- What each movement cost, from the costs-gated reader (the column itself is
  -- not selectable by the caller's role). Only ids the caller's RLS already
  -- let `moves` see go in; the reader re-checks costs and branch reach.
  mcost as (
    select c.movement_id, c.unit_cost
    from inventory_private.movement_unit_costs($1, array(select mv.id from moves mv)) c
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
    case when mc.unit_cost is null then null else -round(m.quantity_delta * mc.unit_cost * 100) end,
    0::numeric,
    1::bigint,
    m.reason,
    null::boolean
  from moves m
  left join mcost mc on mc.movement_id = m.id
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
