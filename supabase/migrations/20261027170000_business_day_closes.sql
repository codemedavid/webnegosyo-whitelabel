-- ===========================================================================
-- Day close: a versioned, frozen record of one business day
-- (P6 of docs/plans/cashier-remittance, CONTRACTS W3.1, 07 §5.2–5.3).
--
--   business_day_closes      one LIVE close per store × branch × business day
--                            (NULL outlet = the whole store); reopening keeps
--                            the old version, a re-close writes version + 1.
--   cash.day_close_snapshot  the frozen figures (snapshot_version 1): sales
--                            from the reporting helpers ONLY (one definition),
--                            drawers from the frozen shift expectations, the
--                            remittances, expenses, named-shift split.
--   get_day_close_status     the checklist (cash managers).
--   close_business_day       refuses while a shift of the day is open (always),
--                            and unsettled remittances in 'required' mode unless
--                            forced with a note.
--   reopen_business_day      owner / superadmin, within 31 days.
--   record_day_deposit       set once.
--   get_business_day_close   one close; sales masked without `reports`.
--   Closed-day guard         no shift opens into a closed day; opening a shift
--                            and closing the day take the SAME advisory lock.
--   Activity                 day.closed / day.reopened / day.deposit_recorded,
--                            subject day_close, flag day_reopened (CHECKs NOT
--                            VALID here, validated in 20261027170010; TS mirror
--                            + contract table follow this file).
--
-- Orders are never blocked by a close: a close is evidence, not a books lock.
-- Runner: tests/sql/run-day-close.cjs.
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
    when p_kind in ('shift.opened', 'shift.closed', 'cash.pay_in', 'cash.pay_out', 'cash.collected', 'receipt.reprinted', 'shift.reconciled', 'cash.remitted', 'cash.remittance_accepted', 'cash.remittance_disputed', 'cash.remittance_resolved', 'day.closed', 'day.reopened', 'day.deposit_recorded') then 'cash'
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
    'forced_close', 'remittance_discrepancy', 'day_reopened'
  ]::text[]) not valid;

alter table public.store_activity drop constraint if exists store_activity_subject_type_ck;
alter table public.store_activity
  add constraint store_activity_subject_type_ck check (subject_type is null or subject_type in (
    'order', 'ingredient', 'menu_item', 'shift', 'member', 'voucher', 'staff', 'setting', 'approval', 'count', 'transfer', 'expense', 'remittance', 'day_close'
  )) not valid;

-- ============================================
-- Table
-- ============================================
create table if not exists public.business_day_closes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  -- NULL = the whole store.
  outlet_id           uuid references public.outlets(id) on delete restrict,
  business_day        date not null,
  version             smallint not null default 1,
  status              text not null default 'closed',
  window_start        timestamptz not null,
  window_end          timestamptz not null,
  snapshot            jsonb not null,
  snapshot_version    smallint not null,
  sales_source        text not null,
  forced_shift_ids    uuid[] not null default '{}',
  unsettled_remittance_ids uuid[] not null default '{}',
  note                text,
  closed_by           uuid references auth.users(id) on delete set null,
  closed_by_name      text not null,
  closed_at           timestamptz not null default now(),
  deposit_cents       bigint,
  deposit_to          text,
  deposit_ref         text,
  deposit_proof_url   text,
  deposit_recorded_by uuid references auth.users(id) on delete set null,
  deposit_recorded_at timestamptz,
  reopened_by         uuid references auth.users(id) on delete set null,
  reopened_by_name    text,
  reopened_at         timestamptz,
  reopen_reason       text,
  constraint business_day_closes_status_ck check (status in ('closed', 'reopened')),
  constraint business_day_closes_source_ck check (sales_source in ('platform_sql', 'drawers_only')),
  constraint business_day_closes_reopen_ck check ((status = 'reopened') = (reopened_at is not null)),
  constraint business_day_closes_window_ck check (window_end > window_start),
  constraint business_day_closes_text_ck check (
    coalesce(char_length(note), 0) <= 500 and coalesce(char_length(reopen_reason), 0) <= 300
    and coalesce(char_length(deposit_to), 0) <= 80 and coalesce(char_length(deposit_ref), 0) <= 80
    and coalesce(char_length(deposit_proof_url), 0) <= 500),
  constraint business_day_closes_deposit_ck check (deposit_cents is null or deposit_cents between 0 and 10000000000),
  constraint business_day_closes_deposit_set_ck check ((deposit_recorded_at is null) = (deposit_cents is null))
);
comment on table public.business_day_closes is
  'Versioned, frozen record of one business day per store × branch (NULL outlet = whole store). Written only by the day-close RPCs.';

