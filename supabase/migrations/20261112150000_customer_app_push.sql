-- Customer app (P7): order-status push notifications.
-- Plan: docs/plans/2026-11-12-customer-app-p7-push.md
--
-- customer_device_tokens      one row per app install that allowed notifications,
--                             tied to the app SESSION that registered it. Signing
--                             out removes it (remove_customer_app_push_tokens);
--                             deleting the app account deletes the session rows,
--                             which cascade it away. The sender also only uses
--                             tokens whose session is still live.
-- customer_app_order_pushes   (order, status) = the once-only claim for a push,
--                             plus what happened to it.
-- orders trigger              a status change to confirmed / ready / delivered /
--                             cancelled on an order placed from a store's app
--                             posts its id to /api/push/customer-order.
--
-- Service role only, like every other customer-app table: the app talks to
-- /api/app/v1/*, never to these.

-- 1. Device tokens ------------------------------------------------------------

create table if not exists public.customer_device_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  session_id uuid not null references public.customer_app_sessions(id) on delete cascade,
  -- Same pattern as APP_EXPO_PUSH_TOKEN_PATTERN in src/lib/app-contract/push.ts.
  expo_token text not null check (expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform text not null check (platform in ('ios', 'android')),
  app_version text check (app_version is null or char_length(app_version) between 1 and 40),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- One row per install per store: re-registering moves it to whoever is signed in now.
  constraint customer_device_tokens_token_uq unique (tenant_id, expo_token)
);

create index if not exists customer_device_tokens_customer_idx
  on public.customer_device_tokens (tenant_id, customer_id, last_seen_at desc);
-- Serves the customer_app_sessions ON DELETE CASCADE and the sign-out delete.
create index if not exists customer_device_tokens_session_idx
  on public.customer_device_tokens (session_id);

comment on table public.customer_device_tokens is
  'Customer-app installs that allowed order notifications (Expo push tokens), per live session. Service role only.';

alter table public.customer_device_tokens enable row level security;
revoke all on public.customer_device_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.customer_device_tokens to service_role;

-- How many installs one customer keeps per store; the oldest goes first.
-- Mirrors CUSTOMER_PUSH_INSTALLS_MAX in src/lib/app-api/push/.
create or replace function public.register_customer_app_push_token(
  p_tenant_id uuid, p_session_token_hash text, p_expo_token text, p_platform text, p_app_version text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  session_row public.customer_app_sessions%rowtype;
  kept int;
begin
  if p_tenant_id is null or p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  select * into session_row from public.customer_app_sessions
    where tenant_id = p_tenant_id and token_hash = p_session_token_hash
      and revoked_at is null and expires_at > clock_timestamp();
  if not found then return jsonb_build_object('ok', false, 'error', 'signed_out'); end if;

  -- clock_timestamp, not now(): "newest" must hold inside one transaction too.
  insert into public.customer_device_tokens as t (tenant_id, customer_id, session_id, expo_token, platform, app_version, created_at, last_seen_at)
    values (p_tenant_id, session_row.customer_id, session_row.id, p_expo_token, p_platform, p_app_version, clock_timestamp(), clock_timestamp())
  on conflict (tenant_id, expo_token) do update
    set customer_id = excluded.customer_id, session_id = excluded.session_id, platform = excluded.platform,
        app_version = excluded.app_version, last_seen_at = clock_timestamp();

  delete from public.customer_device_tokens d
    where d.tenant_id = p_tenant_id and d.customer_id = session_row.customer_id
      and d.id not in (
        select k.id from public.customer_device_tokens k
          where k.tenant_id = p_tenant_id and k.customer_id = session_row.customer_id
          order by k.last_seen_at desc, k.id
          limit 5
      );
  select count(*) into kept from public.customer_device_tokens
    where tenant_id = p_tenant_id and customer_id = session_row.customer_id;
  return jsonb_build_object('ok', true, 'installs', kept);
end;
$$;

-- Notifications off on this install, or signing out: every token this session registered.
create or replace function public.remove_customer_app_push_tokens(p_tenant_id uuid, p_session_token_hash text)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  with removed as (
    delete from public.customer_device_tokens t
      using public.customer_app_sessions s
      where s.id = t.session_id and s.tenant_id = p_tenant_id and s.token_hash = p_session_token_hash
        and t.tenant_id = p_tenant_id
      returning t.id
  ) select jsonb_build_object('ok', true, 'removed', (select count(*) from removed));
$$;

revoke all on function public.register_customer_app_push_token(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.remove_customer_app_push_tokens(uuid, text) from public, anon, authenticated;
grant execute on function public.register_customer_app_push_token(uuid, text, text, text, text) to service_role;
grant execute on function public.remove_customer_app_push_tokens(uuid, text) to service_role;

-- 2. Once-only claims -----------------------------------------------------------

create table if not exists public.customer_app_order_pushes (
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('confirmed', 'ready', 'delivered', 'cancelled')),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outcome text not null default 'claimed' check (outcome in ('claimed', 'sent', 'partly_sent', 'send_failed', 'no_devices')),
  devices integer not null default 0 check (devices between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, status)
);

create index if not exists customer_app_order_pushes_tenant_created_idx
  on public.customer_app_order_pushes (tenant_id, created_at desc);

drop trigger if exists customer_app_order_pushes_set_updated_at on public.customer_app_order_pushes;
create trigger customer_app_order_pushes_set_updated_at
  before update on public.customer_app_order_pushes
  for each row execute function public.set_updated_at();

comment on table public.customer_app_order_pushes is
  'One row per (order, status) push to a customer-app customer: the once-only claim and its outcome. Service role only.';

alter table public.customer_app_order_pushes enable row level security;
revoke all on public.customer_app_order_pushes from public, anon, authenticated;
grant select, insert, update, delete on public.customer_app_order_pushes to service_role;

-- 3. The orders trigger -----------------------------------------------------------

-- Posts only for orders in the app's index (unique-index lookup on
-- customer_app_orders_order_uq), so a status change of any other mobile-source
-- order costs one index probe and no HTTP call. pg_net is async, and the
-- exception guard means a broken queue never blocks an order write.
-- Unauthenticated on purpose, like /api/push/notify-order: the body is an id,
-- the route re-reads everything with the service role, and the (order, status)
-- claim makes a replay a no-op.
create or replace function public.notify_customer_app_order_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
    select 1 from public.customer_app_orders a
      where a.tenant_id = new.tenant_id and a.backend = 'platform' and a.order_id = new.id::text
  ) then
    perform net.http_post(
      url := 'https://www.webnegosyo.com/api/push/customer-order',
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.notify_customer_app_order_push() from public, anon, authenticated;

drop trigger if exists orders_customer_app_push on public.orders;
create trigger orders_customer_app_push
  after update of status on public.orders
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('confirmed', 'ready', 'delivered', 'cancelled')
    and new.source = 'mobile'
  )
  execute function public.notify_customer_app_order_push();

-- Rollback:
--   drop trigger if exists orders_customer_app_push on public.orders;
--   drop function if exists public.notify_customer_app_order_push();
--   drop table if exists public.customer_app_order_pushes;
--   drop function if exists public.remove_customer_app_push_tokens(uuid, text);
--   drop function if exists public.register_customer_app_push_token(uuid, text, text, text, text);
--   drop table if exists public.customer_device_tokens;
