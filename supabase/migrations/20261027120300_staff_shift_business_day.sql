-- ===========================================================================
-- Shifts know their business day, blind snapshot, named shift and counts
-- (P0 of docs/plans/cashier-remittance, CONTRACTS.md §2, 07 §4.1).
--
-- New staff_shifts columns:
--   business_day           the business day the shift OPENED in. Stamped by
--                          the server at insert (business_day_of), pinned.
--                          Service-role imports may supply their own.
--   is_blind               tenant_cash_settings.blind_close at clock-in.
--                          Changing the setting never alters a running shift.
--   service_period_id      the named shift picked at clock-in (same store,
--                          the shift's branch or every branch, not archived).
--   opening_denominations  the float, counted bill by bill (optional)
--   close_kind             'counted' | 'forced' (forced arrives with the
--                          close RPCs; today every close is 'counted')
--   closing_denominations  the count, bill by bill (optional)
--   closing_non_cash       [{method, declaredCents, slipCount}] declared tallies
--   device_expected_cash   what the register computed (kept beside the server's)
--   variance_reason        reason chip key (CONTRACTS §6)
--
-- cash.denominations_total_cents(jsonb): the drawer count's total, NULL when
-- invalid. TS twin src/lib/cash/denominations.ts (+ app copy); shared cases
-- in tests/fixtures/cash-denominations-cases.json.
--
-- Old app builds keep working: a direct INSERT / UPDATE without the new
-- columns is stamped and accepted (no blind guard yet — wave 2 adds it with
-- the close RPCs). Runner: tests/sql/run-shift-business-day.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Denominations. Keys (b = bill, c = coin, value in pesos, 025 = 25¢):
--   b1000 b500 b200 b100 b50 b20 c20 c10 c5 c1 c025 c005 c001
-- each a whole number of pieces 0..100000, plus optional loose_coins_cents
-- (whole centavos 0..10000000 = ₱100,000). Anything else → NULL (invalid).
-- ---------------------------------------------------------------------------
create or replace function cash.denominations_total_cents(p_counts jsonb)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_faces constant jsonb := '{"b1000":100000,"b500":50000,"b200":20000,"b100":10000,"b50":5000,"b20":2000,
                              "c20":2000,"c10":1000,"c5":500,"c1":100,"c025":25,"c005":5,"c001":1}';
  v_key text;
  v_value jsonb;
  v_n numeric;
  v_total bigint := 0;
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    return null;
  end if;
  for v_key, v_value in select e.key, e.value from jsonb_each(p_counts) e loop
    if jsonb_typeof(v_value) <> 'number' then
      return null;
    end if;
    v_n := (v_value #>> '{}')::numeric;
    if v_n <> trunc(v_n) or v_n < 0 then
      return null;
    end if;
    if v_key = 'loose_coins_cents' then
      if v_n > 10000000 then
        return null;
      end if;
      v_total := v_total + v_n::bigint;
    elsif v_faces ? v_key then
      if v_n > 100000 then
        return null;
      end if;
      v_total := v_total + v_n::bigint * (v_faces ->> v_key)::bigint;
    else
      return null;
    end if;
  end loop;
  return v_total;
end;
$$;

comment on function cash.denominations_total_cents(jsonb) is
  'Total in centavos of a drawer count {"b1000":n,…,"c001":n,"loose_coins_cents":n}; NULL if any key/value is invalid. Twin: src/lib/cash/denominations.ts countTotalCents.';
revoke all on function cash.denominations_total_cents(jsonb) from public, anon;
grant execute on function cash.denominations_total_cents(jsonb) to authenticated, service_role;

-- Declared non-cash tallies: [{method, declaredCents, slipCount?}], ≤ 20 rows.
create or replace function cash.non_cash_tallies_valid(p_tallies jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_tallies) = 'array'
     and jsonb_array_length(p_tallies) <= 20
     and not exists (
       select 1 from jsonb_array_elements(p_tallies) t
        where jsonb_typeof(t) <> 'object'
           or exists (select 1 from jsonb_object_keys(t) k where k not in ('method', 'declaredCents', 'slipCount'))
           or jsonb_typeof(t -> 'method') is distinct from 'string'
           or char_length(btrim(t ->> 'method')) not between 1 and 60
           or cash.json_whole(t -> 'declaredCents') is null
           or cash.json_whole(t -> 'declaredCents') not between 0 and 10000000000
           or (t ? 'slipCount' and coalesce(cash.json_whole(t -> 'slipCount') not between 0 and 100000, true)));
$$;
revoke all on function cash.non_cash_tallies_valid(jsonb) from public, anon;
grant execute on function cash.non_cash_tallies_valid(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Columns + backfill. Replica mode: the backfill touches closed rows, which
-- the custody trigger rightly refuses, and must not file activity.
-- ---------------------------------------------------------------------------
alter table public.staff_shifts
  add column if not exists business_day date,
  add column if not exists is_blind boolean not null default false,
  add column if not exists close_kind text,
  add column if not exists opening_denominations jsonb,
  add column if not exists closing_denominations jsonb,
  add column if not exists closing_non_cash jsonb,
  add column if not exists device_expected_cash numeric(12,2),
  add column if not exists service_period_id uuid references public.service_periods(id) on delete restrict,
  add column if not exists variance_reason text;

set session_replication_role = replica;
-- No cutoff existed before this migration, so business_day_of = the Manila date.
update public.staff_shifts s
   set business_day = public.business_day_of(s.tenant_id, s.opened_at)
 where s.business_day is null;
update public.staff_shifts s
   set close_kind = 'counted'
 where s.status = 'closed' and s.close_kind is null;
set session_replication_role = origin;

alter table public.staff_shifts alter column business_day set not null;

do $$ begin
  alter table public.staff_shifts add constraint staff_shifts_close_kind_ck check (
    (status = 'open' and close_kind is null)
    or (status = 'closed' and close_kind = 'counted' and closing_count is not null)
    or (status = 'closed' and close_kind = 'forced' and char_length(btrim(coalesce(note, ''))) > 0));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.staff_shifts add constraint staff_shifts_variance_reason_ck check (
    variance_reason is null or variance_reason in (
      'wrong_change', 'unrecorded_pay_out', 'counting_mistake', 'customer_paid_less', 'not_sure',
      'customer_left_extra', 'unrecorded_pay_in'));
exception when duplicate_object then null; end $$;

create index if not exists idx_staff_shifts_tenant_day on public.staff_shifts (tenant_id, business_day desc);
create index if not exists idx_staff_shifts_open on public.staff_shifts (opened_at) where status = 'open';

comment on column public.staff_shifts.business_day is 'The business day the shift opened in (business_day_of at insert, server-stamped, pinned).';
comment on column public.staff_shifts.is_blind is 'tenant_cash_settings.blind_close at clock-in. The cashier counts without seeing expected cash.';
comment on column public.staff_shifts.service_period_id is 'Named shift picked at clock-in (service_periods).';

-- ---------------------------------------------------------------------------
-- trg_staff_shift_zz_business_day: runs after every other BEFORE trigger
-- (alphabetical), so it sees the drawer snapshot's float and the server clock.
-- SECURITY INVOKER: reads tenant_cash_settings / service_periods as the
-- writer (members of the store may read both).
-- ---------------------------------------------------------------------------
create or replace function public.staff_shift_business_day_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total bigint;
  v_period public.service_periods%rowtype;
begin
  if tg_op = 'INSERT' then
    -- The server decides the day; an import (service role) may keep its own.
    if current_user in ('anon', 'authenticated') or new.business_day is null then
      new.business_day := public.business_day_of(new.tenant_id, new.opened_at);
    end if;
    new.is_blind := coalesce((select s.blind_close from public.tenant_cash_settings s where s.tenant_id = new.tenant_id), false);
    -- Close-time facts cannot be born with the shift.
    new.close_kind := null;
    new.closing_denominations := null;
    new.closing_non_cash := null;
    new.device_expected_cash := null;
    new.variance_reason := null;
    if new.service_period_id is not null then
      select * into v_period from public.service_periods p where p.id = new.service_period_id;
      if not found or v_period.tenant_id <> new.tenant_id
         or (v_period.outlet_id is not null and v_period.outlet_id is distinct from new.outlet_id) then
        raise exception 'That shift belongs to a different store or branch.' using errcode = '23503';
      end if;
      if v_period.archived_at is not null then
        raise exception 'That shift was removed. Pick another one.' using errcode = '23514';
      end if;
    end if;
    if new.opening_denominations is not null then
      v_total := cash.denominations_total_cents(new.opening_denominations);
      if v_total is null then
        raise exception 'The bill count is not valid.' using errcode = '22023';
      end if;
      if v_total <> round(new.opening_float * 100) then
        raise exception 'The bills counted do not add up to the starting cash.' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE (custody already pinned everything that must not move).
  if old.status = 'open' and new.status = 'closed' then
    -- Every close today is a count; a forced close comes with its own RPC.
    if current_user in ('anon', 'authenticated') or new.close_kind is null then
      new.close_kind := 'counted';
    end if;
    if new.closing_denominations is not null then
      v_total := cash.denominations_total_cents(new.closing_denominations);
      if v_total is null then
        raise exception 'The bill count is not valid.' using errcode = '22023';
      end if;
      if new.closing_count is not null and v_total <> round(new.closing_count * 100) then
        raise exception 'The bills counted do not add up to the counted cash.' using errcode = '22023';
      end if;
    end if;
    if new.closing_non_cash is not null and not cash.non_cash_tallies_valid(new.closing_non_cash) then
      raise exception 'The card and e-wallet tallies are not valid.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_staff_shift_zz_business_day on public.staff_shifts;
create trigger trg_staff_shift_zz_business_day before insert or update on public.staff_shifts
  for each row execute function public.staff_shift_business_day_stamp();

-- ---------------------------------------------------------------------------
-- Custody (20261001120000 body) + pins on the new clock-in facts, and the
-- close-time facts cannot be written while the shift stays open.
-- ---------------------------------------------------------------------------
create or replace function public.protect_staff_shift_custody()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Preserve the name snapshot when auth.users removes the referenced account.
  if (new.staff_user_id is null and old.staff_user_id is not null
      or new.closed_by is null and old.closed_by is not null)
    and (to_jsonb(new) - 'staff_user_id' - 'closed_by') = (to_jsonb(old) - 'staff_user_id' - 'closed_by') then
    return new;
  end if;
  if old.status = 'closed' or new.tenant_id is distinct from old.tenant_id
    or new.outlet_id is distinct from old.outlet_id
    or new.staff_user_id is distinct from old.staff_user_id
    or new.opened_at is distinct from old.opened_at
    or new.opening_float is distinct from old.opening_float
    or new.drawer_id is distinct from old.drawer_id
    or new.drawer_name is distinct from old.drawer_name
    or new.is_zero_balance is distinct from old.is_zero_balance
    or new.business_day is distinct from old.business_day
    or new.is_blind is distinct from old.is_blind
    or new.service_period_id is distinct from old.service_period_id
    or new.opening_denominations is distinct from old.opening_denominations then
    raise exception 'Shift custody cannot be changed';
  end if;
  if new.status = 'open' and (
       new.close_kind is distinct from old.close_kind
    or new.closing_denominations is distinct from old.closing_denominations
    or new.closing_non_cash is distinct from old.closing_non_cash
    or new.device_expected_cash is distinct from old.device_expected_cash
    or new.variance_reason is distinct from old.variance_reason) then
    raise exception 'Shift custody cannot be changed';
  end if;
  if new.status = 'closed' and (new.expected_cash is null or new.closing_count is null) then
    raise exception 'Closing a shift requires the expected cash and counted cash';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- re-create protect_staff_shift_custody from 20261001120000;
-- drop trigger if exists trg_staff_shift_zz_business_day on public.staff_shifts;
-- drop function if exists public.staff_shift_business_day_stamp();
-- drop index if exists idx_staff_shifts_tenant_day; drop index if exists idx_staff_shifts_open;
-- alter table public.staff_shifts drop constraint if exists staff_shifts_close_kind_ck,
--   drop constraint if exists staff_shifts_variance_reason_ck,
--   drop column if exists business_day, drop column if exists is_blind, drop column if exists close_kind,
--   drop column if exists opening_denominations, drop column if exists closing_denominations,
--   drop column if exists closing_non_cash, drop column if exists device_expected_cash,
--   drop column if exists service_period_id, drop column if exists variance_reason;
-- drop function if exists cash.non_cash_tallies_valid(jsonb);
-- drop function if exists cash.denominations_total_cents(jsonb);
