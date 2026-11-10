-- Messenger automations, release 2 (docs/plans/2026-11-10-messenger-automations.md §5, §6, §8).
--
-- messenger_sessions       gains cart_version: chat-cart writes are compare-and-set
--                          (two quick taps = two webhook events side by side).
-- messenger_rules          the 'cart' action ("show their cart").
-- messenger_settings       order_updates: on/off, which statuses, the owner's wording.
-- messenger_order_updates  one row per (order, status): the once-only claim for a
--                          status message and what happened to it. Service role only.
-- orders trigger           a status change on an order that came from a Messenger
--                          chat posts its id to /api/messenger/order-update.
--
-- The orders index is built CONCURRENTLY outside this transaction
-- (20261111090100). The old UNIQUE(psid) on messenger_sessions is dropped
-- only after this code is deployed (20261111090200).

alter table public.messenger_sessions
  add column if not exists cart_version integer not null default 0;

alter table public.messenger_rules drop constraint if exists messenger_rules_action_check;
alter table public.messenger_rules add constraint messenger_rules_action_check check (
  jsonb_typeof(action) = 'object'
  and action ->> 'kind' in ('menu_card', 'categories', 'category_items', 'featured_items', 'text', 'hours_location', 'talk_to_staff', 'order_status', 'cart')
  and octet_length(action::text) <= 8000
);

-- NULL = never saved: on, for preparing / ready / delivered / cancelled
-- (DEFAULT_ORDER_UPDATES in src/lib/messenger/order-view.ts). Shape is
-- validated by zod on save and again on read.
alter table public.messenger_settings
  add column if not exists order_updates jsonb check (
    order_updates is null or (jsonb_typeof(order_updates) = 'object' and octet_length(order_updates::text) <= 4000)
  );

grant select (order_updates) on public.messenger_settings to authenticated;
grant insert (order_updates) on public.messenger_settings to authenticated;
grant update (order_updates) on public.messenger_settings to authenticated;

create table if not exists public.messenger_order_updates (
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outcome text not null default 'claimed' check (outcome in (
    'claimed', 'sent', 'send_failed', 'not_platform', 'no_psid', 'bot_off', 'updates_off', 'status_not_chosen',
    'no_session', 'outside_window', 'bot_paused', 'no_page', 'no_store'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, status)
);

create index if not exists messenger_order_updates_tenant_created_idx
  on public.messenger_order_updates (tenant_id, created_at desc);

alter table public.messenger_order_updates enable row level security;
revoke all on public.messenger_order_updates from public, anon, authenticated;
grant select, insert, update, delete on public.messenger_order_updates to service_role;

-- A status change on an order linked to a Messenger chat: post its id. pg_net
-- is async, and the exception guard means a broken queue never blocks an
-- order write. Unauthenticated on purpose, like /api/push/notify-order: the
-- body is an id, the route re-reads everything with the service role, and
-- the (order, status) claim makes a replay a no-op.
create or replace function public.notify_messenger_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://www.webnegosyo.com/api/messenger/order-update',
    body := jsonb_build_object('order_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.notify_messenger_order_update() from public, anon, authenticated;

drop trigger if exists orders_messenger_order_update on public.orders;
create trigger orders_messenger_order_update
  after update of status on public.orders
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('confirmed', 'preparing', 'ready', 'delivered', 'cancelled')
    and new.customer_data ? 'messenger_psid'
  )
  execute function public.notify_messenger_order_update();
