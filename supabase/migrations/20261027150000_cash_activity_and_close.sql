-- ===========================================================================
-- End shift v2: count once, see the result, recount once, close
-- (P4 of docs/plans/cashier-remittance, CONTRACTS W2.1 / W2.2, 07 §3.6, §4, §7.4).
--
--   shift_counts           append-only: every count attempt (1, then one recount)
--   staff_shifts.float_kept_cents  cash left in the drawer for the next shift
--   open_shift             INVOKER. Joins the caller's running shift, refuses a
--                          STALE one (past its business day + overdue grace),
--                          else opens; hands over what the previous shift on the
--                          drawer left in it.
--   preview_shift_close    DEFINER. The live expected figure — hidden from a
--                          cashier on a blind shift until they have counted.
--   count_shift            DEFINER. Records attempt 1 or 2, THEN reveals.
--   close_shift            INVOKER. Closes on the LAST count (CAS open→closed),
--                          reason required above the store's threshold.
--   force_close_shift      INVOKER. A cash manager (not the holder) ends a shift
--                          nobody counted: note required, no count invented.
--   Blind legacy guard     an old app build cannot open or close a blind shift
--                          (it would show expected cash): RPC mark required.
--   close_kind rule        'forced' only through force_close_shift.
--   Activity               vocabulary (+ remittance kinds for 160000) and a
--                          blind-aware shift capture: on a blind shift the
--                          cashier's own row never carries expected or the
--                          difference; a separate NULL-actor shift.reconciled
--                          row does (own-row visibility then never reveals it).
--
-- The vocabulary CHECKs are re-added NOT VALID (strict supersets) and
-- validated in 20261027150010. The TS mirror (src/lib/activity/taxonomy.ts)
-- and docs/plans/store-activity/contract.md follow this file
-- (tests/unit/activity/store-activity-taxonomy.test.ts reads the newest).
-- Runner: tests/sql/run-shift-close.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- ============================================
-- Activity vocabulary
-- ============================================
create or replace function public.store_activity_category_of(p_kind text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_kind in ('order.cancelled', 'order.reopened', 'order.edited', 'order.deleted', 'order.placed', 'order.status_changed', 'order.completed') then 'orders'
    when p_kind in ('refund.issued', 'payment.recorded', 'payment.marked_paid', 'payment.proof_approved', 'payment.proof_rejected', 'discount.applied', 'voucher.redeemed', 'voucher.released', 'payment.charged') then 'money'
    when p_kind in ('shift.opened', 'shift.closed', 'cash.pay_in', 'cash.pay_out', 'cash.collected', 'receipt.reprinted', 'shift.reconciled', 'cash.remitted', 'cash.remittance_accepted', 'cash.remittance_disputed', 'cash.remittance_resolved') then 'cash'
    when p_kind in ('stock.received', 'stock.wasted', 'stock.counted', 'stock.adjusted', 'stock.transfer_sent', 'stock.transfer_received', 'stock.duplicate_blocked', 'stock.alert', 'stock.sale', 'stock.restored') then 'stock'
    when p_kind in ('loyalty.reward_claimed', 'loyalty.reward_voided', 'loyalty.stamps_adjusted', 'loyalty.program_changed', 'loyalty.stamps_earned', 'loyalty.reward_issued') then 'loyalty'
    when p_kind in ('menu.price_changed', 'menu.availability_changed', 'menu.item_added', 'menu.item_removed') then 'menu'
    when p_kind in ('staff.added', 'staff.removed', 'staff.access_changed', 'settings.changed', 'rules.changed', 'assistant.action_confirmed', 'campaign.status_changed', 'voucher.status_changed') then 'team'
    when p_kind in ('approval.requested', 'approval.approved', 'approval.declined', 'approval.expired', 'approval.withdrawn', 'approval.executed', 'approval.failed') then 'approvals'
    when p_kind in ('expense.recorded', 'expense.voided') then 'expenses'
  end
$$;
revoke all on function public.store_activity_category_of(text) from public, anon, authenticated;

alter table public.store_activity drop constraint if exists store_activity_flags_ck;
alter table public.store_activity
  -- store_activity_flags_ck
  add constraint store_activity_flags_ck check (flags <@ array[
    'paid_then_cancelled', 'cash_refund_noncash_order', 'after_hours', 'drawer_variance',
    'removed_after_kitchen', 'repeat_cancels', 'count_variance', 'duplicate_deduction',
    'forced_close', 'remittance_discrepancy'
  ]::text[]) not valid;

alter table public.store_activity drop constraint if exists store_activity_subject_type_ck;
alter table public.store_activity
  add constraint store_activity_subject_type_ck check (subject_type is null or subject_type in (
    'order', 'ingredient', 'menu_item', 'shift', 'member', 'voucher', 'staff', 'setting', 'approval', 'count', 'transfer', 'expense', 'remittance'
  )) not valid;

-- ============================================
-- shift_counts + float kept
-- ============================================
create table if not exists public.shift_counts (
  id                    uuid primary key default gen_random_uuid(),
  shift_id              uuid not null references public.staff_shifts(id) on delete restrict,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  outlet_id             uuid references public.outlets(id) on delete restrict,
  attempt               smallint not null,
  counted_cents         bigint not null,
  denominations         jsonb,
  -- What the count was judged against, frozen at the moment of counting.
  expected_cents        bigint,
  expected_source       text not null,
  server_expected_cents bigint,
  device_expected_cents bigint,
  counted_by            uuid references auth.users(id) on delete set null,
  counted_by_name       text,
  counted_at            timestamptz not null default now(),
  constraint shift_counts_attempt_ck check (attempt between 1 and 2),
  constraint shift_counts_counted_ck check (counted_cents between 0 and 10000000000),
  constraint shift_counts_source_ck check (expected_source in ('server', 'device', 'none')),
  constraint shift_counts_once unique (shift_id, attempt)
);
comment on table public.shift_counts is
  'Every drawer count of a shift, append-only: attempt 1, then at most one recount. The result is revealed only after a count exists. Written by count_shift.';
create index if not exists shift_counts_tenant on public.shift_counts (tenant_id, counted_at desc);

alter table public.shift_counts enable row level security;
-- The holder reads their own counts (a row exists only once they counted);
-- a cash manager reads every count they reach.
drop policy if exists shift_counts_read on public.shift_counts;
create policy shift_counts_read on public.shift_counts for select to authenticated
  using (public.app_user_may_reach_branch(tenant_id, outlet_id)
         and (public.app_user_manages_cash(tenant_id)
              or exists (select 1 from public.staff_shifts s
                          where s.id = shift_counts.shift_id and s.staff_user_id = auth.uid())));
revoke all on public.shift_counts from anon, authenticated;
grant select on public.shift_counts to authenticated;
grant all on public.shift_counts to service_role;

-- A blind shift's expectation opens to its cashier once they have counted.
drop policy if exists shift_expectations_read on public.shift_expectations;
create policy shift_expectations_read on public.shift_expectations for select to authenticated
  using (public.app_user_may_reach_branch(tenant_id, outlet_id)
         and (public.app_user_manages_cash(tenant_id)
              or exists (select 1 from public.staff_shifts s
                          where s.id = shift_expectations.shift_id
                            and s.staff_user_id = auth.uid()
                            and (not s.is_blind
                                 or exists (select 1 from public.shift_counts c where c.shift_id = s.id)))));

alter table public.staff_shifts add column if not exists float_kept_cents bigint;
do $$ begin
  alter table public.staff_shifts add constraint staff_shifts_float_kept_ck
    check (float_kept_cents is null or float_kept_cents between 0 and 10000000000);
exception when duplicate_object then null; end $$;
comment on column public.staff_shifts.float_kept_cents is 'Cash left in the drawer at close for the next shift (0 on a zero-balance drawer). Hand-over = count − this.';

-- Declared non-cash tallies (close_shift.p_non_cash):
-- [{key, method, expectedCents, slipCount, check, declaredCents, note}], ≤ 20 rows.
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
           or exists (select 1 from jsonb_object_keys(t) k
                       -- (the 20261027120300 shape {method, declaredCents, slipCount} is a subset)
                       where k not in ('key', 'method', 'expectedCents', 'slipCount', 'check', 'declaredCents', 'note'))
           or jsonb_typeof(t -> 'method') is distinct from 'string'
           or char_length(btrim(t ->> 'method')) not between 1 and 60
           or (t ? 'key' and (jsonb_typeof(t -> 'key') <> 'string' or char_length(t ->> 'key') > 120))
           or (t ? 'check' and (jsonb_typeof(t -> 'check') <> 'string' or (t ->> 'check') not in ('matches', 'different', 'skipped')))
           or (t ? 'declaredCents' and jsonb_typeof(t -> 'declaredCents') <> 'null'
               and coalesce(cash.json_whole(t -> 'declaredCents') not between 0 and 10000000000, true))
           or (t ? 'expectedCents' and jsonb_typeof(t -> 'expectedCents') <> 'null'
               and cash.json_whole(t -> 'expectedCents') is null)
           or (t ? 'slipCount' and jsonb_typeof(t -> 'slipCount') <> 'null'
               and coalesce(cash.json_whole(t -> 'slipCount') not between 0 and 100000, true))
           or (t ? 'note' and jsonb_typeof(t -> 'note') <> 'null'
               and (jsonb_typeof(t -> 'note') <> 'string' or char_length(t ->> 'note') > 200))
           or ((t ->> 'check') = 'different' and cash.json_whole(t -> 'declaredCents') is null));
