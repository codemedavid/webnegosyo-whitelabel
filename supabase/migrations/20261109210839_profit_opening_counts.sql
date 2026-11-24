-- Applied to platform 2026-11-10 as version 20261109210839 (file named to match;
-- it was 20261110120000, which pos_stock_block_server also uses).

-- Profit: stock counts that are not ingredient cost (Loly's Cafe, 2026-11-10).
--
-- The profit report summed every stocktake in the window as count variance
-- at frozen cost, gains included. Two kinds of count made ingredient cost
-- NEGATIVE, so gross profit read above sales:
--
--   * Opening stock. New ingredients get their "Opening stock" as a
--     `stocktake`, and owners fix a mistyped one minutes later. An opening of
--     500 Nachos x P50 read as P25,000 of stock "found": Loly's November
--     ingredient cost came out at -P21,385, gross profit P48,497 on P27,112
--     of sales (margin 178.9%). Pit Arson, Samlicious, Lueur, SofiasKitchen
--     and Uncle Drei had the same (P13k-P62k each, last 93 days).
--   * Restocking by counting. A store that buys eggs and counts them in
--     instead of recording a delivery showed each restock as a gain that
--     cancelled the eggs' cost (Pit Arson: P431k of count gains against P11.7k
--     of recipe cost).
--
-- Now: an opening count (on the shelf's baseline business day, no sale from
-- the shelf in between) is left out; back-to-back counts with nothing else
-- moving the shelf are one recount (Uncle Drei typed 2,997.51 kg and fixed it
-- 9 s later); and a recount that finds more gives back only what the shelf's
-- earlier counts took. Mirrored by profit-facts.ts
-- (isOpeningCount, recounts, countCosts) and held equal to the centavo by
-- tests/unit/reports/report-profit-parity.property.test.ts.
-- Same body as 20261107130050 apart from `moves` (+ item, branch), the count
-- CTEs (shelves .. walked) and the movement select's stocktake arms.

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
    select m.id, m.created_at, m.quantity_delta, m.reason, m.order_id, m.inventory_item_id, m.outlet_id
    from public.stock_movements m
    where m.tenant_id = $1
      and m.created_at >= $2
      and m.created_at < $3
      and m.reason = any (array['sale', 'void', 'waste', 'stocktake'])
      and ($4 is null or m.outlet_id = $4)
      and (not coalesce($5, false) or m.outlet_id is null)
  ),
  -- Stock counts (profit-facts.ts isOpeningCount + countCosts). A shelf is an
  -- item at one branch; its baseline is its first count, delivery or transfer
  -- in, whenever written. Only shelves a window count touched are read, each
  -- by idx_stock_movements_item.
  shelves as (
    select distinct mv.inventory_item_id, mv.outlet_id
    from moves mv
    where mv.reason = 'stocktake'
  ),
  bases as (
    select sh.inventory_item_id, sh.outlet_id, base.at
    from shelves sh
    cross join lateral (
      select b.created_at as at
      from public.stock_movements b
      where b.inventory_item_id = sh.inventory_item_id
        and b.tenant_id = $1
        and b.outlet_id is not distinct from sh.outlet_id
        and b.reason = any (array['stocktake', 'receive', 'transfer_in'])
      order by b.created_at
      limit 1
    ) base
  ),
  -- Those shelves' counts up to the window's end that MEASURE the shelf. An
  -- OPENING count (on the baseline's business day, no sale from the shelf in
  -- between: the "Opening stock" itself, or a fix to it) sets the shelf up and
  -- is left out: its delta is stock the ledger never knew, not a gain or loss.
  measured as (
    select c.id, c.created_at, c.quantity_delta, c.inventory_item_id, c.outlet_id
    from bases bs
    join public.stock_movements c
      on c.inventory_item_id = bs.inventory_item_id
     and c.tenant_id = $1
     and c.outlet_id is not distinct from bs.outlet_id
     and c.reason = 'stocktake'
     and c.created_at < $3
    where not (
      public.business_day_of($1, bs.at) = public.business_day_of($1, c.created_at)
      and not exists (
        select 1
        from public.stock_movements s
        where s.inventory_item_id = c.inventory_item_id
          and s.tenant_id = $1
          and s.outlet_id is not distinct from c.outlet_id
          and s.reason = 'sale'
          and s.created_at > bs.at
          and s.created_at < c.created_at
      )
    )
  ),
  -- Back-to-back counts of a shelf (nothing else moved it in between) are ONE
  -- recount ("2,997.51" typed, fixed to "0.51" nine seconds later): numbered
  -- runs, the last costed count of a run carries it.
  ccost as (
    select c.movement_id, c.unit_cost
    from inventory_private.movement_unit_costs($1, array(select ms.id from measured ms)) c
  ),
  priced as (
    select
      ms.id,
      ms.inventory_item_id,
      ms.outlet_id,
      ms.created_at,
      -round(ms.quantity_delta * cc.unit_cost * 100) as cents,
      lag(ms.created_at) over (partition by ms.inventory_item_id, ms.outlet_id order by ms.created_at, ms.id) as previous_at
    from measured ms
    left join ccost cc on cc.movement_id = ms.id
  ),
  runs as (
    select
      pr.*,
      sum(case
        when pr.previous_at is null then 1
        when exists (
          select 1
          from public.stock_movements o
          where o.inventory_item_id = pr.inventory_item_id
            and o.tenant_id = $1
            and o.outlet_id is not distinct from pr.outlet_id
            and o.reason <> 'stocktake'
            and o.created_at > pr.previous_at
            and o.created_at < pr.created_at
        ) then 1
        else 0
      end) over (partition by pr.inventory_item_id, pr.outlet_id order by pr.created_at, pr.id rows unbounded preceding) as run
    from priced pr
  ),
  carriers as (
    select
      r.inventory_item_id,
      r.outlet_id,
      r.run,
      (array_agg(r.id order by r.created_at desc, r.id desc) filter (where r.cents is not null))[1] as id,
      sum(r.cents) as cents
    from runs r
    group by r.inventory_item_id, r.outlet_id, r.run
    having count(r.cents) > 0
  ),
  -- A recount that finds less is a loss; one that finds more gives back what
  -- the shelf's earlier counts took, never more (the rest arrived without a
  -- delivery being recorded; the sales that used it were already costed). The
  -- shelf's balance of losses not yet given back is the running sum S floored
  -- at zero = S - least(0, min S so far); each recount costs its step. Counts
  -- written after the window never count, so a closed window never changes.
  sums as (
    select ca.*, sum(ca.cents) over shelf as total
    from carriers ca
    window shelf as (partition by ca.inventory_item_id, ca.outlet_id order by ca.run rows unbounded preceding)
  ),
  balances as (
    select su.*, su.total - least(0, min(su.total) over shelf) as balance
    from sums su
    window shelf as (partition by su.inventory_item_id, su.outlet_id order by su.run rows unbounded preceding)
  ),
  steps as (
    select
      bl.id,
      bl.balance - coalesce(lag(bl.balance) over (partition by bl.inventory_item_id, bl.outlet_id order by bl.run), 0) as cents
    from balances bl
  ),
  walked as (
    select r.id, case when r.cents is null then null else coalesce(st.cents, 0) end as cents
    from runs r
    left join steps st on st.id = r.id
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
    case
      when m.reason = 'stocktake' then (select w.cents from walked w where w.id = m.id)
      when mc.unit_cost is null then null
      else -round(m.quantity_delta * mc.unit_cost * 100)
    end,
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
    and (m.reason <> 'stocktake' or exists (select 1 from measured ms where ms.id = m.id))
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
