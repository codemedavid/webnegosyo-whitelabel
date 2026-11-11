-- ===========================================================================
-- Profit report functions (Phase 3 of docs/plans/2026-10-21-expense-tracker.md,
-- §2.2 and §5.3): Sales − Ingredients − Expenses = Profit.
--
-- The definitions live in TypeScript: src/lib/reports/profit-model.ts (the
-- dictionary) and profit-facts.ts (the twin of THIS file). Both turn a window
-- into the same facts and only add them up:
--   order    a live order: its net sales (reporting.order_figures, the one
--            sales definition) and what was collected; flag = it has no
--            `sale` stock movement at all, so its dishes are costed from
--            order_item_costs ("fallback") instead of the ledger.
--   line     a live order's line: quantity, dish key, whether it had a cost
--            at sale (coverage), and its fallback cost (0 when the ledger
--            costs the order) = round(unit_cost × quantity × 100).
--   movement a sale / void / waste / stocktake stock movement created in the
--            window: −round(quantity_delta × unit_cost × 100) at the FROZEN
--            cost, NULL when the movement has no cost (uncosted).
--   expense  a recorded expense whose spent_on (Manila) midnight is in the
--            window: amount, group, is_stock_purchase.
--   store_wide_expense  (one branch asked) a store-wide expense that reduces
--            profit but belongs to no branch: shown beside the figure.
--   payout   a drawer pay-out in the window with NO linked expense of any
--            status (contract §10: a voided drawer expense already put the
--            cash back with a pay_in and is never re-filed). Only `pay_out`
--            rows are read; drawer pay_in / collect never touch profit.
-- tests/unit/reports/report-profit-parity.property.test.ts runs this file and
-- the TypeScript over generated stores in PGlite and fails on one centavo.
--
-- Security (as report_sales_*, 20261014110000):
--   * SECURITY INVOKER: the caller's RLS decides which orders, lines, dish
--     costs, movements, expenses and pay-outs exist. Nothing is widened.
--   * reporting.assert_access (`reports`, range ≤ 93 days, branch args), then
--     `expenses` AND `costs` (42501). The service role is allowed.
--   * order_item_costs is readable by store-wide cost holders only, so a
--     branch-locked caller gets dish_costs_visible = false (coverage unknown,
--     no fallback cost) instead of a silently low figure.
--
-- Plan safety (the 2026-10-14 outage): every child table is read BY KEY —
-- order_items / order_item_costs / stock_movements(order_id) through
-- `= any (array(select …))` (index conditions, applied before RLS) — and the
-- window tables through their (tenant_id, created_at | spent_on) indexes. The
-- facts query is EXECUTEd so each call is planned with its real values.
--
-- NOT APPLIED by this file's author: the lead applies it after review.
-- Requires 20261022120000_expenses (expenses, expense_categories).
-- ===========================================================================

-- The first Manila day whose midnight is at or after p_at. An expense dated D
-- is in [p_from, p_to) when D's Manila midnight is: spent_on >= this(p_from)
-- and spent_on < this(p_to). Mirrors manilaDayOnOrAfter (profit-facts.ts).
create or replace function reporting.manila_day_on_or_after(p_at timestamptz)
returns date
language sql
stable
parallel safe
set search_path = ''
as $$
  select case when (x.d::timestamp at time zone 'Asia/Manila') >= p_at then x.d else x.d + 1 end
    from (select (p_at at time zone 'Asia/Manila')::date as d) x
$$;

-- reporting.assert_access plus the two money keys profit needs.
create or replace function reporting.assert_profit_access(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  if current_user <> 'service_role'
     and not (public.app_user_has_permission(p_tenant, 'expenses') and public.app_user_has_permission(p_tenant, 'costs')) then
    raise exception 'Profit needs the Expenses and Costs permissions.' using errcode = '42501';
  end if;
end;
$$;

-- Every fact in the window (see the header). No access check here: only the
-- public functions below call it, after reporting.assert_profit_access.
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
  from public.stock_movements m
  where m.tenant_id = $1
    and m.created_at >= $2
    and m.created_at < $3
    and m.reason = any (array['sale', 'void', 'waste', 'stocktake'])
    and ($4 is null or m.outlet_id = $4)
    and (not coalesce($5, false) or m.outlet_id is null)
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

-- ---------------------------------------------------------------------------
-- Public functions. Arguments as report_sales_*: p_tenant, half-open
-- [p_from, p_to) of at most 93 days, p_outlet (one branch) or p_unassigned
-- (orders with no branch + store-wide expenses).
-- ---------------------------------------------------------------------------

-- sumProfitFacts() (profit-facts.ts): one row.
create or replace function public.report_profit_summary(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  orders bigint,
  net_sales_cents bigint,
  collected_cents bigint,
  sale_movements bigint,
  ledger_cogs_cents bigint,
  fallback_cogs_cents bigint,
  fallback_orders bigint,
  waste_cents bigint,
  count_variance_cents bigint,
  uncosted_movements bigint,
  sold_quantity bigint,
  costed_quantity bigint,
  sold_dishes bigint,
  costed_dishes bigint,
  dish_costs_visible boolean,
  ingredients_cents bigint,
  ingredient_stock_cents bigint,
  staff_cents bigint,
  occupancy_cents bigint,
  utilities_cents bigint,
  operating_cents bigint,
  admin_cents bigint,
  other_cents bigint,
  capex_cents bigint,
  not_expense_cents bigint,
  expense_count bigint,
  store_wide_expense_cents bigint,
  unsorted_payouts bigint,
  unsorted_payout_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_profit_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query
  select
    count(*) filter (where f.fact = 'order'),
    coalesce(sum(f.cents) filter (where f.fact = 'order'), 0)::bigint,
    coalesce(sum(f.cents2) filter (where f.fact = 'order'), 0)::bigint,
    count(*) filter (where f.fact = 'movement' and f.tag = 'sale'),
    coalesce(sum(f.cents) filter (where f.fact = 'movement' and f.tag in ('sale', 'void')), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'line'), 0)::bigint,
    count(*) filter (where f.fact = 'order' and f.flag),
    coalesce(sum(f.cents) filter (where f.fact = 'movement' and f.tag = 'waste'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'movement' and f.tag = 'stocktake'), 0)::bigint,
    count(*) filter (where f.fact = 'movement' and f.cents is null),
    coalesce(sum(f.n) filter (where f.fact = 'line'), 0)::bigint,
    coalesce(sum(f.n) filter (where f.fact = 'line' and f.flag), 0)::bigint,
    count(distinct f.tag) filter (where f.fact = 'line'),
    count(distinct f.tag) filter (where f.fact = 'line' and f.flag),
    current_user = 'service_role' or public.app_user_may_reach_branch(p_tenant, null),
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'ingredients'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'ingredients' and f.flag), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'staff'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'occupancy'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'utilities'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'operating'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'admin'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'other'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'capex'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'not_expense'), 0)::bigint,
    count(*) filter (where f.fact = 'expense'),
    coalesce(sum(f.cents) filter (where f.fact = 'store_wide_expense'), 0)::bigint,
    count(*) filter (where f.fact = 'payout'),
    coalesce(sum(f.cents) filter (where f.fact = 'payout'), 0)::bigint
  from reporting.profit_facts(p_tenant, p_from, p_to, p_outlet, p_unassigned) f;