$$;

-- ============================================
-- Triggers: close-kind rule, blind legacy guard, custody
-- ============================================
-- The RPCs mark their own write (transaction-local, as PR #88's app.expense_void):
--   app.shift_rpc        'open' | 'close:<shift id>'
--   app.shift_close_kind 'forced' (force_close_shift only)
create or replace function cash.shift_rpc_mark(p_shift uuid)
returns text
language sql
stable
as $$
  select case coalesce(current_setting('app.shift_rpc', true), '')
           when 'open' then 'open'
           when 'close:' || coalesce(p_shift::text, '') then 'close'
           else ''
         end
$$;
grant execute on function cash.shift_rpc_mark(uuid) to authenticated, service_role;

create or replace function public.staff_shift_business_day_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total bigint;
  v_period public.service_periods%rowtype;
  v_client boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    -- The server decides the day; an import (service role) may keep its own.
    if v_client or new.business_day is null then
      new.business_day := public.business_day_of(new.tenant_id, new.opened_at);
    end if;
    new.is_blind := coalesce((select s.blind_close from public.tenant_cash_settings s where s.tenant_id = new.tenant_id), false);
    -- Close-time facts cannot be born with the shift.
    new.close_kind := null;
    new.closing_denominations := null;
    new.closing_non_cash := null;
    new.device_expected_cash := null;
    new.variance_reason := null;
    new.float_kept_cents := null;
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
    -- Blind legacy guard: an old build would show expected cash.
    if v_client and new.is_blind and cash.shift_rpc_mark(null) <> 'open' then
      raise exception 'This store counts drawers blind. Update the app to start or end a shift.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE (custody already pinned everything that must not move).
  if v_client and old.is_blind and cash.shift_rpc_mark(old.id) <> 'close' then
    raise exception 'This store counts drawers blind. Update the app to start or end a shift.' using errcode = '42501';
  end if;
  if old.status = 'open' and new.status = 'closed' then
    -- 'forced' only through force_close_shift; every other client close is a count.
    if v_client then
      new.close_kind := case
        when cash.shift_rpc_mark(old.id) = 'close' and coalesce(current_setting('app.shift_close_kind', true), '') = 'forced' then 'forced'
        else 'counted'
      end;
    elsif new.close_kind is null then
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
    if new.float_kept_cents is not null and new.closing_count is not null
       and new.float_kept_cents > round(new.closing_count * 100) then
      raise exception 'The cash left in the drawer cannot be more than was counted.' using errcode = '22023';
    end if;
    if new.is_zero_balance and coalesce(new.float_kept_cents, 0) <> 0 then
      raise exception 'A zero-balance drawer is emptied at close.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- Custody (20261027120300) + float kept pinned while open, and a forced close
-- needs no count (close_kind is checked again by staff_shifts_close_kind_ck).
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
    or new.variance_reason is distinct from old.variance_reason
    or new.float_kept_cents is distinct from old.float_kept_cents) then
    raise exception 'Shift custody cannot be changed';
  end if;
  if new.status = 'closed' and new.close_kind is distinct from 'forced'
     and (new.expected_cash is null or new.closing_count is null) then
    raise exception 'Closing a shift requires the expected cash and counted cash';
  end if;
  return new;
