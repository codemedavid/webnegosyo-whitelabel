-- =============================================================================
-- Merchant notifications — the bell in the merchant app
-- =============================================================================
-- Low-stock alerts have been raised into `stock_alerts` since 2026-07-28, but
-- nothing ever told a merchant: the app never read the table and nothing was
-- pushed. This adds the inbox the app's bell reads, fills it from stock
-- alerts, and rings the store's devices through the web app.
--
--   stock_alerts INSERT (new crossing) / UPDATE low -> out (escalation)
--     --> statement trigger --> merchant_notifications rows (one statement)
--     --> statement trigger --> pg_net POST /api/push/notify-merchant {ids}
--     --> route re-reads, claims push_claimed_at once, Expo push
--
-- Statement-level on purpose: one order that drops three ingredients is one
-- INSERT into stock_alerts, so it becomes one push call, not three.
--
-- Rows are self-contained snapshots (item name, unit, branch name, quantity):
-- a notification is a record of what was true when it fired, and renaming an
-- ingredient later must not rewrite history. Display text is composed by the
-- readers (web push route, app list), which are unit-tested; SQL only copies.
--
-- Who reads: anyone who can open the app's Stock screen — owner, store admins,
-- and staff holding the `menu` permission — confined to their branch exactly
-- like `stock_alerts` (NULL outlet = about the store = visible to all).
-- =============================================================================

-- 1. Who may read a store's notifications ------------------------------------
create or replace function public.app_user_may_read_merchant_notifications(
  target_tenant_id uuid,
  target_outlet_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from app_users au
     where au.user_id = auth.uid()
       and au.tenant_id = target_tenant_id
       and au.role = any (array['admin', 'superadmin'])
       and (
         coalesce(au.is_owner, false)
         or au.role = 'superadmin'
         or au.permissions is null
         or 'menu' = any (au.permissions)
       )
       and (
         target_outlet_id is null
         or au.outlet_id is null
         or coalesce(au.is_owner, false)
         or au.outlet_id = target_outlet_id
       )
  );
$$;

revoke all on function public.app_user_may_read_merchant_notifications(uuid, uuid) from public, anon;
grant execute on function public.app_user_may_read_merchant_notifications(uuid, uuid) to authenticated;

-- 2. The inbox -----------------------------------------------------------------
create table if not exists public.merchant_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Branch this is about. NULL = the whole store.
  outlet_id uuid references public.outlets(id) on delete cascade,
  kind text not null check (kind in ('stock_low', 'stock_out')),
  stock_alert_id uuid references public.stock_alerts(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  -- Snapshots, so the row still reads correctly after renames/edits.
  item_name text not null,
  unit text,
  outlet_name text,
  quantity numeric(16,4),
  reorder_level numeric(16,4),
  -- Set once by the push route; a replayed request finds it set and sends nothing.
  push_claimed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.merchant_notifications is
  'Merchant app bell inbox. Service-role writes only; read via app_user_may_read_merchant_notifications.';

create index if not exists merchant_notifications_tenant_created_idx
  on public.merchant_notifications (tenant_id, created_at desc);
create index if not exists merchant_notifications_stock_alert_idx
  on public.merchant_notifications (stock_alert_id) where stock_alert_id is not null;
create index if not exists merchant_notifications_item_idx
  on public.merchant_notifications (inventory_item_id) where inventory_item_id is not null;
create index if not exists merchant_notifications_outlet_idx
  on public.merchant_notifications (outlet_id) where outlet_id is not null;

alter table public.merchant_notifications enable row level security;

drop policy if exists merchant_notifications_read on public.merchant_notifications;
create policy merchant_notifications_read on public.merchant_notifications
  for select to authenticated
  using (public.app_user_may_read_merchant_notifications(tenant_id, outlet_id));

-- No insert/update/delete policies: only triggers and the service role write.
grant select on public.merchant_notifications to authenticated;
revoke insert, update, delete on public.merchant_notifications from anon, authenticated;

-- 3. "Last opened the list", per person per store -----------------------------
create table if not exists public.merchant_notification_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.merchant_notification_seen enable row level security;

drop policy if exists merchant_notification_seen_own on public.merchant_notification_seen;
create policy merchant_notification_seen_own on public.merchant_notification_seen
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.app_user_may_read_merchant_notifications(tenant_id, null)
  );

grant select, insert, update on public.merchant_notification_seen to authenticated;

