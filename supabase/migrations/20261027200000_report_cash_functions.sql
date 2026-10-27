-- ===========================================================================
-- Cash reports: every shift's drawer, and over / short per cashier
-- (P8 of docs/plans/cashier-remittance, CONTRACTS W3.1, 07 §7.6).
--
--   report_cash_summary(p_tenant, p_from_day, p_to_day, p_outlet)
--       one row per shift whose business day is in [from_day, to_day]:
--       expected (frozen) vs counted, first vs final count, the remittance.
--   report_cash_by_staff(p_tenant, p_from_day, p_to_day, p_outlet)
--       per cashier: shifts, short / over counts, the over-short total,
--       forced closes, recounts that changed the figure.
--
-- SECURITY INVOKER: row-level security decides which shifts exist for the
-- caller (a branch-locked account reads its own branch whatever p_outlet
-- says). The caller also needs cash_manage (42501): over / short is staff
-- performance, not sales. Inclusive day range of at most 93 days. Reads go by
-- idx_staff_shifts_tenant_day; children by shift id (pk / unique indexes).
-- Runner: tests/sql/run-report-cash.cjs.
-- ===========================================================================

set lock_timeout = '3s';

create or replace function reporting.assert_cash_report_access(p_tenant uuid, p_from_day date, p_to_day date, p_outlet uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_tenant is null or p_from_day is null or p_to_day is null then
    raise exception 'A cash report needs a store and a day range.' using errcode = '22023';
  end if;
  if p_to_day < p_from_day then
    raise exception 'A cash report''s range must end on or after it starts.' using errcode = '22023';
  end if;
  if p_to_day - p_from_day >= 93 then
    raise exception 'A cash report covers at most 93 days.' using errcode = '22023';
  end if;
  if current_user <> 'service_role' and not public.app_user_manages_cash(p_tenant) then
    raise exception 'Cash reports need the Cash & day close permission.' using errcode = '42501';
  end if;
  if p_outlet is not null and not exists (select 1 from public.outlets o where o.id = p_outlet and o.tenant_id = p_tenant) then
    raise exception 'That branch belongs to a different store.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function reporting.assert_cash_report_access(uuid, date, date, uuid) from public, anon;
grant execute on function reporting.assert_cash_report_access(uuid, date, date, uuid) to authenticated, service_role;

create or replace function public.report_cash_summary(
  p_tenant uuid, p_from_day date, p_to_day date, p_outlet uuid default null
)
returns table (
  shift_id uuid,
  business_day date,
  outlet_id uuid,
  staff_user_id uuid,
  staff_name text,
  drawer_name text,
  status text,
  close_kind text,
  is_blind boolean,
  opened_at timestamptz,
  closed_at timestamptz,
  float_cents bigint,
  expected_cents bigint,
  expected_source text,
  counted_cents bigint,
  difference_cents bigint,
  first_count_cents bigint,
  final_count_cents bigint,
  count_attempts integer,
  recount_changed boolean,
  variance_reason text,
  remittance_id uuid,
  remittance_status text,
  handed_over_cents bigint,
  received_cents bigint,
  received_by_name text,
  discrepancy_cents bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_cash_report_access(p_tenant, p_from_day, p_to_day, p_outlet);
  return query
  select
    s.id, s.business_day, s.outlet_id, s.staff_user_id, s.staff_name, s.drawer_name, s.status, s.close_kind, s.is_blind,
    s.opened_at, s.closed_at,
    round(s.opening_float * 100)::bigint,
    coalesce(e.expected_cents, round(s.expected_cash * 100)::bigint),
    coalesce(e.source, case when s.expected_cash is null then 'none' else 'device' end),
    round(s.closing_count * 100)::bigint,
    round(s.closing_count * 100)::bigint - coalesce(e.expected_cents, round(s.expected_cash * 100)::bigint),
    c1.counted_cents,
    coalesce(c2.counted_cents, c1.counted_cents),
    (case when c2.id is not null then 2 when c1.id is not null then 1 else 0 end)::integer,
    coalesce(c2.counted_cents is distinct from c1.counted_cents and c2.id is not null, false),
    s.variance_reason,
    r.id, r.status, r.handed_over_cents, r.received_cents, r.received_by_name,
    case when r.received_cents is not null and r.handed_over_cents is not null then r.received_cents - r.handed_over_cents end
  from public.staff_shifts s
  left join public.shift_expectations e on e.shift_id = s.id
  left join public.shift_counts c1 on c1.shift_id = s.id and c1.attempt = 1
  left join public.shift_counts c2 on c2.shift_id = s.id and c2.attempt = 2
  left join public.cash_remittances r on r.shift_id = s.id and r.kind = 'shift'
  where s.tenant_id = p_tenant
    and s.business_day between p_from_day and p_to_day
    and (p_outlet is null or s.outlet_id = p_outlet)
  order by s.business_day desc, s.opened_at desc, s.id;
end;
$$;
comment on function public.report_cash_summary(uuid, date, date, uuid) is
  'One row per shift in the business-day range: frozen expected vs counted, first vs final count, remittance. INVOKER (RLS) + cash_manage; ≤ 93 days.';

create or replace function public.report_cash_by_staff(
  p_tenant uuid, p_from_day date, p_to_day date, p_outlet uuid default null
)
returns table (
  staff_user_id uuid,
  staff_name text,
  shifts bigint,
  counted_shifts bigint,
  short_count bigint,
  over_count bigint,
  over_short_cents bigint,
  short_cents bigint,
  over_cents bigint,
  forced_closes bigint,
  recount_changed bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_cash_report_access(p_tenant, p_from_day, p_to_day, p_outlet);
  return query
  select
    (array_agg(x.staff_user_id) filter (where x.staff_user_id is not null))[1],
    (array_agg(x.staff_name order by x.opened_at desc))[1],
    count(*),
    count(*) filter (where x.difference_cents is not null),
    count(*) filter (where x.difference_cents < 0),
    count(*) filter (where x.difference_cents > 0),
    coalesce(sum(x.difference_cents), 0)::bigint,
    coalesce(sum(-x.difference_cents) filter (where x.difference_cents < 0), 0)::bigint,
    coalesce(sum(x.difference_cents) filter (where x.difference_cents > 0), 0)::bigint,
    count(*) filter (where x.close_kind = 'forced'),
    count(*) filter (where x.recount_changed)
  from public.report_cash_summary(p_tenant, p_from_day, p_to_day, p_outlet) x
  where x.status = 'closed'
  -- A removed account keeps its rows under its name snapshot.
  group by coalesce(x.staff_user_id::text, 'name:' || coalesce(x.staff_name, ''))
  order by 7, 2;
end;
$$;
comment on function public.report_cash_by_staff(uuid, date, date, uuid) is
  'Per cashier over closed shifts in the range: shifts, short/over counts and totals, forced closes, recounts that changed the figure. INVOKER + cash_manage; ≤ 93 days.';

revoke all on function public.report_cash_summary(uuid, date, date, uuid) from public, anon;
revoke all on function public.report_cash_by_staff(uuid, date, date, uuid) from public, anon;
grant execute on function public.report_cash_summary(uuid, date, date, uuid) to authenticated, service_role;
grant execute on function public.report_cash_by_staff(uuid, date, date, uuid) to authenticated, service_role;

-- Rollback (manual):
-- drop function if exists public.report_cash_by_staff(uuid, date, date, uuid), public.report_cash_summary(uuid, date, date, uuid),
--   reporting.assert_cash_report_access(uuid, date, date, uuid);