create unique index if not exists business_day_closes_live
  on public.business_day_closes (tenant_id, coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), business_day)
  where status = 'closed';
create unique index if not exists business_day_closes_version
  on public.business_day_closes (tenant_id, coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), business_day, version);
create index if not exists business_day_closes_tenant_day on public.business_day_closes (tenant_id, business_day desc);

alter table public.business_day_closes enable row level security;
drop policy if exists business_day_closes_read on public.business_day_closes;
create policy business_day_closes_read on public.business_day_closes for select to authenticated
  using (public.app_user_may_reach_branch(tenant_id, outlet_id) and public.app_user_manages_cash(tenant_id));
revoke all on public.business_day_closes from anon, authenticated;
grant select on public.business_day_closes to authenticated;
grant all on public.business_day_closes to service_role;

-- ============================================
-- Helpers
-- ============================================
-- Twin of servicePeriodWindow (src/lib/business-day/service-periods.ts): a
-- period that starts before the day's cutoff belongs to the next calendar
-- date; ends <= starts = it ends the next day.
create or replace function cash.service_period_window(p_tenant uuid, p_day date, p_starts integer, p_ends integer,
  out start_at timestamptz, out end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select coalesce((select x.cutoff_minutes::integer from public.business_day_cutoffs x
                      where x.tenant_id = p_tenant and x.effective_from <= p_day
                      order by x.effective_from desc limit 1), 0) as cut
  ), s as (
    select ((case when p_starts < c.cut then p_day + 1 else p_day end) + make_interval(mins => p_starts)) at time zone 'Asia/Manila' as start_at
      from c
  )
  select s.start_at,
         s.start_at + make_interval(mins => case when p_ends > p_starts then p_ends - p_starts else p_ends + 1440 - p_starts end)
    from s
$$;
revoke all on function cash.service_period_window(uuid, date, integer, integer) from public, anon, authenticated;

