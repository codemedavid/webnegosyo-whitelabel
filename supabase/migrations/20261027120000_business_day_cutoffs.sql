-- ===========================================================================
-- Business day cutoff (P0 of docs/plans/cashier-remittance, 07-architecture §2).
--
-- A "business day" is the trading day a sale belongs to. Until now every
-- screen used the Manila calendar day, so a bar open until 2 AM split one
-- night's service across two days and reset order #01 mid-service.
--
--   business_day_cutoffs      effective-dated, store-wide: one row per change.
--                             NO ROW = Manila midnight, exactly today's day.
--   business_day_cutoff_for   the cutoff in effect for the day starting on D
--   business_day_of           the business day an instant belongs to
--   business_day_bounds       [start_at, end_at) of one business day
--   set_business_day_cutoff   the only writer (owner / `settings`)
--
-- Day D = [D + cutoff(D), D+1 + cutoff(D+1)) in Asia/Manila (fixed +08:00,
-- like src/lib/inventory/business-day.ts and the report allow-list), named
-- after the calendar date it starts on. Consecutive days tile exactly; a day
-- on which the cutoff changes is simply longer or shorter than 24 h. Past
-- days keep their bounds forever: a change only ever applies from a day that
-- has not started.
--
-- TS twin: src/lib/business-day/trading-day.ts (+ app copy). Change both.
-- Range: 00:00–11:45 in 15-minute steps (0..705 minutes).
-- Runner: tests/sql/run-business-day.cjs.
-- ===========================================================================

set lock_timeout = '3s';

create table if not exists public.business_day_cutoffs (
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  -- First business day that STARTS at this cutoff. Day d starts at d + cutoff_for(d).
  effective_from date not null,
  cutoff_minutes smallint not null,
  set_by         uuid references auth.users(id) on delete set null,
  set_by_name    text,
  set_at         timestamptz not null default now(),
  primary key (tenant_id, effective_from),
  constraint business_day_cutoffs_minutes_ck
    check (cutoff_minutes between 0 and 705 and cutoff_minutes % 15 = 0)
);

comment on table public.business_day_cutoffs is
  'Effective-dated business-day cutoff. No row = Manila midnight (the pre-2026-10-27 day). Written only by set_business_day_cutoff; a row whose day has started is never rewritten.';

alter table public.business_day_cutoffs enable row level security;

-- Members of the store, branch-locked staff included (their screens need the
-- day too). No client write policy: set_business_day_cutoff is the writer.
drop policy if exists business_day_cutoffs_read on public.business_day_cutoffs;
create policy business_day_cutoffs_read on public.business_day_cutoffs for select to authenticated
  using (exists (select 1 from public.app_users au
                  where au.user_id = auth.uid()
                    and (au.role = 'superadmin' or au.tenant_id = business_day_cutoffs.tenant_id)));

revoke all on public.business_day_cutoffs from anon, authenticated;
grant select on public.business_day_cutoffs to authenticated;
grant all on public.business_day_cutoffs to service_role;

-- The cutoff in effect for the day that STARTS on calendar date p_day.
-- SECURITY DEFINER: it reveals a time of day only, and triggers that run as
-- the cashier must never trip over RLS (or pay for it per row).
create or replace function public.business_day_cutoff_for(p_tenant uuid, p_day date)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => coalesce((
    select c.cutoff_minutes::integer
      from public.business_day_cutoffs c
     where c.tenant_id = p_tenant and c.effective_from <= p_day
     order by c.effective_from desc
     limit 1), 0));
$$;