end;
$$;

-- sumProfitFactsByPeriod(): buckets of p_grain (Manila days; weeks start
-- Monday) that have any fact. The page adds the ingredient basis of the WHOLE
-- window, so the buckets add up to the summary.
create or replace function public.report_profit_by_period(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_grain text,
  p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  bucket text,
  orders bigint,
  net_sales_cents bigint,
  collected_cents bigint,
  sale_movements bigint,
  ledger_cogs_cents bigint,
  fallback_cogs_cents bigint,
  waste_cents bigint,
  count_variance_cents bigint,
  ingredient_direct_cents bigint,
  ingredient_stock_cents bigint,
  expenses_cents bigint,
  cash_out_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_profit_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  if p_grain is null or p_grain <> all (array['day', 'week', 'month']) then
    raise exception 'Unknown report grain: %', p_grain using errcode = '22023';
  end if;
  return query
  select
    case p_grain
      when 'day' then to_char(f.day, 'YYYY-MM-DD')
      when 'week' then to_char(date_trunc('week', f.day::timestamp), 'YYYY-MM-DD')
      else to_char(date_trunc('month', f.day::timestamp), 'YYYY-MM-DD')
    end as bucket,
    count(*) filter (where f.fact = 'order'),
    coalesce(sum(f.cents) filter (where f.fact = 'order'), 0)::bigint,
    coalesce(sum(f.cents2) filter (where f.fact = 'order'), 0)::bigint,
    count(*) filter (where f.fact = 'movement' and f.tag = 'sale'),
    coalesce(sum(f.cents) filter (where f.fact = 'movement' and f.tag in ('sale', 'void')), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'line'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'movement' and f.tag = 'waste'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'movement' and f.tag = 'stocktake'), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'ingredients' and not f.flag), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense' and f.tag = 'ingredients' and f.flag), 0)::bigint,
    coalesce(sum(f.cents) filter (
      where f.fact = 'expense' and f.tag in ('staff', 'occupancy', 'utilities', 'operating', 'admin', 'other')
    ), 0)::bigint,
    coalesce(sum(f.cents) filter (where f.fact = 'expense'), 0)::bigint
  from reporting.profit_facts(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
  group by 1
  order by 1;
end;
$$;

-- expensesByCategory(): recorded expenses in the window and branch, per
-- category (archived ones included: they are history).
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
    and e.spent_on >= reporting.manila_day_on_or_after($2)
    and e.spent_on < reporting.manila_day_on_or_after($3)
    and ($4 is null or e.outlet_id = $4)
    and (not coalesce($5, false) or e.outlet_id is null)
  group by c.id, c.name, c.icon, c.grp, c.system_key
  $q$ using p_tenant, p_from, p_to, p_outlet, p_unassigned;
end;
$fn$;

-- Grants: signed-in staff (gated inside) and the service role. Never anon.
revoke all on function reporting.manila_day_on_or_after(timestamptz) from public, anon;
revoke all on function reporting.assert_profit_access(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function reporting.manila_day_on_or_after(timestamptz) to authenticated, service_role;
grant execute on function reporting.assert_profit_access(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;

revoke all on function public.report_profit_summary(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.report_profit_by_period(uuid, timestamptz, timestamptz, text, uuid, boolean) from public, anon;
revoke all on function public.report_expenses_by_category(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.report_profit_summary(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function public.report_profit_by_period(uuid, timestamptz, timestamptz, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.report_expenses_by_category(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;

-- Rollback (manual):
--   drop function if exists public.report_expenses_by_category(uuid, timestamptz, timestamptz, uuid, boolean);
--   drop function if exists public.report_profit_by_period(uuid, timestamptz, timestamptz, text, uuid, boolean);
--   drop function if exists public.report_profit_summary(uuid, timestamptz, timestamptz, uuid, boolean);
--   drop function if exists reporting.profit_facts(uuid, timestamptz, timestamptz, uuid, boolean);
--   drop function if exists reporting.assert_profit_access(uuid, timestamptz, timestamptz, uuid, boolean);
--   drop function if exists reporting.manila_day_on_or_after(timestamptz);
