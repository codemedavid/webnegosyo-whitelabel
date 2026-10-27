-- ===========================================================================
-- Expected cash computed and frozen by the server — SHADOW phase
-- (P2 of docs/plans/cashier-remittance, CONTRACTS W2.2, 07 §3.3–3.5).
--
-- Today the register computes "expected cash" and the shift row stores
-- whatever it sends (a cashier could close with expected = counted). On
-- platform stores the database holds every order and payment, so it can work
-- the figure out itself:
--
--   cash.shift_expected(shift, until)   SQL twin of the app's
--                                       summarizeShiftDrawer + reconcileShift
--                                       (webnegosyo-app/lib/shift-drawer.ts,
--                                       pos-sales.ts, shift.ts). Change both;
--                                       tests/unit/cash/shift-expected-sql-parity.property.test.ts
--   shift_expectations                  one frozen row per closed shift:
--                                       server figure + device figure + provenance
--   trg_staff_shift_zz_expectation      freezes it on EVERY close path
--                                       (legacy direct UPDATE and the RPCs)
--   cash.expected_mode()                'shadow' here: the device figure stays
--                                       the one on staff_shifts.expected_cash.
--                                       20261027130100 switches it to 'server'
--                                       after the live drift probe — written,
--                                       NOT to be applied before that.
--   cash.choose_expected(server, device) the one rule every RPC uses to pick.
--
-- Convex / tenant-Supabase stores: the orders are not here; the device figure
-- is stored with source 'device'. Neither figure → 'none'.
-- Runner: tests/sql/run-shift-expectations.cjs.
-- ===========================================================================

set lock_timeout = '3s';

-- JS \s (String.prototype.trim / RegExp): ASCII whitespace, NBSP, Unicode
-- spaces, line separators, BOM — spelled out ([[:space:]] is locale-bound).
-- pos-payment-methods.ts CASH_NAME = /(^|\s)(cash|cod)(\s|$)/i.
create or replace function cash.is_cash_name(p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_name ~* '(^|[\t\n\v\f\r    -     　﻿])(cash|cod)([\t\n\v\f\r    -     　﻿]|$)', false)
$$;

-- readPosPayment(customer_data).cashierId when it is a string, else NULL.
create or replace function cash.pos_cashier(p_customer_data jsonb)
returns text
language sql
immutable
as $$
  select case when jsonb_typeof(p_customer_data -> 'pos') = 'object'
               and jsonb_typeof(p_customer_data -> 'pos' -> 'cashierId') = 'string'
              then p_customer_data -> 'pos' ->> 'cashierId' end
$$;

