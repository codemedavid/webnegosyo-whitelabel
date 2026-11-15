-- Orders staff ring up for a Messenger customer (plan 2026-11-14, C2).
--
-- A customer types their order in the chat; staff open the register from that
-- chat and send it. The register writes only the chat's id on the order
-- (customer_data.messenger_session_id) and saves the order WAITING (pending).
--
-- messenger_chat_orders   one row per such order: the once-only claim for its
--                         summary message, what happened to it, and what the
--                         customer answered. Service-role writes; staff who can
--                         read the order can read its row.
-- orders trigger          a NEW order naming a chat posts its id to
--                         /api/messenger/chat-order, which re-reads everything.
-- attach function         puts the chat's customer on the order (service role);
--                         the register never sends a Messenger id itself.

-- orders is the busiest table on the platform: never queue behind a long writer.
set local lock_timeout = '5s';

create table if not exists public.messenger_chat_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid references public.messenger_sessions(id) on delete set null,
  -- claimed: the summary is on its way · waiting: sent, the customer has not
  -- answered · sent: sent for an order that was not waiting · not_sent: see
  -- outcome · confirmed: the customer tapped Confirm · change_requested: the
  -- customer tapped Change something.
  state text not null default 'claimed' check (state in ('claimed', 'waiting', 'sent', 'not_sent', 'confirmed', 'change_requested')),
  outcome text not null default 'claimed' check (outcome in (
    'claimed', 'sent', 'send_failed', 'not_platform', 'not_waiting', 'no_session', 'outside_window', 'no_page', 'no_store',
    'no_items', 'too_many'
  )),
  -- The payment method the customer picked in the chat (also copied onto the order).
  payment_method_id uuid,
  summary_sent_at timestamptz,
  customer_confirmed_at timestamptz,
  change_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messenger_chat_orders_tenant_created_idx
  on public.messenger_chat_orders (tenant_id, created_at desc);
-- The per-chat hourly cap, and the session FK.
create index if not exists messenger_chat_orders_session_created_idx
  on public.messenger_chat_orders (session_id, created_at desc);

alter table public.messenger_chat_orders enable row level security;
revoke all on public.messenger_chat_orders from public, anon, authenticated;
grant select on public.messenger_chat_orders to authenticated;
grant select, insert, update, delete on public.messenger_chat_orders to service_role;

-- Whoever may read the order may read what happened to its summary. The
-- sub-select runs as the caller, so the orders policies (store, order keys,
-- branch) decide; this table adds no rule of its own.
drop policy if exists messenger_chat_orders_read on public.messenger_chat_orders;
create policy messenger_chat_orders_read on public.messenger_chat_orders
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = messenger_chat_orders.order_id));

-- Put the chat's customer on the order. The chat must belong to the order's
-- own store; the PSID comes from the session row, never from a caller.
create or replace function public.messenger_attach_chat_order_customer(p_order_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with done as (
    update public.orders o
       set customer_data = o.customer_data || jsonb_build_object('messenger_psid', s.psid)
      from public.messenger_sessions s
     where o.id = p_order_id
       and s.tenant_id = o.tenant_id
       -- Cast only what is shaped like an id, so the session is found by its
       -- primary key and a made-up value is a miss, never an error.
       and s.id = case
         when o.customer_data ->> 'messenger_session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then (o.customer_data ->> 'messenger_session_id')::uuid
       end
    returning 1
  )
  select exists (select 1 from done);
$$;

revoke all on function public.messenger_attach_chat_order_customer(uuid) from public, anon, authenticated;
grant execute on function public.messenger_attach_chat_order_customer(uuid) to service_role;

-- A new order rung up for a chat: post its id. pg_net is async, and the
-- exception guard means a broken queue never blocks an order write.
-- Unauthenticated on purpose, like /api/messenger/order-update: the body is an
-- id, the route re-reads everything with the service role, and the claim row
-- makes a replay a no-op.
create or replace function public.notify_messenger_chat_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://www.webnegosyo.com/api/messenger/chat-order',
    body := jsonb_build_object('order_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.notify_messenger_chat_order() from public, anon, authenticated;

drop trigger if exists orders_messenger_chat_order on public.orders;
create trigger orders_messenger_chat_order
  after insert on public.orders
  for each row
  when (new.customer_data ? 'messenger_session_id')
  execute function public.notify_messenger_chat_order();
