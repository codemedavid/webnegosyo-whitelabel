-- ===========================================================================
-- Cash alerts in the merchant bell (P7 of docs/plans/cashier-remittance,
-- CONTRACTS W3.1 / W3.3, 07 §6).
--
--   merchant_notifications   + kinds 'shift_overdue', 'remittance_pending'
--                            + nullable shift_id, remittance_id, drawer_name,
--                              cash_cents (remittance_pending only).
--                              item_name = the person's name at notice time.
--   cash.notify_overdue_shifts()  every 15 minutes (pg_cron 'cash-alerts'):
--                            * an OPEN shift past the end of its business day
--                              + the store's overdue grace → one shift_overdue;
--                            * a hand-over still PENDING 60 minutes after it
--                              was made → one remittance_pending.
--                            Each at most once (partial unique indexes). The
--                            existing statement trigger posts the new ids to
--                            /api/push/notify-merchant, which sends them with
--                            data {type:'cash_alert', kind, shiftId?, remittanceId?}.
--                            Forgotten shifts are never closed or counted here.
--   Visibility by kind       app_user_may_read_merchant_notifications(tenant,
--                            outlet, kind): stock kinds as before (`menu`); cash
--                            kinds need cash_manage (owner / NULL permissions /
--                            the key), branch-locked accounts their branch only.
--                            Mirrors: canReadCashNotification
--                            (src/lib/push/merchant-notification-push.ts) and
--                            the app's canSeeCashNotifications — change together.
-- Runner: tests/sql/run-cash-alerts.cjs.
-- ===========================================================================

set lock_timeout = '3s';

alter table public.merchant_notifications
  add column if not exists shift_id uuid references public.staff_shifts(id) on delete set null,
  add column if not exists remittance_id uuid references public.cash_remittances(id) on delete set null,
  add column if not exists drawer_name text,
  add column if not exists cash_cents bigint;

alter table public.merchant_notifications drop constraint if exists merchant_notifications_kind_check;
alter table public.merchant_notifications add constraint merchant_notifications_kind_check
  check (kind in ('stock_low', 'stock_out', 'shift_overdue', 'remittance_pending'));

-- At most one notice per overdue shift and per waiting hand-over.
create unique index if not exists merchant_notifications_shift_overdue_once
  on public.merchant_notifications (shift_id) where kind = 'shift_overdue';
create unique index if not exists merchant_notifications_remittance_pending_once
  on public.merchant_notifications (remittance_id) where kind = 'remittance_pending';
create index if not exists cash_remittances_pending_age
  on public.cash_remittances (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Visibility by kind. The 2-argument function (20261012120000) stays as it
-- was for the stock kinds.
-- ---------------------------------------------------------------------------
create or replace function public.app_user_may_read_merchant_notifications(
  target_tenant_id uuid,
  target_outlet_id uuid,
  target_kind text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_kind in ('shift_overdue', 'remittance_pending') then exists (
      select 1
        from public.app_users au
       where au.user_id = auth.uid()
         and au.tenant_id = target_tenant_id
         and au.role = any (array['admin', 'superadmin'])
         and (
           coalesce(au.is_owner, false)
           or au.role = 'superadmin'
           or au.permissions is null
           or 'cash_manage' = any (au.permissions)
         )
         and (
           target_outlet_id is null
           or au.outlet_id is null
           or coalesce(au.is_owner, false)
           or au.outlet_id = target_outlet_id
         ))
    else public.app_user_may_read_merchant_notifications(target_tenant_id, target_outlet_id)
  end
$$;
revoke all on function public.app_user_may_read_merchant_notifications(uuid, uuid, text) from public, anon;
grant execute on function public.app_user_may_read_merchant_notifications(uuid, uuid, text) to authenticated;

drop policy if exists merchant_notifications_read on public.merchant_notifications;
create policy merchant_notifications_read on public.merchant_notifications
  for select to authenticated
  using (public.app_user_may_read_merchant_notifications(tenant_id, outlet_id, kind));

-- ---------------------------------------------------------------------------
-- The notifier. Bounded: open shifts by idx_staff_shifts_open (opened_at,
-- status = 'open'), pending hand-overs by cash_remittances_pending_age; only
-- the last 31 days are looked at (older ones were notified long ago).
-- ---------------------------------------------------------------------------
create or replace function cash.notify_overdue_shifts()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shifts integer;
  v_remits integer;
begin
  insert into public.merchant_notifications (tenant_id, outlet_id, kind, shift_id, item_name, drawer_name, outlet_name)
  select s.tenant_id, s.outlet_id, 'shift_overdue', s.id, coalesce(nullif(btrim(s.staff_name), ''), 'Someone'), s.drawer_name,
         (select o.name from public.outlets o where o.id = s.outlet_id)
    from public.staff_shifts s
   where s.status = 'open'
     and s.opened_at < now() - interval '12 hours'
     and s.opened_at > now() - interval '31 days'
     and now() > cash.shift_overdue_at(s)
  on conflict do nothing;
  get diagnostics v_shifts = row_count;

  insert into public.merchant_notifications (tenant_id, outlet_id, kind, remittance_id, shift_id, item_name, drawer_name, outlet_name, cash_cents)
  select r.tenant_id, r.outlet_id, 'remittance_pending', r.id, r.shift_id, coalesce(nullif(btrim(r.cashier_name), ''), 'Someone'),
         (select s.drawer_name from public.staff_shifts s where s.id = r.shift_id),
         (select o.name from public.outlets o where o.id = r.outlet_id),
         r.handed_over_cents
    from public.cash_remittances r
   where r.status = 'pending'
     and r.created_at < now() - interval '60 minutes'
     and r.created_at > now() - interval '31 days'
  on conflict do nothing;
  get diagnostics v_remits = row_count;
  return v_shifts + v_remits;
end;
$$;
comment on function cash.notify_overdue_shifts() is
  'pg_cron every 15 min: one shift_overdue per open shift past its business day + grace, one remittance_pending per hand-over pending > 60 min. Notifies; never closes or counts.';
revoke all on function cash.notify_overdue_shifts() from public, anon, authenticated;
grant execute on function cash.notify_overdue_shifts() to service_role;

-- pg_cron (already in use: 20260924130000). Idempotent re-schedule; skipped
-- where pg_cron is absent (local test databases).
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'cash-alerts';
    perform cron.schedule('cash-alerts', '*/15 * * * *', 'select cash.notify_overdue_shifts()');
  end if;
end $$;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- select cron.unschedule(jobid) from cron.job where jobname = 'cash-alerts';
-- drop function if exists cash.notify_overdue_shifts();
-- drop policy merchant_notifications_read on public.merchant_notifications;
-- create policy merchant_notifications_read on public.merchant_notifications for select to authenticated
--   using (public.app_user_may_read_merchant_notifications(tenant_id, outlet_id));
-- drop function if exists public.app_user_may_read_merchant_notifications(uuid, uuid, text);
-- delete from public.merchant_notifications where kind in ('shift_overdue', 'remittance_pending');
-- alter table public.merchant_notifications drop constraint merchant_notifications_kind_check,
--   add constraint merchant_notifications_kind_check check (kind in ('stock_low', 'stock_out'));
-- drop index if exists merchant_notifications_shift_overdue_once, merchant_notifications_remittance_pending_once, cash_remittances_pending_age;
-- alter table public.merchant_notifications drop column if exists shift_id, drop column if exists remittance_id,
--   drop column if exists drawer_name, drop column if exists cash_cents;