-- Bounds of a business day without the caller-membership check (definer use).
create or replace function cash.day_bounds(p_tenant uuid, p_day date, out start_at timestamptz, out end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select (p_day + make_interval(mins => coalesce((select x.cutoff_minutes::integer from public.business_day_cutoffs x
            where x.tenant_id = p_tenant and x.effective_from <= p_day order by x.effective_from desc limit 1), 0))) at time zone 'Asia/Manila',
         ((p_day + 1) + make_interval(mins => coalesce((select x.cutoff_minutes::integer from public.business_day_cutoffs x
            where x.tenant_id = p_tenant and x.effective_from <= p_day + 1 order by x.effective_from desc limit 1), 0))) at time zone 'Asia/Manila'
$$;
revoke all on function cash.day_bounds(uuid, date) from public, anon, authenticated;

-- The day lock shared by day close and clock-in (07 §5.3 step 1).
create or replace function cash.lock_day(p_tenant uuid, p_outlet uuid, p_day date)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(hashtextextended('bday:' || p_tenant::text || ':' || coalesce(p_outlet::text, '-') || ':' || p_day::text, 0))
$$;
revoke all on function cash.lock_day(uuid, uuid, date) from public, anon;
grant execute on function cash.lock_day(uuid, uuid, date) to authenticated, service_role;

-- Is this business day closed for this branch (a close of the branch, or of
-- the whole store)? Definer: a cashier cannot read business_day_closes.
create or replace function cash.day_is_closed(p_tenant uuid, p_outlet uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.business_day_closes d
                  where d.tenant_id = p_tenant and d.business_day = p_day and d.status = 'closed'
                    and (d.outlet_id is null or d.outlet_id is not distinct from p_outlet))
$$;
revoke all on function cash.day_is_closed(uuid, uuid, date) from public, anon;
grant execute on function cash.day_is_closed(uuid, uuid, date) to authenticated, service_role;

-- ============================================
-- The snapshot (snapshot_version 1)
-- ============================================
create or replace function cash.day_close_snapshot(p_tenant uuid, p_outlet uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  b record;
  v_platform boolean := cash.tenant_order_backend(p_tenant) = 'platform';
  v_cut integer;
  v_sales jsonb;
  v_periods jsonb := '[]'::jsonb;
  v_other bigint;
  v_shifts jsonb;
  v_totals jsonb;
  v_cash_to_account bigint;
  v_expenses jsonb;
  v_late jsonb;
  v_unattributed bigint;
  v_recount jsonb;
begin
  select * into b from cash.day_bounds(p_tenant, p_day);
  v_cut := coalesce((select x.cutoff_minutes::integer from public.business_day_cutoffs x
                      where x.tenant_id = p_tenant and x.effective_from <= p_day order by x.effective_from desc limit 1), 0);

  -- Sales: the one definition (reporting helpers via cash.window_sales).
  if v_platform then
    v_sales := cash.window_sales(p_tenant, b.start_at, b.end_at, p_outlet, 0);
    -- Named shifts: each live order to the latest-starting period containing
    -- it (servicePeriodOf), windows clipped to the day: Day + Night + other = net.
    execute $q$
      with periods as (
        select p.id, p.name, w.start_at, w.end_at
          from public.service_periods p,
               lateral cash.service_period_window($1, $4, p.starts_minutes, p.ends_minutes) w
         where p.tenant_id = $1 and p.archived_at is null
           and (p.outlet_id is null or p.outlet_id is not distinct from $5)
      ),
      live as (
        select f.order_id, f.placed_at, f.net_cents
          from reporting.order_figures($1, $2, $3, $5, false) f where f.is_live
      ),
      assigned as (
        select l.net_cents,
               (select p.id from periods p
                 where greatest(p.start_at, $2) <= l.placed_at and l.placed_at < least(p.end_at, $3)
                 order by p.start_at desc, p.id limit 1) as period_id
          from live l
      )
      select coalesce(jsonb_agg(jsonb_build_object('periodId', p.id, 'name', p.name,
                                                   'netCents', coalesce(x.net, 0), 'orders', coalesce(x.orders, 0))
                                order by p.start_at, p.name), '[]'::jsonb)
        from periods p
        left join (select a.period_id, sum(a.net_cents)::bigint as net, count(*) as orders from assigned a group by 1) x on x.period_id = p.id
    $q$ into v_periods using p_tenant, b.start_at, b.end_at, p_day, p_outlet;
    v_other := (v_sales -> 'summary' ->> 'netCents')::bigint
               - coalesce((select sum((e ->> 'netCents')::bigint) from jsonb_array_elements(v_periods) e), 0);

    -- Counter sales outside any shift of their cashier that day (rung after
    -- a close, or before clocking in), and counter cash nobody was stamped on.
    execute $q$
      with o as (
        select o.id, o.created_at, cash.pos_cashier(o.customer_data) as cashier, o.payment_method_name, o.total
          from public.orders o
         where o.tenant_id = $1 and o.created_at >= $2 and o.created_at < $3
           and ($4::uuid is null or o.outlet_id = $4) and o.source = 'pos' and o.status is distinct from 'cancelled'
      )
      select jsonb_build_object(
               'count', count(*) filter (where o.cashier is not null and not exists (
                  select 1 from public.staff_shifts s where s.tenant_id = $1 and s.staff_user_id::text = o.cashier
                     and s.opened_at <= o.created_at and o.created_at <= coalesce(s.closed_at, now()))),
               'cashCents', coalesce(round(100 * sum(o.total) filter (where o.cashier is not null and cash.is_cash_name(o.payment_method_name) and not exists (
                  select 1 from public.staff_shifts s where s.tenant_id = $1 and s.staff_user_id::text = o.cashier
                     and s.opened_at <= o.created_at and o.created_at <= coalesce(s.closed_at, now())))), 0)::bigint),
             coalesce(round(100 * sum(o.total) filter (where o.cashier is null and cash.is_cash_name(o.payment_method_name))), 0)::bigint
        from o
    $q$ into v_late, v_unattributed using p_tenant, b.start_at, b.end_at, p_outlet;
  end if;

  -- Drawers: every closed shift of the day, from its frozen expectation.
  with s as (
    select x.*, e.expected_cents, e.source as expected_source, e.breakdown,
           r.status as r_status, r.handed_over_cents, r.received_cents,
           (select coalesce(sum(m.amount) filter (where m.kind = 'pay_in'), 0) from public.shift_cash_movements m where m.shift_id = x.id) as pay_in,
           (select coalesce(sum(m.amount) filter (where m.kind = 'pay_out'), 0) from public.shift_cash_movements m where m.shift_id = x.id) as pay_out,
           (select coalesce(sum(m.amount) filter (where m.kind = 'collect'), 0) from public.shift_cash_movements m where m.shift_id = x.id) as collected
      from public.staff_shifts x
      left join public.shift_expectations e on e.shift_id = x.id
      left join public.cash_remittances r on r.shift_id = x.id and r.kind = 'shift'
     where x.tenant_id = p_tenant and x.business_day = p_day and x.status = 'closed'
       and (p_outlet is null or x.outlet_id is not distinct from p_outlet)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'shiftId', s.id, 'staff', s.staff_name, 'drawer', s.drawer_name, 'closeKind', s.close_kind,
      'floatCents', round(s.opening_float * 100)::bigint,
      'cashSalesCents', (s.breakdown ->> 'cashSalesCents')::bigint,
      'payInCents', round(s.pay_in * 100)::bigint, 'payOutCents', round(s.pay_out * 100)::bigint,
      'collectedCents', round(s.collected * 100)::bigint,
      'expectedCents', s.expected_cents, 'expectedSource', coalesce(s.expected_source, 'none'),
      'countedCents', round(s.closing_count * 100)::bigint,
      'varianceCents', round(s.closing_count * 100)::bigint - s.expected_cents,
      'remittance', case when s.r_status is null then null else jsonb_build_object(
        'status', s.r_status, 'handedOverCents', s.handed_over_cents, 'receivedCents', s.received_cents) end)
      order by s.opened_at, s.id), '[]'::jsonb),
    jsonb_build_object(
      'expectedCents', coalesce(sum(s.expected_cents), 0)::bigint,
      'countedCents', coalesce(sum(round(s.closing_count * 100)), 0)::bigint,
      'varianceCents', coalesce(sum(round(s.closing_count * 100) - s.expected_cents), 0)::bigint,
      'handedOverCents', coalesce(sum(s.handed_over_cents), 0)::bigint,
      'receivedCents', coalesce(sum(s.received_cents), 0)::bigint,
      'collectedMidShiftCents', coalesce(sum(round(s.collected * 100)), 0)::bigint),
    coalesce(sum(coalesce(s.received_cents, s.handed_over_cents)), 0)::bigint + coalesce(sum(round(s.collected * 100)), 0)::bigint
    into v_shifts, v_totals, v_cash_to_account
    from s;

  select jsonb_build_object(
           'drawerCents', coalesce(sum(x.amount_cents) filter (where x.paid_from = 'drawer'), 0)::bigint,
           'otherCents', coalesce(sum(x.amount_cents) filter (where x.paid_from <> 'drawer'), 0)::bigint)
    into v_expenses
    from public.expenses x
   where x.tenant_id = p_tenant and x.spent_on = p_day and x.status = 'recorded'
     and (p_outlet is null or x.outlet_id is not distinct from p_outlet);

  -- A recount that changed the figure stays visible (CONTRACTS WAVE-3 TODO).
  select coalesce(jsonb_agg(jsonb_build_object('shiftId', s.id, 'staffName', s.staff_name,
                                               'firstCents', c1.counted_cents, 'finalCents', c2.counted_cents)
                            order by s.opened_at), '[]'::jsonb)
    into v_recount
    from public.staff_shifts s
    join public.shift_counts c1 on c1.shift_id = s.id and c1.attempt = 1
    join public.shift_counts c2 on c2.shift_id = s.id and c2.attempt = 2
   where s.tenant_id = p_tenant and s.business_day = p_day
     and (p_outlet is null or s.outlet_id is not distinct from p_outlet)
     and c1.counted_cents <> c2.counted_cents;

  return jsonb_build_object(
    'window', jsonb_build_object('start', cash.iso(b.start_at), 'end', cash.iso(b.end_at), 'cutoffMinutes', v_cut),
    'sales', case when v_platform then jsonb_build_object(
        'netCents', v_sales -> 'summary' -> 'netCents', 'orders', v_sales -> 'summary' -> 'orders',
        'discountCents', v_sales -> 'summary' -> 'discountCents',
        'collectedByMethod', coalesce((select jsonb_agg(jsonb_build_object('bucket', p ->> 'label', 'key', p ->> 'key', 'cents', p -> 'cents'))
                                         from jsonb_array_elements(v_sales -> 'payments') p), '[]'::jsonb),
        'unpaidCents', v_sales -> 'summary' -> 'unpaidCents', 'overpaidCents', v_sales -> 'summary' -> 'overpaidCents') end,
    'drawers', jsonb_build_object('shifts', v_shifts, 'totals', v_totals),
    'cashToAccountForCents', v_cash_to_account,
    'expenses', v_expenses,
    'lateSales', coalesce(v_late, jsonb_build_object('count', 0, 'cashCents', 0)),
    'unattributedCounterCashCents', coalesce(v_unattributed, 0),
    'byServicePeriod', v_periods,
    'otherHoursNetCents', v_other,
    'recountChanged', v_recount);
