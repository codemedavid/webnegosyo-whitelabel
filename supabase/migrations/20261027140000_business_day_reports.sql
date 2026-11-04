-- ===========================================================================
-- Report day / week / month buckets follow the business day
-- (P3 of docs/plans/cashier-remittance, CONTRACTS W2.2, 07 §2.5).
--
-- report_sales_by_period: 'day' / 'week' / 'month' bucket an order by
-- business_day_of(store, placed_at) instead of its Manila calendar date;
-- 'hour' stays wall clock. report_sales_by_hour: the weekday is the business
-- day's ISO weekday (a 1 AM Saturday sale in a 4 AM store is Friday's), the
-- hour stays wall clock. With no cutoff rows both answer exactly as before.
--
-- Twin: rollupPeriods / rollupHours (src/lib/reports/sales-breakdowns.ts) with
-- the schedule; tests/unit/reports/report-sql-parity.property.test.ts runs
-- random schedules.
--
-- Speed: a window with ONE cutoff in effect (the overwhelming case) buckets
-- with a constant shift, ((placed_at at Manila) − cutoff)::date — the same
-- day as business_day_of for a constant cutoff — so the per-order work stays
-- an expression. Only a window that spans a cutoff change looks each order up.
-- ===========================================================================

set lock_timeout = '3s';

-- The cutoff when ONE is in effect for every day an order in [p_from, p_to)
-- could belong to; NULL when the window spans a change.
create or replace function reporting.constant_cutoff(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns interval
language sql
stable
set search_path = ''
as $$
  select case when count(distinct c) = 1 then min(c) end
    from (
      select public.business_day_cutoff_for(p_tenant, d::date) as c
        from generate_series((p_from at time zone 'Asia/Manila')::date - 1,
                             (p_to at time zone 'Asia/Manila')::date, interval '1 day') d
    ) x
$$;
revoke all on function reporting.constant_cutoff(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function reporting.constant_cutoff(uuid, timestamptz, timestamptz) to authenticated, service_role;

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
declare
  v_cut interval;
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  if p_grain is null or p_grain <> all (array['hour', 'day', 'week', 'month']) then
    raise exception 'Unknown report grain: %', p_grain using errcode = '22023';
  end if;
  -- Every store trades in Manila (fixed +08:00). An allow-list, not
  -- pg_timezone_names: that view reads the zone files on every call.
  if p_tz is null or p_tz <> all (array['Asia/Manila']) then
    raise exception 'Unsupported time zone: %', p_tz using errcode = '22023';
  end if;
  if p_grain <> 'hour' then
    v_cut := reporting.constant_cutoff(p_tenant, p_from, p_to);
  end if;
  return query
  with local as (
    select f.*, f.placed_at at time zone p_tz as local_at,
           case when p_grain = 'hour' then null::date
                when v_cut is not null then ((f.placed_at at time zone p_tz) - v_cut)::date
                else public.business_day_of(p_tenant, f.placed_at) end as bd
    from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
    where f.is_live
  )
  select
    case p_grain
      when 'hour' then to_char(l.local_at, 'YYYY-MM-DD"T"HH24')
      when 'day' then to_char(l.bd, 'YYYY-MM-DD')
      when 'week' then to_char(date_trunc('week', l.bd::timestamp), 'YYYY-MM-DD')
      else to_char(date_trunc('month', l.bd::timestamp), 'YYYY-MM-DD')
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
declare
  v_cut interval;
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  if p_tz is null or p_tz <> all (array['Asia/Manila']) then
    raise exception 'Unsupported time zone: %', p_tz using errcode = '22023';
  end if;
  v_cut := reporting.constant_cutoff(p_tenant, p_from, p_to);
  return query
  select
    extract(isodow from case when v_cut is not null then ((f.placed_at at time zone p_tz) - v_cut)::date
                             else public.business_day_of(p_tenant, f.placed_at) end)::integer,
    extract(hour from f.placed_at at time zone p_tz)::integer,
    count(*),
    sum(f.net_cents)::bigint
  from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
  where f.is_live
  group by 1, 2
  order by 1, 2;
end;
$$;

comment on function public.report_sales_by_period(uuid, timestamptz, timestamptz, text, uuid, boolean, text) is
  'Live orders per bucket; day/week/month by business day (business_day_cutoffs), hour by wall clock. 20261027140000.';
comment on function public.report_sales_by_hour(uuid, timestamptz, timestamptz, uuid, boolean, text) is
  'Live orders by business-day ISO weekday × wall-clock hour. 20261027140000.';

-- ===========================================================================
-- Rollback (manual): re-create both functions from 20261014110000 and
-- drop function if exists reporting.constant_cutoff(uuid, timestamptz, timestamptz);
-- ===========================================================================