end;
$$;

-- ============================================
-- Shared helpers for the RPCs
-- ============================================
-- The signed-in account's display name (expense_actor_name's rule).
create or replace function cash.actor_name()
returns text
language sql
stable
set search_path = ''
as $$
  select left(nullif(btrim(coalesce(nullif(btrim(au.display_name), ''), split_part(coalesce(au.email, ''), '@', 1))), ''), 80)
    from public.app_users au where au.user_id = auth.uid() limit 1
$$;
grant execute on function cash.actor_name() to authenticated, service_role;

-- When a running shift becomes overdue: the end of its business day + grace.
-- Computed when read, never stored (07 §6).
create or replace function cash.shift_overdue_at(p_shift public.staff_shifts)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (select b.end_at from public.business_day_bounds(p_shift.tenant_id, p_shift.business_day) b)
         + make_interval(mins => (cash.settings_of(p_shift.tenant_id)).overdue_grace_minutes)
$$;
grant execute on function cash.shift_overdue_at(public.staff_shifts) to authenticated, service_role;

-- The JSON a shift is described with in RPC answers.
create or replace function cash.shift_json(s public.staff_shifts)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'tenantId', s.tenant_id, 'outletId', s.outlet_id, 'staffUserId', s.staff_user_id,
    'staffName', s.staff_name, 'drawerId', s.drawer_id, 'drawerName', s.drawer_name,
    'status', s.status, 'openedAt', cash.iso(s.opened_at), 'closedAt', cash.iso(s.closed_at),
    'businessDay', to_char(s.business_day, 'YYYY-MM-DD'), 'isBlind', s.is_blind,
    'isZeroBalance', s.is_zero_balance, 'openingFloatCents', round(s.opening_float * 100)::bigint,
    'servicePeriodId', s.service_period_id,
    'overdueAt', case when s.status = 'open' then cash.iso(cash.shift_overdue_at(s)) end)