end;
$fn$;
revoke all on function cash.day_close_snapshot(uuid, uuid, date) from public, anon, authenticated;

-- Cash manager reaching the branch (or the whole store for NULL).
create or replace function cash.assert_day_access(p_tenant uuid, p_outlet uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.app_user_manages_cash(p_tenant)
     or not public.app_user_may_reach_branch(p_tenant, p_outlet) then
    raise exception 'Only someone who handles cash at this branch can close its business day.' using errcode = '42501';
  end if;
  if p_outlet is not null and not exists (select 1 from public.outlets o where o.id = p_outlet and o.tenant_id = p_tenant) then
    raise exception 'That branch belongs to a different store.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function cash.assert_day_access(uuid, uuid) from public, anon, authenticated;

create or replace function cash.day_close_json(d public.business_day_closes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', d.id, 'tenantId', d.tenant_id, 'outletId', d.outlet_id,
    'businessDay', to_char(d.business_day, 'YYYY-MM-DD'), 'version', d.version, 'status', d.status,
    'windowStart', cash.iso(d.window_start), 'windowEnd', cash.iso(d.window_end), 'salesSource', d.sales_source,
    'forcedShiftIds', to_jsonb(d.forced_shift_ids), 'unsettledRemittanceIds', to_jsonb(d.unsettled_remittance_ids),
    'note', d.note, 'closedBy', d.closed_by, 'closedByName', d.closed_by_name, 'closedAt', cash.iso(d.closed_at),
    'depositCents', d.deposit_cents, 'depositTo', d.deposit_to, 'depositRef', d.deposit_ref,
    'depositProofUrl', d.deposit_proof_url, 'depositRecordedAt', cash.iso(d.deposit_recorded_at),
    'reopenedByName', d.reopened_by_name, 'reopenedAt', cash.iso(d.reopened_at), 'reopenReason', d.reopen_reason)
$$;
revoke all on function cash.day_close_json(public.business_day_closes) from public, anon, authenticated;

-- ============================================
-- get_day_close_status — the checklist
-- ============================================
create or replace function public.get_day_close_status(p_tenant uuid, p_outlet uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b record;
  v_existing public.business_day_closes;
begin
  perform cash.assert_day_access(p_tenant, p_outlet);
  if p_day is null then
    raise exception 'Pick a business day.' using errcode = '22023';
  end if;
  select * into b from cash.day_bounds(p_tenant, p_day);
  select * into v_existing from public.business_day_closes d
   where d.tenant_id = p_tenant and d.business_day = p_day and d.outlet_id is not distinct from p_outlet
   order by d.version desc limit 1;
  return jsonb_build_object(
    'businessDay', to_char(p_day, 'YYYY-MM-DD'),
    'window', jsonb_build_object('start', cash.iso(b.start_at), 'end', cash.iso(b.end_at)),
    'cutoffMinutes', coalesce((select x.cutoff_minutes::integer from public.business_day_cutoffs x
                                where x.tenant_id = p_tenant and x.effective_from <= p_day order by x.effective_from desc limit 1), 0),
    'openShifts', coalesce((select jsonb_agg(jsonb_build_object('shiftId', s.id, 'staffName', s.staff_name, 'drawerName', s.drawer_name,
                                                                'openedAt', cash.iso(s.opened_at), 'overdue', now() > cash.shift_overdue_at(s))
                                             order by s.opened_at)
                              from public.staff_shifts s
                             where s.tenant_id = p_tenant and s.business_day = p_day and s.status = 'open'
                               and (p_outlet is null or s.outlet_id is not distinct from p_outlet)), '[]'::jsonb),
    'pendingRemittances', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'cashierName', r.cashier_name,
                                                                        'handedOverCents', r.handed_over_cents, 'status', r.status, 'kind', r.kind)
                                                     order by r.created_at)
                                      from public.cash_remittances r
                                     where r.tenant_id = p_tenant and r.business_day = p_day and r.status in ('pending', 'disputed')
                                       and (p_outlet is null or r.outlet_id is not distinct from p_outlet)), '[]'::jsonb),
    'nonCashUnchecked', coalesce((select jsonb_agg(jsonb_build_object('shiftId', s.id, 'staffName', s.staff_name, 'method', m ->> 'label'))
                                    from public.staff_shifts s
                                    join public.shift_expectations e on e.shift_id = s.id
                                    cross join lateral jsonb_array_elements(coalesce(e.breakdown -> 'nonCashByMethod', '[]'::jsonb)) m
                                   where s.tenant_id = p_tenant and s.business_day = p_day and s.status = 'closed'
                                     and (p_outlet is null or s.outlet_id is not distinct from p_outlet)
                                     and not exists (select 1 from jsonb_array_elements(coalesce(s.closing_non_cash, '[]'::jsonb)) t
                                                      where coalesce(t ->> 'key', '') = m ->> 'key' and coalesce(t ->> 'check', 'matches') <> 'skipped')), '[]'::jsonb),
    'existingClose', case when v_existing.id is null then null else jsonb_build_object(
        'id', v_existing.id, 'version', v_existing.version, 'status', v_existing.status,
        'closedAt', cash.iso(v_existing.closed_at), 'closedByName', v_existing.closed_by_name) end,
    'preview', cash.day_close_snapshot(p_tenant, p_outlet, p_day));