-- isPosPayLater(customer_data): pos.payLater === true.
create or replace function cash.pos_pay_later(p_customer_data jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(jsonb_typeof(p_customer_data -> 'pos') = 'object'
                  and p_customer_data -> 'pos' -> 'payLater' = 'true'::jsonb, false)
$$;

-- getOrderOutletId(): the column, else customer_data.outlet_id, trimmed; NULL if none.
create or replace function cash.order_outlet(p_outlet_id uuid, p_customer_data jsonb)
returns text
language sql
immutable
as $$
  select coalesce(p_outlet_id::text,
                  case when jsonb_typeof(p_customer_data -> 'outlet_id') = 'string'
                       then nullif(reporting.trim_text(p_customer_data ->> 'outlet_id'), '') end)
$$;

revoke all on function cash.is_cash_name(text), cash.pos_cashier(jsonb), cash.pos_pay_later(jsonb),
  cash.order_outlet(uuid, jsonb) from public, anon;
grant execute on function cash.is_cash_name(text), cash.pos_cashier(jsonb), cash.pos_pay_later(jsonb),
  cash.order_outlet(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cash.shift_expected(shift, until): what the drawer should hold at p_until.
--
-- The app's rules, one for one (each is an arm of the parity property test):
--   * window INCLUSIVE at both ends: opened_at <= t <= p_until;
--   * branch: the order's outlet (column, else customer_data.outlet_id) must
--     equal the shift's (NULL = unbranched: the order must have none);
--   * an order with NO ledger rows counts when source = 'pos', status is not
--     exactly 'cancelled', pos.cashierId = the shift's staff (non-empty), and it
--     was created in the window: total, or amount_paid for a pay-later sale;
--   * an order WITH ledger rows counts only its rows recorded by this person
--     (recorded_by, else pos.cashierId) inside the window — on any order,
--     cancelled or online included; a refund row subtracts;
--   * cash = the method name matches CASH_NAME; everything else is non-cash;
--   * expected = float + cash + pay in − pay out − collected; float kept = 0
--     on a zero-balance drawer.
-- The server can be MORE complete than the device (it sees every order); the
-- live drift probe measures that before 130100.
-- Bounded: orders by (tenant_id, created_at), payments by (tenant_id,
-- created_at), both within the shift's window; orders joined by primary key.
-- ---------------------------------------------------------------------------
create or replace function cash.shift_expected(p_shift public.staff_shifts, p_until timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_staff text := coalesce(p_shift.staff_user_id::text, '');
  v_outlet text := p_shift.outlet_id::text;
  r jsonb;
begin
  execute $q$
    with
    legacy as (
      select o.id, o.payment_method_name as method,
             case when cash.pos_pay_later(o.customer_data) then coalesce(o.amount_paid, 0) else o.total end as amount
        from public.orders o
       where o.tenant_id = $1
         and o.created_at >= $2 and o.created_at <= $3
         and o.source = 'pos'
         and o.status is distinct from 'cancelled'
         and $4 <> ''
         and cash.pos_cashier(o.customer_data) = $4
         and cash.order_outlet(o.outlet_id, o.customer_data) is not distinct from $5
         and not exists (select 1 from public.order_payments p where p.order_id = o.id)
    ),
    ledger as (
      select p.order_id as id, p.payment_method_name as method,
             case when p.kind = 'refund' then -p.amount else p.amount end as amount,
             case when p.kind = 'refund' then p.amount else 0 end as refund
        from public.order_payments p
        join public.orders o on o.id = p.order_id
       where p.tenant_id = $1
         and p.created_at >= $2 and p.created_at <= $3
         and o.tenant_id = $1
         and cash.order_outlet(o.outlet_id, o.customer_data) is not distinct from $5
         and coalesce(p.recorded_by::text, cash.pos_cashier(o.customer_data)) = $4
    ),
    parts as (
      select l.id, l.method, l.amount, 0::numeric as refund from legacy l
      union all
      select g.id, g.method, g.amount, g.refund from ledger g
    ),
    moves as (
      select coalesce(sum(m.amount) filter (where m.kind = 'pay_in'), 0) as pay_in,
             coalesce(sum(m.amount) filter (where m.kind = 'pay_out'), 0) as pay_out,
             coalesce(sum(m.amount) filter (where m.kind = 'collect'), 0) as collected
        from public.shift_cash_movements m
       where m.shift_id = $6
    ),
    by_method as (
      select case when reporting.fold_name(p.method) = '' then 'unspecified' else 'name:' || reporting.fold_name(p.method) end as key,
             (array_agg(nullif(reporting.trim_text(p.method), '') order by p.method) filter (where nullif(reporting.trim_text(p.method), '') is not null))[1] as label,
             round(sum(p.amount) * 100)::bigint as cents,
             count(distinct p.id) as orders
        from parts p
       where not cash.is_cash_name(p.method)
       group by 1
      having round(sum(p.amount) * 100) <> 0
    )
    select jsonb_build_object(
      'engineVersion', 1,
      'cashSalesCents', round(coalesce((select sum(p.amount) from parts p where cash.is_cash_name(p.method)), 0) * 100)::bigint,
      'nonCashCents', round(coalesce((select sum(p.amount) from parts p where not cash.is_cash_name(p.method)), 0) * 100)::bigint,
      'nonCashByMethod', coalesce((select jsonb_agg(jsonb_build_object('key', b.key, 'label', coalesce(b.label, 'Not recorded'), 'cents', b.cents, 'count', b.orders)
                                                    order by b.cents desc, b.key) from by_method b), '[]'::jsonb),
      'refundCents', round(coalesce((select sum(g.refund) from ledger g), 0) * 100)::bigint,
      'saleCount', (select count(*) from legacy) + (select count(distinct g.id) from ledger g),
      'payInCents', round(m.pay_in * 100)::bigint,
      'payOutCents', round(m.pay_out * 100)::bigint,
      'collectedCents', round(m.collected * 100)::bigint)
      from moves m
  $q$ into r using p_shift.tenant_id, p_shift.opened_at, p_until, v_staff, v_outlet, p_shift.id;

  return r || jsonb_build_object(
    'floatCents', round(p_shift.opening_float * 100)::bigint,
    'floatKeptCents', case when p_shift.is_zero_balance then 0 else round(p_shift.opening_float * 100)::bigint end,
    'isZeroBalance', p_shift.is_zero_balance,
    'until', cash.iso(p_until),
    'expectedCents', round(p_shift.opening_float * 100)::bigint + (r ->> 'cashSalesCents')::bigint
                     + (r ->> 'payInCents')::bigint - (r ->> 'payOutCents')::bigint - (r ->> 'collectedCents')::bigint);
end;
$fn$;

comment on function cash.shift_expected(public.staff_shifts, timestamptz) is
  'Server twin of summarizeShiftDrawer + reconcileShift: what the drawer should hold at p_until (centavos, with breakdown). Change both; shift-expected-sql-parity.property.test.ts.';

revoke all on function cash.shift_expected(public.staff_shifts, timestamptz) from public, anon, authenticated;
grant execute on function cash.shift_expected(public.staff_shifts, timestamptz) to service_role;

-- 'shadow': the device figure stays authoritative; the server's is recorded.
-- 20261027130100 redefines this one function to return 'server'.
create or replace function cash.expected_mode()
returns text
language sql
stable
as $$ select 'shadow'::text $$;

-- The one rule for "the" expected figure (count_shift, close_shift, preview).
create or replace function cash.choose_expected(p_server_cents bigint, p_device_cents bigint)
returns bigint
language sql
stable
as $$
  select case when cash.expected_mode() = 'server' then coalesce(p_server_cents, p_device_cents)
              else coalesce(p_device_cents, p_server_cents) end
$$;
create or replace function cash.choose_source(p_server_cents bigint, p_device_cents bigint)
returns text
language sql
stable
as $$
  select case
           when cash.expected_mode() = 'server' and p_server_cents is not null then 'server'
           when p_device_cents is not null then 'device'
           when p_server_cents is not null then 'server'
           else 'none'
         end
$$;
revoke all on function cash.expected_mode(), cash.choose_expected(bigint, bigint), cash.choose_source(bigint, bigint) from public, anon;
grant execute on function cash.expected_mode(), cash.choose_expected(bigint, bigint), cash.choose_source(bigint, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- shift_expectations: frozen at close, never recomputed.
-- ---------------------------------------------------------------------------
create table if not exists public.shift_expectations (
  shift_id               uuid primary key references public.staff_shifts(id) on delete restrict,
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  outlet_id              uuid references public.outlets(id) on delete restrict,
  -- Which figure staff_shifts.expected_cash carries ('server' | 'device' | 'none').
  source                 text not null,
  expected_cents         bigint,
  -- The server's own figure (platform stores), whatever the source.
  server_expected_cents  bigint,
  -- What the register said.
  device_expected_cents  bigint,
  breakdown              jsonb not null default '{}'::jsonb,
  engine_version         smallint not null,
  mode                   text not null,
  computed_at            timestamptz not null default now(),
  constraint shift_expectations_source_ck check (source in ('server', 'device', 'none')),
  constraint shift_expectations_none_ck check ((source = 'none') = (expected_cents is null)),
  constraint shift_expectations_mode_ck check (mode in ('shadow', 'server'))
);

comment on table public.shift_expectations is
  'Expected cash frozen at close: the server''s figure (platform stores), the register''s, and which one the shift carries. Written only by the close trigger.';

create index if not exists shift_expectations_tenant on public.shift_expectations (tenant_id, computed_at desc);

alter table public.shift_expectations enable row level security;

-- A cash manager reads every shift they reach; the cashier reads their own
-- unless the shift was blind (20261027150000 also opens it once counted).
drop policy if exists shift_expectations_read on public.shift_expectations;
create policy shift_expectations_read on public.shift_expectations for select to authenticated
  using (public.app_user_may_reach_branch(tenant_id, outlet_id)
         and (public.app_user_manages_cash(tenant_id)
              or exists (select 1 from public.staff_shifts s
                          where s.id = shift_expectations.shift_id
                            and s.staff_user_id = auth.uid() and not s.is_blind)));

revoke all on public.shift_expectations from anon, authenticated;
grant select on public.shift_expectations to authenticated;
grant all on public.shift_expectations to service_role;

-- ---------------------------------------------------------------------------
-- The freeze. BEFORE UPDATE, named to run after trg_staff_shift_stamp_times
-- (server closed_at) and trg_staff_shift_zz_business_day (close_kind).
-- SECURITY DEFINER: writes shift_expectations, which has no client policy.
-- The close RPCs mark the transaction (app.shift_rpc = 'close:<id>') so the
-- device figure they send is not confused with the expected_cash they set.
-- ---------------------------------------------------------------------------
create or replace function cash.freeze_shift_expectation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_server bigint;
  v_device bigint;
  v_source text;
  v_rpc boolean := coalesce(current_setting('app.shift_rpc', true), '') = 'close:' || new.id::text;
begin
  if not (old.status = 'open' and new.status = 'closed') then
    return new;
  end if;
  if not v_rpc then
    -- Legacy close: what the register sent IS its figure.
    new.device_expected_cash := coalesce(new.device_expected_cash, new.expected_cash);
  end if;
  v_device := round(new.device_expected_cash * 100)::bigint;
  if cash.tenant_order_backend(new.tenant_id) = 'platform' then
    begin
      v := cash.shift_expected(new, new.closed_at);
      v_server := (v ->> 'expectedCents')::bigint;
    exception when others then
      raise warning 'shift expectation fell back to the device figure: % (%)', sqlerrm, sqlstate;
      v := null;
      v_server := null;
    end;
  end if;
  v_source := cash.choose_source(v_server, v_device);
  insert into public.shift_expectations (shift_id, tenant_id, outlet_id, source, expected_cents,
                                         server_expected_cents, device_expected_cents, breakdown, engine_version, mode)
  values (new.id, new.tenant_id, new.outlet_id, v_source, cash.choose_expected(v_server, v_device),
          v_server, v_device, coalesce(v, '{}'::jsonb), 1, cash.expected_mode())
  on conflict (shift_id) do nothing;
  -- An RPC close already wrote the expectation the cashier counted against
  -- (count_shift picks the server figure first in server mode). Recomputing
  -- it here would move the target after the count and fake a variance.
  if cash.expected_mode() = 'server' and v_server is not null and not v_rpc then
    new.expected_cash := v_server::numeric / 100;
  end if;
  return new;
end;
$$;

revoke all on function cash.freeze_shift_expectation() from public, anon, authenticated;

drop trigger if exists trg_staff_shift_zz_expectation on public.staff_shifts;
create trigger trg_staff_shift_zz_expectation before update on public.staff_shifts
  for each row execute function cash.freeze_shift_expectation();

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop trigger if exists trg_staff_shift_zz_expectation on public.staff_shifts;
-- drop function if exists cash.freeze_shift_expectation();
-- drop table if exists public.shift_expectations;
-- drop function if exists cash.choose_source(bigint, bigint), cash.choose_expected(bigint, bigint), cash.expected_mode();
-- drop function if exists cash.shift_expected(public.staff_shifts, timestamptz);
-- drop function if exists cash.order_outlet(uuid, jsonb), cash.pos_pay_later(jsonb), cash.pos_cashier(jsonb), cash.is_cash_name(text);
