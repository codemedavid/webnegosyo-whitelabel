-- ===========================================================================
-- Three server writers follow the business day (P3 of
-- docs/plans/cashier-remittance, CONTRACTS §1.2 / W2.2, 07 §2.4).
--
--   1. Daily order number (#01) resets at the cutoff: orders.order_date =
--      the business day the order was placed in (Asia/Manila stores; any
--      other zone keeps its calendar date). The counter and the unique index
--      are keyed by (tenant, order_date), and business days never overlap, so
--      numbers stay unique across a cutoff change. Past orders keep their
--      order_date (it WAS their business day: no cutoff existed).
--      TS copy of the day rule: src/lib/supabase-order-schema.ts (bizday);
--      Convex orderNumber.ts follows with its next bundle (bizday).
--   2. inventory_counts.business_day: stamped by the server for signed-in
--      callers (the client used to compute it); jobs keep what they send.
--   3. expenses drawer pay-outs: spent_on = the business day of the pay-out,
--      so a 1 AM ice run lands on the same day as that shift's sales.
--
-- cash.business_day_of: the same answer as public.business_day_of WITHOUT the
-- caller-membership check, for definer triggers whose writer may be a
-- platform-staff account or a checkout guest. Never granted to clients.
-- Runner: tests/sql/run-business-day-adopters.cjs.
-- ===========================================================================

set lock_timeout = '3s';

create or replace function cash.business_day_of(p_tenant uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  -- Same rule as public.business_day_of: an instant on Manila date D is in day
  -- D once D's own cutoff has passed, else in day D−1.
  with l as (select p_at at time zone 'Asia/Manila' as local_at)
  select case
           when l.local_at >= l.local_at::date + make_interval(mins => coalesce((
             select x.cutoff_minutes::integer from public.business_day_cutoffs x
              where x.tenant_id = p_tenant and x.effective_from <= l.local_at::date
              order by x.effective_from desc limit 1), 0))
             then l.local_at::date
           else l.local_at::date - 1
         end
    from l;
$$;
comment on function cash.business_day_of(uuid, timestamptz) is
  'public.business_day_of without the membership check, for server triggers. Not granted to clients.';
revoke all on function cash.business_day_of(uuid, timestamptz) from public, anon, authenticated;
grant execute on function cash.business_day_of(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 1. Daily order number (live body of 20260924120000 + the business day).
-- ---------------------------------------------------------------------------
create or replace function public.assign_daily_order_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare zone text;
begin
  -- A restored order keeps the number the kitchen and the customer saw — or
  -- none, for orders placed before daily numbers existed. Restoring must not
  -- draw from today's counter.
  if current_setting('app.order_restore', true) = 'on' then
    return new;
  end if;
  select coalesce(timezone, 'Asia/Manila') into zone from tenants where id = new.tenant_id;
  -- #01 starts at the store's business-day cutoff (no cutoff = Manila midnight).
  new.order_date := case
    when coalesce(zone, 'Asia/Manila') = 'Asia/Manila' then cash.business_day_of(new.tenant_id, coalesce(new.created_at, now()))
    else (coalesce(new.created_at, now()) at time zone zone)::date
  end;
  -- Never trust a caller-supplied display number or let it bypass the counter.
  new.daily_number := next_daily_order_number(new.tenant_id, new.order_date);
  return new;
end $$;
revoke all on function public.assign_daily_order_number() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. inventory_counts.business_day: the server's for signed-in callers.
-- SECURITY DEFINER (cash.business_day_of); "signed in" = a JWT subject.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_count_business_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null or new.business_day is null then
    new.business_day := cash.business_day_of(new.tenant_id, now());
  end if;
  return new;
end;
$$;
revoke all on function public.inventory_count_business_day() from public, anon, authenticated;

drop trigger if exists inventory_counts_10_business_day on public.inventory_counts;
create trigger inventory_counts_10_business_day before insert on public.inventory_counts
  for each row execute function public.inventory_count_business_day();

-- ---------------------------------------------------------------------------
-- 3. expenses_drawer_link (live body of 20261022120000) — spent_on is the
-- business day of the pay-out. SECURITY INVOKER as before: the writer is a
-- member of the store (or the service role), so public.business_day_of answers.
-- ---------------------------------------------------------------------------
create or replace function public.expenses_drawer_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m record;
  v_client boolean := current_user in ('anon', 'authenticated');
begin
  if new.paid_from <> 'drawer' then
    return new;
  end if;
  if new.shift_cash_movement_id is null then
    raise exception 'drawer_movement_required' using errcode = '22023';
  end if;

  select scm.tenant_id, scm.outlet_id, scm.kind, scm.amount, scm.created_at, scm.recorded_by
    into m
    from public.shift_cash_movements scm
   where scm.id = new.shift_cash_movement_id;
  if not found or m.tenant_id <> new.tenant_id then
    raise exception 'Drawer pay-out belongs to a different store' using errcode = '42501';
  end if;
  if m.kind <> 'pay_out' then
    raise exception 'not_a_pay_out' using errcode = '22023';
  end if;
  if round(m.amount * 100) <> new.amount_cents then
    raise exception 'drawer_amount_mismatch' using errcode = '22023';
  end if;

  if v_client and not coalesce((
    -- (a) the person who took the cash out, while they hold pos or expenses
    (m.recorded_by = auth.uid()
      and (public.app_user_has_permission(new.tenant_id, 'pos')
           or public.app_user_has_permission(new.tenant_id, 'expenses')))
    -- (b) whoever keeps the books for that branch (sorting old pay-outs)
    or (public.app_user_has_permission(new.tenant_id, 'expenses')
        and public.app_user_may_reach_branch(new.tenant_id, m.outlet_id))
  ), false) then
    raise exception 'You may not sort this drawer pay-out' using errcode = '42501';
  end if;

  new.outlet_id := m.outlet_id;
  -- The business day of the pay-out (20261027140100), not its calendar date.
  new.spent_on := public.business_day_of(new.tenant_id, m.created_at);
  new.status := 'recorded';
  new.void_reason := null;
  new.voided_by := null;
  new.voided_at := null;
  return new;
end;
$$;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- re-create assign_daily_order_number from 20260924120000 and
--   expenses_drawer_link from 20261022120000;
-- drop trigger if exists inventory_counts_10_business_day on public.inventory_counts;
-- drop function if exists public.inventory_count_business_day();
-- drop function if exists cash.business_day_of(uuid, timestamptz);