-- 4. stock_alerts -> notifications ---------------------------------------------
-- One INSERT ... SELECT per statement. Wrapped so a notification failure can
-- never roll back the alert (which itself runs behind a paid order).
create or replace function public.stock_alerts_to_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into merchant_notifications
      (tenant_id, outlet_id, kind, stock_alert_id, inventory_item_id,
       item_name, unit, outlet_name, quantity, reorder_level)
    select n.tenant_id, n.outlet_id,
           case when n.level = 'out' then 'stock_out' else 'stock_low' end,
           n.id, n.inventory_item_id,
           coalesce(ii.name, 'An ingredient'), iu.abbreviation, o.name,
           n.quantity, n.reorder_level
      from new_rows n
      left join inventory_items ii on ii.id = n.inventory_item_id
      left join inventory_units iu on iu.id = ii.stock_unit_id
      left join outlets o on o.id = n.outlet_id
     where n.resolved_at is null;
  else
    -- Escalation only: an open "low" alert that has now run out.
    insert into merchant_notifications
      (tenant_id, outlet_id, kind, stock_alert_id, inventory_item_id,
       item_name, unit, outlet_name, quantity, reorder_level)
    select n.tenant_id, n.outlet_id, 'stock_out',
           n.id, n.inventory_item_id,
           coalesce(ii.name, 'An ingredient'), iu.abbreviation, o.name,
           n.quantity, n.reorder_level
      from new_rows n
      join old_rows prev on prev.id = n.id
      left join inventory_items ii on ii.id = n.inventory_item_id
      left join inventory_units iu on iu.id = ii.stock_unit_id
      left join outlets o on o.id = n.outlet_id
     where prev.level = 'low'
       and n.level = 'out'
       and n.resolved_at is null;
  end if;
  return null;
exception when others then
  raise warning 'stock_alerts_to_notifications failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists stock_alerts_notify_insert on public.stock_alerts;
create trigger stock_alerts_notify_insert
  after insert on public.stock_alerts
  referencing new table as new_rows
  for each statement execute function public.stock_alerts_to_notifications();

drop trigger if exists stock_alerts_notify_escalation on public.stock_alerts;
create trigger stock_alerts_notify_escalation
  after update on public.stock_alerts
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.stock_alerts_to_notifications();

-- 5. Backfill: today's open alerts, already marked pushed -----------------------
-- So the bell is not empty on day one, without ringing for old news. Runs
-- BEFORE the push trigger exists.
insert into public.merchant_notifications
  (tenant_id, outlet_id, kind, stock_alert_id, inventory_item_id,
   item_name, unit, outlet_name, quantity, reorder_level, push_claimed_at, created_at)
select sa.tenant_id, sa.outlet_id,
       case when sa.level = 'out' then 'stock_out' else 'stock_low' end,
       sa.id, sa.inventory_item_id,
       coalesce(ii.name, 'An ingredient'), iu.abbreviation, o.name,
       sa.quantity, sa.reorder_level, now(), coalesce(sa.created_at, now())
  from public.stock_alerts sa
  left join public.inventory_items ii on ii.id = sa.inventory_item_id
  left join public.inventory_units iu on iu.id = ii.stock_unit_id
  left join public.outlets o on o.id = sa.outlet_id
 where sa.resolved_at is null
   and not exists (
     select 1 from public.merchant_notifications mn where mn.stock_alert_id = sa.id
   );

-- 6. notifications -> push -------------------------------------------------------
-- Ids only; the route re-reads everything with the service role. pg_net is
-- async, and the guard means a broken queue never blocks the write.
create extension if not exists pg_net with schema extensions;

create or replace function public.merchant_notifications_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pending uuid[];
begin
  select array_agg(id) into pending from new_rows where push_claimed_at is null;
  if pending is null then
    return null;
  end if;
  perform net.http_post(
    url := 'https://www.webnegosyo.com/api/push/notify-merchant',
    body := jsonb_build_object('notification_ids', to_jsonb(pending)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists merchant_notifications_push on public.merchant_notifications;
create trigger merchant_notifications_push
  after insert on public.merchant_notifications
  referencing new table as new_rows
  for each statement execute function public.merchant_notifications_push();

-- Trigger functions are not callable as RPCs, but keep them off the API anyway.
revoke all on function public.stock_alerts_to_notifications() from public, anon, authenticated;
revoke all on function public.merchant_notifications_push() from public, anon, authenticated;

-- =============================================================================
-- Rollback (manual):
--   drop trigger if exists merchant_notifications_push on public.merchant_notifications;
--   drop trigger if exists stock_alerts_notify_insert on public.stock_alerts;
--   drop trigger if exists stock_alerts_notify_escalation on public.stock_alerts;
--   drop function if exists public.merchant_notifications_push();
--   drop function if exists public.stock_alerts_to_notifications();
--   drop table if exists public.merchant_notification_seen;
--   drop table if exists public.merchant_notifications;
--   drop function if exists public.app_user_may_read_merchant_notifications(uuid, uuid);
-- =============================================================================