$$;
grant execute on function cash.shift_json(public.staff_shifts) to authenticated, service_role;

-- ============================================
-- open_shift
-- ============================================
create or replace function public.open_shift(
  p_tenant uuid, p_outlet uuid, p_drawer_id uuid, p_opening_float_cents bigint,
  p_opening_denominations jsonb default null, p_service_period_id uuid default null, p_staff_name text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.staff_shifts%rowtype;
  prev public.staff_shifts%rowtype;
  v_handover jsonb := null;
begin
  if v_uid is null then
    raise exception 'Sign in to start a shift.' using errcode = '42501';
  end if;
  if p_tenant is null or p_opening_float_cents is null or p_opening_float_cents not between 0 and 1000000000 then
    raise exception 'Starting cash must be between ₱0 and ₱10,000,000.' using errcode = '22023';
  end if;
  -- One open shift per person per store (idx_staff_shifts_one_open_per_staff).
  select * into s from public.staff_shifts x
   where x.tenant_id = p_tenant and x.staff_user_id = v_uid and x.status = 'open'
   limit 1;
  if found then
    if now() > cash.shift_overdue_at(s) then
      -- Never join a shift forgotten from an earlier business day: today's
      -- sales would land in it. The app runs "Close yesterday's shift first".
      return jsonb_build_object('state', 'stale', 'shift', cash.shift_json(s), 'handover', null);
    end if;
    return jsonb_build_object('state', 'joined', 'shift', cash.shift_json(s), 'handover', null);
  end if;

  perform set_config('app.shift_rpc', 'open', true);
  insert into public.staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float,
                                   opening_denominations, drawer_id, service_period_id)
  values (p_tenant, p_outlet, v_uid,
          coalesce(nullif(btrim(p_staff_name), ''), cash.actor_name(), 'Staff'),
          p_opening_float_cents::numeric / 100, p_opening_denominations, p_drawer_id, p_service_period_id)
  returning * into s;
  perform set_config('app.shift_rpc', '', true);

  -- What the previous shift on this drawer left in it.
  if s.drawer_id is not null then
    select * into prev from public.staff_shifts x
     where x.drawer_id = s.drawer_id and x.status = 'closed' and x.id <> s.id
     order by x.closed_at desc limit 1;
    if found then
      v_handover := jsonb_build_object(
        'previousShiftId', prev.id, 'staffName', prev.staff_name, 'closedAt', cash.iso(prev.closed_at),
        'leftCents', coalesce(prev.float_kept_cents,
                              case when prev.is_zero_balance or prev.close_kind = 'forced' then 0
                                   else round(prev.opening_float * 100)::bigint end));
    end if;
  end if;
  return jsonb_build_object('state', 'opened', 'shift', cash.shift_json(s), 'handover', v_handover);
end;
$$;
revoke all on function public.open_shift(uuid, uuid, uuid, bigint, jsonb, uuid, text) from public, anon;
grant execute on function public.open_shift(uuid, uuid, uuid, bigint, jsonb, uuid, text) to authenticated;

-- ============================================
-- Who may act on a shift (definer RPCs check this explicitly)
-- ============================================
create or replace function cash.shift_access(s public.staff_shifts)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.app_user_may_reach_branch(s.tenant_id, s.outlet_id) then 'none'
    when public.app_user_manages_cash(s.tenant_id) then 'manager'
    when s.staff_user_id = auth.uid() then 'holder'
    else 'none'
  end