-- Which business day an instant belongs to.
-- Why only two candidates: cutoff ∈ [0, 11:45], so start(c) ≤ c 11:45 < c+1 ≤
-- start(c+1) and start(c−1) < c 00:00. An instant whose Manila date is c is
-- therefore in day c or day c−1.
create or replace function public.business_day_of(p_tenant uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  with l as (select p_at at time zone 'Asia/Manila' as local_at)
  select case
           when l.local_at >= l.local_at::date + public.business_day_cutoff_for(p_tenant, l.local_at::date)
             then l.local_at::date
           else l.local_at::date - 1
         end
    from l;
$$;

-- Half-open [start_at, end_at) of one business day.
create or replace function public.business_day_bounds(
  p_tenant uuid, p_day date, out start_at timestamptz, out end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select (p_day + public.business_day_cutoff_for(p_tenant, p_day)) at time zone 'Asia/Manila',
         ((p_day + 1) + public.business_day_cutoff_for(p_tenant, p_day + 1)) at time zone 'Asia/Manila';
$$;

revoke all on function public.business_day_cutoff_for(uuid, date) from public, anon;
revoke all on function public.business_day_of(uuid, timestamptz) from public, anon;
revoke all on function public.business_day_bounds(uuid, date) from public, anon;
grant execute on function public.business_day_cutoff_for(uuid, date) to authenticated, service_role;
grant execute on function public.business_day_of(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.business_day_bounds(uuid, date) to authenticated, service_role;

-- "4:00 AM" — the cutoff as the owner reads it (activity titles).
create or replace function public.business_day_cutoff_label(p_minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_minutes = 0 then 'midnight'
              else ltrim(to_char(time '00:00' + make_interval(mins => p_minutes), 'HH12:MI'), '0') || ' AM' end;
$$;
revoke all on function public.business_day_cutoff_label(integer) from public, anon;
grant execute on function public.business_day_cutoff_label(integer) to authenticated, service_role;

-- The first business day a new cutoff may start on, decided at instant p_at.
-- Pure apart from reading the store's existing rows, so the runner can pin
-- every rule at fixed instants (set_business_day_cutoff passes now()).
--   * Tomorrow's business day: today's start never moves.
--   * p_today_closed: today's END must not move either, so one day later.
--   * A day whose new start would already be in the past moves one more day
--     out (at most twice).
create or replace function public.business_day_cutoff_starts_on(
  p_tenant uuid, p_cutoff_minutes integer, p_at timestamptz, p_today_closed boolean)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Manila';
  v_from date := public.business_day_of(p_tenant, p_at) + case when coalesce(p_today_closed, false) then 2 else 1 end;
begin
  while (v_from + make_interval(mins => p_cutoff_minutes)) <= v_local loop
    v_from := v_from + 1;
  end loop;
  return v_from;
end;
$$;
revoke all on function public.business_day_cutoff_starts_on(uuid, integer, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.business_day_cutoff_starts_on(uuid, integer, timestamptz, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- set_business_day_cutoff: the only writer. Returns the first business day
-- that starts at the new cutoff.
--
-- Who: the owner or a STORE-WIDE account holding `settings` (it sits beside
-- operating hours and moves every report). Not `cash_manage`. Superadmins
-- (support) pass through app_user_has_permission.
--
-- Rules (each pinned by tests/sql/run-business-day.cjs):
--   * Applies from tomorrow's business day (today's start never moves).
--   * If today is already closed (business_day_closes, wave 3), its END must
--     not move either: start one day later.
--   * Never let a day that has already begun change its start: a cutoff whose
--     new start would be in the past moves one more day out (at most twice).
--   * A newer decision replaces every later pending one (those days have not
--     started). A change back to the cutoff already in effect leaves no row.
--   * Only Asia/Manila stores (the first non-PH store fails loudly instead of
--     being mis-bucketed).
-- ---------------------------------------------------------------------------
create or replace function public.set_business_day_cutoff(p_tenant uuid, p_cutoff_minutes integer)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_zone text;
  v_today date;
  v_from date;
  v_before integer;
  v_prior integer;
  v_closed boolean := false;
  v_name text;
begin
  if p_tenant is null or p_cutoff_minutes is null then
    raise exception 'A business day cutoff needs a store and a time.' using errcode = '22023';
  end if;
  if v_uid is null
     or not public.app_user_has_permission(p_tenant, 'settings')
     or not exists (
       select 1 from public.app_users au
        where au.user_id = v_uid
          and (au.role = 'superadmin'
               or (au.tenant_id = p_tenant and (au.outlet_id is null or coalesce(au.is_owner, false))))
     ) then
    raise exception 'Changing when the business day ends needs the Settings permission on a store-wide account.'
      using errcode = '42501';
  end if;
  if p_cutoff_minutes not between 0 and 705 or p_cutoff_minutes % 15 <> 0 then
    raise exception 'The business day can end between midnight and 11:45 AM, in 15-minute steps.'
      using errcode = '22023';
  end if;
  select t.timezone into v_zone from public.tenants t where t.id = p_tenant;
  if not found then
    raise exception 'Store not found.' using errcode = 'P0002';
  end if;
  if coalesce(v_zone, 'Asia/Manila') <> 'Asia/Manila' then
    raise exception 'Business day cutoffs support stores in Asia/Manila only.' using errcode = '22023';
  end if;

  -- One writer at a time per store: two owners saving at once must not
  -- interleave the delete/insert below.
  perform pg_advisory_xact_lock(hashtextextended('bday-cutoff:' || p_tenant::text, 0));

  v_today := public.business_day_of(p_tenant, now());
  -- A closed day keeps its end (business_day_closes arrives in a later wave;
  -- looked up dynamically so this function needs no redefinition then).
  if to_regclass('public.business_day_closes') is not null then
    execute 'select exists (select 1 from public.business_day_closes d
                             where d.tenant_id = $1 and d.business_day = $2 and d.status = ''closed'')'
      into v_closed using p_tenant, v_today;
  end if;
  v_from := public.business_day_cutoff_starts_on(p_tenant, p_cutoff_minutes, now(), v_closed);

  v_before := extract(epoch from public.business_day_cutoff_for(p_tenant, v_from))::integer / 60;
  -- Pending decisions (days that have not started) are replaced.
  delete from public.business_day_cutoffs c where c.tenant_id = p_tenant and c.effective_from >= v_from;
  v_prior := extract(epoch from public.business_day_cutoff_for(p_tenant, v_from))::integer / 60;

  v_name := (select left(nullif(btrim(coalesce(nullif(btrim(au.display_name), ''), split_part(coalesce(au.email, ''), '@', 1))), ''), 80)
               from public.app_users au where au.user_id = v_uid limit 1);
  if v_prior <> p_cutoff_minutes then
    insert into public.business_day_cutoffs (tenant_id, effective_from, cutoff_minutes, set_by, set_by_name, set_at)
    values (p_tenant, v_from, p_cutoff_minutes, v_uid, v_name, now());
  end if;

  if v_before <> p_cutoff_minutes then
    perform public.store_activity_record(
      p_tenant_id => p_tenant, p_kind => 'settings.changed',
      p_event_key => 'business_day_cutoffs:' || p_tenant::text || ':' || gen_random_uuid()::text,
      p_source_table => 'business_day_cutoffs', p_source_id => p_tenant::text || ':' || v_from::text,
      p_occurred_at => now(), p_actor_user_id => v_uid, p_actor_name => v_name,
      p_subject_type => 'setting', p_subject_ref => 'business_day_cutoff',
      p_before => jsonb_build_object('businessDayCutoffMinutes', v_before),
      p_after => jsonb_build_object('businessDayCutoffMinutes', p_cutoff_minutes, 'effectiveFrom', v_from),
      p_summary => jsonb_build_object(
        'title', 'Business day now ends at ' || public.business_day_cutoff_label(p_cutoff_minutes)
                 || ', from ' || to_char(v_from, 'FMDy FMDD FMMon'),
        'changedKeys', jsonb_build_array('businessDayCutoffMinutes')));
  end if;
  return v_from;
end;
$$;

comment on function public.set_business_day_cutoff(uuid, integer) is
  'Owner / store-wide `settings`: the business day ends at p_cutoff_minutes (0..705, 15-min steps) from the returned day on. Never moves a day that has started or a closed day''s end; replaces pending changes.';

revoke all on function public.set_business_day_cutoff(uuid, integer) from public, anon;
grant execute on function public.set_business_day_cutoff(uuid, integer) to authenticated, service_role;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop function if exists public.set_business_day_cutoff(uuid, integer);
-- drop function if exists public.business_day_cutoff_starts_on(uuid, integer, timestamptz, boolean);
-- drop function if exists public.business_day_cutoff_label(integer);
-- drop function if exists public.business_day_bounds(uuid, date);
-- drop function if exists public.business_day_of(uuid, timestamptz);
-- drop function if exists public.business_day_cutoff_for(uuid, date);
-- drop table if exists public.business_day_cutoffs;