end;
$$;
revoke all on function public.get_day_close_status(uuid, uuid, date) from public, anon;
grant execute on function public.get_day_close_status(uuid, uuid, date) to authenticated;

-- ============================================
-- close_business_day
-- ============================================
create or replace function public.close_business_day(p_tenant uuid, p_outlet uuid, p_day date, p_note text default null, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_open text;
  v_unsettled uuid[];
  v_snapshot jsonb;
  v_version smallint;
  d public.business_day_closes;
begin
  perform cash.assert_day_access(p_tenant, p_outlet);
  if p_day is null or p_day > cash.business_day_of(p_tenant, now()) then
    raise exception 'A business day can be closed once it has started, not before.' using errcode = '22023';
  end if;
  perform cash.lock_day(p_tenant, p_outlet, p_day);

  -- 1. An open shift always blocks: the day close never closes shifts itself.
  select string_agg(coalesce(s.staff_name, 'Someone'), ', ' order by s.opened_at) into v_open
    from public.staff_shifts s
   where s.tenant_id = p_tenant and s.business_day = p_day and s.status = 'open'
     and (p_outlet is null or s.outlet_id is not distinct from p_outlet);
  if v_open is not null then
    raise exception 'open_shifts: end these shifts first: %', v_open using errcode = '55000';
  end if;
  -- 2. Unsettled hand-overs block only in 'required' mode, unless forced with a note.
  select coalesce(array_agg(r.id order by r.created_at), '{}') into v_unsettled
    from public.cash_remittances r
   where r.tenant_id = p_tenant and r.business_day = p_day and r.status in ('pending', 'disputed')
     and (p_outlet is null or r.outlet_id is not distinct from p_outlet);
  if coalesce(p_force, false) and v_note is null then
    raise exception 'note_required: say why the day is closed anyway.' using errcode = '22023';
  end if;
  if cardinality(v_unsettled) > 0 and (cash.settings_of(p_tenant)).remittance_mode = 'required' and not coalesce(p_force, false) then
    raise exception 'unsettled_remittances: % hand-over(s) still to accept', cardinality(v_unsettled) using errcode = '55000';
  end if;
  -- 3. One live close per day (the partial unique index also says 23505).
  if exists (select 1 from public.business_day_closes x where x.tenant_id = p_tenant and x.business_day = p_day
              and x.outlet_id is not distinct from p_outlet and x.status = 'closed') then
    raise exception 'already_closed: this business day is already closed.' using errcode = '23505';
  end if;

  select * into b from cash.day_bounds(p_tenant, p_day);
  v_snapshot := cash.day_close_snapshot(p_tenant, p_outlet, p_day);
  select coalesce(max(x.version), 0) + 1 into v_version from public.business_day_closes x
   where x.tenant_id = p_tenant and x.business_day = p_day and x.outlet_id is not distinct from p_outlet;
  insert into public.business_day_closes (tenant_id, outlet_id, business_day, version, window_start, window_end, snapshot,
                                          snapshot_version, sales_source, forced_shift_ids, unsettled_remittance_ids,
                                          note, closed_by, closed_by_name)
  values (p_tenant, p_outlet, p_day, v_version, b.start_at, b.end_at, v_snapshot, 1,
          case when cash.tenant_order_backend(p_tenant) = 'platform' then 'platform_sql' else 'drawers_only' end,
          coalesce((select array_agg(s.id order by s.opened_at) from public.staff_shifts s
                     where s.tenant_id = p_tenant and s.business_day = p_day and s.close_kind = 'forced'
                       and (p_outlet is null or s.outlet_id is not distinct from p_outlet)), '{}'),
          v_unsettled, v_note, auth.uid(), coalesce(cash.actor_name(), 'Staff'))
  returning * into d;

  perform public.store_activity_record(
    p_tenant_id => p_tenant, p_kind => 'day.closed', p_event_key => 'business_day_closes:' || d.id || ':closed',
    p_source_table => 'business_day_closes', p_source_id => d.id::text, p_occurred_at => now(), p_outlet_id => p_outlet,
    p_actor_user_id => auth.uid(), p_note => v_note, p_subject_type => 'day_close', p_subject_ref => d.id::text,
    p_amount => (v_snapshot ->> 'cashToAccountForCents')::numeric / 100,
    p_summary => jsonb_build_object('title', 'Closed ' || to_char(p_day, 'FMDy FMDD FMMon')
      || case when d.version > 1 then ' again (version ' || d.version || ')' else '' end
      || ' · cash to account for ' || public.store_activity_peso((v_snapshot ->> 'cashToAccountForCents')::numeric / 100)));
  return jsonb_build_object('id', d.id, 'version', d.version, 'snapshot', d.snapshot);
end;
$$;
revoke all on function public.close_business_day(uuid, uuid, date, text, boolean) from public, anon;
grant execute on function public.close_business_day(uuid, uuid, date, text, boolean) to authenticated;

-- ============================================
-- reopen_business_day — owner / superadmin, within 31 days
-- ============================================
create or replace function public.reopen_business_day(p_close_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.business_day_closes;
  v_rows integer;
begin
  select * into d from public.business_day_closes where id = p_close_id;
  if not found then
    raise exception 'That day close was not found.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not exists (
       select 1 from public.app_users au
        where au.user_id = auth.uid() and (au.role = 'superadmin' or (au.tenant_id = d.tenant_id and au.is_owner is true))) then
    raise exception 'Only the owner can reopen a closed day.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required: say why the day is reopened.' using errcode = '22023';
  end if;
  if d.business_day < cash.business_day_of(d.tenant_id, now()) - 31 then
    raise exception 'A day can be reopened within 31 days.' using errcode = '22023';
  end if;
  update public.business_day_closes x
     set status = 'reopened', reopened_by = auth.uid(), reopened_by_name = coalesce(cash.actor_name(), 'Owner'),
         reopened_at = now(), reopen_reason = btrim(p_reason)
   where x.id = p_close_id and x.status = 'closed'
  returning * into d;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'not_closed: this day close was already reopened.' using errcode = 'P0002';
  end if;
  perform public.store_activity_record(
    p_tenant_id => d.tenant_id, p_kind => 'day.reopened', p_event_key => 'business_day_closes:' || d.id || ':reopened',
    p_source_table => 'business_day_closes', p_source_id => d.id::text, p_occurred_at => now(), p_outlet_id => d.outlet_id,
    p_actor_user_id => auth.uid(), p_reason => d.reopen_reason, p_subject_type => 'day_close', p_subject_ref => d.id::text,
    p_summary => jsonb_build_object('title', 'Reopened ' || to_char(d.business_day, 'FMDy FMDD FMMon')),
    p_flags => array['day_reopened']);
  return cash.day_close_json(d);
end;
$$;
revoke all on function public.reopen_business_day(uuid, text) from public, anon;
grant execute on function public.reopen_business_day(uuid, text) to authenticated;

-- ============================================
-- record_day_deposit — set once
-- ============================================
create or replace function public.record_day_deposit(p_close_id uuid, p_cents bigint, p_to text, p_ref text default null, p_proof_url text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.business_day_closes;
  v_rows integer;
begin
  select * into d from public.business_day_closes where id = p_close_id;
  if not found then
    raise exception 'That day close was not found.' using errcode = 'P0002';
  end if;
  perform cash.assert_day_access(d.tenant_id, d.outlet_id);
  if p_cents is null or p_cents not between 0 and 10000000000 then
    raise exception 'The deposit must be between ₱0 and ₱100,000,000.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_to, '')), '') is null or char_length(btrim(p_to)) > 80 or char_length(coalesce(p_ref, '')) > 80 then
    raise exception 'Say where the deposit went (up to 80 characters).' using errcode = '22023';
  end if;
  -- A proof is an https link (the app's image upload), never a data: or javascript: URL.
  if p_proof_url is not null and (p_proof_url !~ '^https://[^\s/]+/' or char_length(p_proof_url) > 500) then
    raise exception 'The deposit photo link is not valid.' using errcode = '22023';
  end if;
  update public.business_day_closes x
     set deposit_cents = p_cents, deposit_to = btrim(p_to), deposit_ref = nullif(btrim(coalesce(p_ref, '')), ''),
         deposit_proof_url = p_proof_url, deposit_recorded_by = auth.uid(), deposit_recorded_at = now()
   where x.id = p_close_id and x.deposit_recorded_at is null and x.status = 'closed'
  returning * into d;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'deposit_already_recorded: this day''s deposit is already recorded (or the day was reopened).' using errcode = 'P0002';
  end if;
  perform public.store_activity_record(
    p_tenant_id => d.tenant_id, p_kind => 'day.deposit_recorded', p_event_key => 'business_day_closes:' || d.id || ':deposit',
    p_source_table => 'business_day_closes', p_source_id => d.id::text, p_occurred_at => now(), p_outlet_id => d.outlet_id,
    p_actor_user_id => auth.uid(), p_amount => p_cents::numeric / 100, p_subject_type => 'day_close', p_subject_ref => d.id::text,
    p_summary => jsonb_build_object('title', 'Deposit ' || public.store_activity_peso(p_cents::numeric / 100) || ' · ' || d.deposit_to));
  return cash.day_close_json(d);
end;
$$;
revoke all on function public.record_day_deposit(uuid, bigint, text, text, text) from public, anon;
grant execute on function public.record_day_deposit(uuid, bigint, text, text, text) to authenticated;

-- ============================================
-- get_business_day_close — one close; sales masked without `reports`
-- ============================================
create or replace function public.get_business_day_close(p_close_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.business_day_closes;
begin
  select * into d from public.business_day_closes where id = p_close_id;
  if not found then
    raise exception 'That day close was not found.' using errcode = 'P0002';
  end if;
  perform cash.assert_day_access(d.tenant_id, d.outlet_id);
  return cash.day_close_json(d) || jsonb_build_object(
    'snapshot', case when public.app_user_has_permission(d.tenant_id, 'reports') then d.snapshot
                     else d.snapshot || jsonb_build_object('sales', null, 'byServicePeriod', null, 'otherHoursNetCents', null, 'salesMasked', true) end);
end;
$$;
revoke all on function public.get_business_day_close(uuid) from public, anon;
grant execute on function public.get_business_day_close(uuid) to authenticated;

-- ============================================
-- Closed-day guard on clock-in (staff_shift_business_day_stamp, 20261027150000 + guard)
-- ============================================
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
    -- Same lock as close_business_day (store-wide first, then the branch), so a
    -- clock-in cannot slip in while the day closes; then refuse a closed day.
    perform cash.lock_day(new.tenant_id, null, new.business_day);
    if new.outlet_id is not null then
      perform cash.lock_day(new.tenant_id, new.outlet_id, new.business_day);
    end if;
    if cash.day_is_closed(new.tenant_id, new.outlet_id, new.business_day) then
      raise exception 'day_closed: this business day is closed. Reopen it, or wait until the next business day starts.' using errcode = '55000';
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

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- re-create staff_shift_business_day_stamp from 20261027150000 and the vocabulary from 20261027150000;
-- drop function if exists public.get_business_day_close(uuid), public.record_day_deposit(uuid, bigint, text, text, text),
--   public.reopen_business_day(uuid, text), public.close_business_day(uuid, uuid, date, text, boolean),
--   public.get_day_close_status(uuid, uuid, date);
-- drop function if exists cash.day_close_json(public.business_day_closes), cash.assert_day_access(uuid, uuid),
--   cash.day_close_snapshot(uuid, uuid, date), cash.day_is_closed(uuid, uuid, date), cash.lock_day(uuid, uuid, date),
--   cash.day_bounds(uuid, date), cash.service_period_window(uuid, date, integer, integer);
-- drop table if exists public.business_day_closes;