$$;
revoke all on function cash.shift_access(public.staff_shifts) from public, anon, authenticated;

-- ============================================
-- preview_shift_close
-- ============================================
create or replace function public.preview_shift_close(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.staff_shifts%rowtype;
  v_access text;
  v_backend text;
  v jsonb;
  v_counts integer;
  v_hidden boolean;
begin
  select * into s from public.staff_shifts where id = p_shift_id;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  v_access := cash.shift_access(s);
  if auth.uid() is null or v_access = 'none' then
    raise exception 'Only the cashier on this shift or someone who handles cash can see this.' using errcode = '42501';
  end if;
  if s.status <> 'open' then
    raise exception 'This shift is already closed.' using errcode = '55000';
  end if;
  select count(*) into v_counts from public.shift_counts c where c.shift_id = s.id;
  v_hidden := s.is_blind and v_access <> 'manager' and v_counts = 0;
  v_backend := cash.tenant_order_backend(s.tenant_id);
  if v_backend = 'platform' then
    begin
      v := cash.shift_expected(s, now());
    exception when others then
      raise warning 'preview_shift_close: server expectation failed: % (%)', sqlerrm, sqlstate;
      v := null;
    end;
  end if;
  return jsonb_build_object(
    'source', case when v is not null then 'server' when v_backend = 'platform' then 'none' else 'device' end,
    'hidden', v_hidden,
    'expectedCents', case when v_hidden then null else (v ->> 'expectedCents')::bigint end,
    'breakdown', case when v_hidden then null else v end,
    'nonCashByMethod', case when v_hidden or v is null then null else v -> 'nonCashByMethod' end,
    'floatCents', round(s.opening_float * 100)::bigint,
    'isZeroBalance', s.is_zero_balance,
    'countAttempts', v_counts);
end;
$$;
revoke all on function public.preview_shift_close(uuid) from public, anon;
grant execute on function public.preview_shift_close(uuid) to authenticated;

-- ============================================
-- count_shift — record, THEN reveal
-- ============================================
create or replace function public.count_shift(
  p_shift_id uuid, p_counted_cents bigint, p_denominations jsonb default null, p_device_expected_cents bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.staff_shifts%rowtype;
  v_access text;
  v_attempt integer;
  v_total bigint;
  v_server bigint;
  v_expected bigint;
  v_source text;
  v_settings public.tenant_cash_settings;
  v_diff bigint;
begin
  -- Lock the shift: two taps of "Count" cannot both be attempt 1.
  select * into s from public.staff_shifts where id = p_shift_id for update;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  v_access := cash.shift_access(s);
  if auth.uid() is null or v_access = 'none' then
    raise exception 'Only the cashier on this shift or someone who handles cash can count it.' using errcode = '42501';
  end if;
  if s.status <> 'open' then
    raise exception 'This shift is already closed.' using errcode = '55000';
  end if;
  if p_counted_cents is null or p_counted_cents not between 0 and 10000000000 then
    raise exception 'The count must be between ₱0 and ₱100,000,000.' using errcode = '22023';
  end if;
  if p_device_expected_cents is not null and abs(p_device_expected_cents) > 10000000000 then
    raise exception 'The register''s figure is out of range.' using errcode = '22023';
  end if;
  v_settings := cash.settings_of(s.tenant_id);
  if p_denominations is not null then
    v_total := cash.denominations_total_cents(p_denominations);
    if v_total is null then
      raise exception 'The bill count is not valid.' using errcode = '22023';
    end if;
    if v_total <> p_counted_cents then
      raise exception 'The bills counted do not add up to the count.' using errcode = '22023';
    end if;
  elsif v_settings.require_denominations then
    raise exception 'denominations_required: this store counts bills and coins at the end of a shift.' using errcode = '22023';
  end if;

  select coalesce(max(c.attempt), 0) + 1 into v_attempt from public.shift_counts c where c.shift_id = s.id;
  if v_attempt > 2 then
    raise exception 'recount_limit: a drawer can be recounted once.' using errcode = '22023';
  end if;

  if cash.tenant_order_backend(s.tenant_id) = 'platform' then
    begin
      v_server := (cash.shift_expected(s, now()) ->> 'expectedCents')::bigint;
    exception when others then
      raise warning 'count_shift: server expectation failed: % (%)', sqlerrm, sqlstate;
      v_server := null;
    end;
  end if;
  v_expected := cash.choose_expected(v_server, p_device_expected_cents);
  v_source := cash.choose_source(v_server, p_device_expected_cents);
  v_diff := case when v_expected is null then null else p_counted_cents - v_expected end;

  insert into public.shift_counts (shift_id, tenant_id, outlet_id, attempt, counted_cents, denominations,
                                   expected_cents, expected_source, server_expected_cents, device_expected_cents,
                                   counted_by, counted_by_name)
  values (s.id, s.tenant_id, s.outlet_id, v_attempt, p_counted_cents, p_denominations,
          v_expected, v_source, v_server, p_device_expected_cents, auth.uid(), cash.actor_name());

  return jsonb_build_object(
    'attempt', v_attempt, 'countedCents', p_counted_cents, 'expectedCents', v_expected,
    'differenceCents', v_diff, 'source', v_source,
    'reasonRequired', v_diff is not null and abs(v_diff) > v_settings.variance_reason_from_cents);
end;
$$;
revoke all on function public.count_shift(uuid, bigint, jsonb, bigint) from public, anon;
grant execute on function public.count_shift(uuid, bigint, jsonb, bigint) to authenticated;

-- ============================================
-- close_shift — on the last count
-- ============================================
create or replace function public.close_shift(
  p_shift_id uuid,
  p_non_cash jsonb default null,
  p_variance_reason text default null,
  p_note text default null,
  p_float_kept_cents bigint default null,
  p_remit_to uuid default null,
  p_remit_to_safe boolean default false,
  p_closed_by_name text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.staff_shifts%rowtype;
  c public.shift_counts%rowtype;
  v_float_kept bigint;
  v_settings jsonb;
  v_expected bigint;
  v_remittance uuid;
  v_handed bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to end a shift.' using errcode = '42501';
  end if;
  select * into s from public.staff_shifts where id = p_shift_id;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  if not (s.staff_user_id = v_uid or public.app_user_manages_cash(s.tenant_id)) then
    raise exception 'Only the cashier on this shift or someone who handles cash can end it.' using errcode = '42501';
  end if;
  if s.status <> 'open' then
    raise exception 'shift_not_open: this shift is already closed.' using errcode = 'P0002';
  end if;
  select * into c from public.shift_counts x where x.shift_id = s.id order by x.attempt desc limit 1;
  if not found then
    raise exception 'count_required: count the drawer before ending the shift.' using errcode = '22023';
  end if;
  if c.expected_cents is null then
    raise exception 'expected_unavailable: the register''s figure is missing; count again from the app.' using errcode = '22023';
  end if;
  if p_non_cash is not null and not cash.non_cash_tallies_valid(p_non_cash) then
    raise exception 'The card and e-wallet tallies are not valid.' using errcode = '22023';
  end if;
  v_settings := public.get_cash_settings(s.tenant_id);
  if abs(c.counted_cents - c.expected_cents) > (v_settings ->> 'varianceReasonFromCents')::bigint
     and nullif(btrim(coalesce(p_variance_reason, '')), '') is null then
    raise exception 'variance_reason_required: say why the drawer is short or over.' using errcode = '22023';
  end if;
  v_float_kept := coalesce(p_float_kept_cents,
                           case when s.is_zero_balance then 0 else least(round(s.opening_float * 100)::bigint, c.counted_cents) end);
  if v_float_kept < 0 or v_float_kept > c.counted_cents then
    raise exception 'The cash left in the drawer must be between ₱0 and what was counted.' using errcode = '22023';
  end if;

  perform set_config('app.shift_rpc', 'close:' || s.id::text, true);
  perform set_config('app.shift_close_kind', '', true);
  perform set_config('app.remit_to', coalesce(p_remit_to::text, ''), true);
  perform set_config('app.remit_to_safe', case when coalesce(p_remit_to_safe, false) then 'on' else '' end, true);
  update public.staff_shifts x
     set status = 'closed', closed_at = now(),
         expected_cash = c.expected_cents::numeric / 100,
         closing_count = c.counted_cents::numeric / 100,
         closing_denominations = c.denominations,
         closing_non_cash = p_non_cash,
         device_expected_cash = c.device_expected_cents::numeric / 100,
         variance_reason = nullif(btrim(coalesce(p_variance_reason, '')), ''),
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), x.note),
         float_kept_cents = v_float_kept,
         closed_by_name = coalesce(nullif(btrim(coalesce(p_closed_by_name, '')), ''), cash.actor_name())
   where x.id = s.id and x.status = 'open'
  returning * into s;
  perform set_config('app.shift_rpc', '', true);
  if not found then
    -- Closed meanwhile (CAS), or this account may not close it here.
    raise exception 'shift_not_open: this shift was closed or cannot be closed from here.' using errcode = 'P0002';
  end if;

  select e.expected_cents into v_expected from public.shift_expectations e where e.shift_id = s.id;
  v_expected := coalesce(v_expected, c.expected_cents);
  if to_regclass('public.cash_remittances') is not null then
    execute 'select r.id, r.handed_over_cents from public.cash_remittances r where r.shift_id = $1 and r.kind = ''shift'''
      into v_remittance, v_handed using s.id;
  end if;
  return jsonb_build_object(
    'closedAt', cash.iso(s.closed_at), 'countedCents', c.counted_cents, 'expectedCents', v_expected,
    'differenceCents', c.counted_cents - v_expected, 'remittanceId', v_remittance,
    'handedOverCents', coalesce(v_handed, c.counted_cents - v_float_kept));
end;
$$;
revoke all on function public.close_shift(uuid, jsonb, text, text, bigint, uuid, boolean, text) from public, anon;
grant execute on function public.close_shift(uuid, jsonb, text, text, bigint, uuid, boolean, text) to authenticated;

-- ============================================
-- force_close_shift — a manager ends a shift nobody counted
-- ============================================
create or replace function public.force_close_shift(p_shift_id uuid, p_note text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.staff_shifts%rowtype;
  v_remittance uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to end a shift.' using errcode = '42501';
  end if;
  select * into s from public.staff_shifts where id = p_shift_id;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  if not public.app_user_manages_cash(s.tenant_id) then
    raise exception 'Only someone who handles cash can end another person''s shift.' using errcode = '42501';
  end if;
  if s.staff_user_id = v_uid then
    raise exception 'End your own shift by counting your drawer.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'note_required: say why the shift is being ended without a count.' using errcode = '22023';
  end if;
  perform set_config('app.shift_rpc', 'close:' || s.id::text, true);
  perform set_config('app.shift_close_kind', 'forced', true);
  update public.staff_shifts x
     set status = 'closed', closed_at = now(), close_kind = 'forced', note = btrim(p_note),
         closed_by_name = cash.actor_name(), float_kept_cents = 0
   where x.id = s.id and x.status = 'open'
  returning * into s;
  perform set_config('app.shift_rpc', '', true);
  perform set_config('app.shift_close_kind', '', true);
  if not found then
    raise exception 'shift_not_open: this shift was closed or cannot be closed from here.' using errcode = 'P0002';
  end if;
  if to_regclass('public.cash_remittances') is not null then
    execute 'select r.id from public.cash_remittances r where r.shift_id = $1 and r.kind = ''shift''' into v_remittance using s.id;
  end if;
  return jsonb_build_object('closedAt', cash.iso(s.closed_at), 'remittanceId', v_remittance);
end;
$$;
revoke all on function public.force_close_shift(uuid, text) from public, anon;
grant execute on function public.force_close_shift(uuid, text) to authenticated;

-- ============================================
-- Blind-aware shift activity (body of 20261012151100 + blind / forced)
-- ============================================
create or replace function public.store_activity_capture_staff_shift(r public.staff_shifts, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variance numeric;
  v_flags text[] := '{}'::text[];
  v_closer text := coalesce(r.closed_by_name, r.staff_name);
begin
  if p_event = 'opened' then
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'shift.opened',
      p_event_key => 'staff_shifts:' || r.id || ':opened',
      p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => r.opened_at,
      p_outlet_id => r.outlet_id, p_actor_user_id => coalesce(public.store_activity_actor(), r.staff_user_id), p_actor_name => r.staff_name,
      p_subject_type => 'shift', p_subject_ref => r.id::text,
      p_after => jsonb_build_object('openingFloat', r.opening_float),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Shift opened · float ' || public.store_activity_peso(r.opening_float),
        'drawerName', r.drawer_name, 'openingFloat', r.opening_float)));
    return;
  end if;

  if p_event <> 'closed' or r.status <> 'closed' then
    return;
  end if;

  if r.close_kind = 'forced' then
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'shift.closed',
      p_event_key => 'staff_shifts:' || r.id || ':closed',
      p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => coalesce(r.closed_at, now()),
      p_outlet_id => r.outlet_id,
      p_actor_user_id => coalesce(public.store_activity_actor(), r.closed_by),
      p_actor_name => v_closer, p_note => r.note,
      p_subject_type => 'shift', p_subject_ref => r.id::text,
      p_after => jsonb_build_object('closeKind', 'forced'),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Shift force-closed by ' || coalesce(v_closer, 'a manager') || ' · drawer not counted',
        'drawerName', r.drawer_name, 'staffName', r.staff_name, 'openingFloat', r.opening_float)),
      p_flags => array['forced_close']);
    return;
  end if;

  v_variance := case when r.closing_count is not null and r.expected_cash is not null
    then r.closing_count - r.expected_cash end;
  if public.store_activity_flag_drawer_variance(r.closing_count, r.expected_cash) then
    v_flags := v_flags || 'drawer_variance'::text;
  end if;

  if r.is_blind then
    -- The cashier's own row: what they counted, nothing they were not shown.
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'shift.closed',
      p_event_key => 'staff_shifts:' || r.id || ':closed',
      p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => coalesce(r.closed_at, now()),
      p_outlet_id => r.outlet_id,
      p_actor_user_id => coalesce(public.store_activity_actor(), r.closed_by, r.staff_user_id),
      p_actor_name => v_closer, p_note => r.note,
      p_subject_type => 'shift', p_subject_ref => r.id::text,
      p_after => jsonb_build_object('closingCount', r.closing_count),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Shift closed · counted ' || public.store_activity_peso(r.closing_count),
        'drawerName', r.drawer_name, 'staffName', r.staff_name, 'closingCount', r.closing_count)));
    -- The result: NO actor, so own-row visibility never shows it to the cashier.
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'shift.reconciled',
      p_event_key => 'staff_shifts:' || r.id || ':reconciled',
      p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => coalesce(r.closed_at, now()),
      p_outlet_id => r.outlet_id, p_actor_user_id => null, p_actor_name => null,
      p_amount => v_variance,
      p_subject_type => 'shift', p_subject_ref => r.id::text,
      p_after => jsonb_build_object('expectedCash', r.expected_cash, 'closingCount', r.closing_count, 'varianceReason', r.variance_reason),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', coalesce(r.staff_name, 'Cashier') || '''s drawer · ' || case
          when v_variance is null then 'not counted'
          when v_variance = 0 then 'exact'
          when v_variance < 0 then 'short ' || public.store_activity_peso(-v_variance)
          else 'over ' || public.store_activity_peso(v_variance) end,
        'drawerName', r.drawer_name, 'staffName', r.staff_name,
        'expectedCash', r.expected_cash, 'closingCount', r.closing_count)),
      p_flags => v_flags);
    return;
  end if;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => 'shift.closed',
    p_event_key => 'staff_shifts:' || r.id || ':closed',
    p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => coalesce(r.closed_at, now()),
    p_outlet_id => r.outlet_id,
    p_actor_user_id => coalesce(public.store_activity_actor(), r.closed_by, r.staff_user_id),
    p_actor_name => v_closer,
    p_amount => v_variance, p_note => r.note,
    p_subject_type => 'shift', p_subject_ref => r.id::text,
    p_after => jsonb_build_object('expectedCash', r.expected_cash, 'closingCount', r.closing_count),
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', 'Shift closed · ' || case
        when v_variance is null then 'drawer not counted'
        when v_variance = 0 then 'drawer exact'
        when v_variance < 0 then 'drawer short ' || public.store_activity_peso(-v_variance)
        else 'drawer over ' || public.store_activity_peso(v_variance) end,
      'drawerName', r.drawer_name, 'staffName', r.staff_name,
      'expectedCash', r.expected_cash, 'closingCount', r.closing_count, 'openingFloat', r.opening_float)),
    p_flags => v_flags);
end;
$$;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop function if exists public.force_close_shift(uuid, text), public.close_shift(uuid, jsonb, text, text, bigint, uuid, boolean, text),
--   public.count_shift(uuid, bigint, jsonb, bigint), public.preview_shift_close(uuid),
--   public.open_shift(uuid, uuid, uuid, bigint, jsonb, uuid, text);
-- drop function if exists cash.shift_access(public.staff_shifts), cash.shift_json(public.staff_shifts),
--   cash.shift_overdue_at(public.staff_shifts), cash.actor_name(), cash.shift_rpc_mark(uuid);
-- re-create staff_shift_business_day_stamp / protect_staff_shift_custody / non_cash_tallies_valid from 20261027120300,
--   store_activity_capture_staff_shift from 20261012151100, shift_expectations_read from 20261027130000,
--   store_activity_category_of / the two CHECKs from 20261022120200;
-- alter table public.staff_shifts drop constraint if exists staff_shifts_float_kept_ck, drop column if exists float_kept_cents;
-- drop table if exists public.shift_counts;
