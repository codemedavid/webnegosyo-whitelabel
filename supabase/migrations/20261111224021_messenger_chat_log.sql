-- Messenger chat log, applied on platform 2026-11-12 as 20261111224021 (plan docs/plans/2026-11-11-messenger-studio-and-chat-inbox.md, B1).
--
-- So the merchant app can show WHO ordered through Messenger and the short chat
-- around the order without opening Page Inbox:
--
--   messenger_sessions  + the customer's Messenger name/photo (User Profile API,
--                         refreshed at most every 30 days) and the newest line.
--   messenger_messages  one row per thing said: the customer (text, taps,
--                         "📷 Photo"; media is never stored), our bot (a one-line
--                         summary of what it sent) and staff typing in Page Inbox.
--
-- Personal data, so:
--   * writes are the service role's only (the webhook);
--   * reads follow the ORDERS read rule (D1): store-wide accounts holding an
--     order-read key (ORDER_READ_KEYS in src/lib/staff-permissions.ts, the same
--     list as orders_select_by_tenant) read every chat of their store; a
--     branch-locked account only chats tied to an order of ITS branch (through
--     orders.customer_data->>'messenger_psid', orders_messenger_psid_idx);
--   * staff never read the session's cart/checkout state (column grants);
--   * lines older than 30 days are deleted hourly (D4), and so is a preview
--     that old. Page Inbox stays the record.
--
-- The app reads through two SECURITY INVOKER functions (RLS applies):
-- messenger_chat_for_order(order) and messenger_chats(store, limit, before).

-- ---------------------------------------------------------------------------
-- messenger_sessions: profile + newest line
-- ---------------------------------------------------------------------------
alter table public.messenger_sessions
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists profile_pic_url text,
  add column if not exists profile_fetched_at timestamptz,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text;

alter table public.messenger_sessions
  drop constraint if exists messenger_sessions_profile_check,
  add constraint messenger_sessions_profile_check check (
    (first_name is null or char_length(first_name) <= 80)
    and (last_name is null or char_length(last_name) <= 80)
    and (profile_pic_url is null or (char_length(profile_pic_url) <= 2048 and profile_pic_url like 'https://%'))
    and (last_message_preview is null or char_length(last_message_preview) <= 120)
  );

-- The chat list: newest conversation first, per store.
create index if not exists messenger_sessions_tenant_last_message_idx
  on public.messenger_sessions (tenant_id, last_message_at desc)
  where last_message_at is not null;

-- Lets messenger_messages pin (session, store) together with one foreign key.
create unique index if not exists messenger_sessions_id_tenant_key
  on public.messenger_sessions (id, tenant_id);

-- ---------------------------------------------------------------------------
-- messenger_messages
-- ---------------------------------------------------------------------------
create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  direction text not null check (direction in ('in', 'bot', 'staff')),
  kind text not null check (kind in ('text', 'tap', 'photo', 'sticker', 'card', 'other')),
  body text not null check (char_length(body) between 1 and 1000),
  -- Meta's message id: a retried webhook never logs a line twice. NULL for our own summaries.
  mid text unique check (mid is null or char_length(mid) <= 400),
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint messenger_messages_session_fkey foreign key (session_id, tenant_id)
    references public.messenger_sessions (id, tenant_id) on delete cascade
);

create index if not exists messenger_messages_session_sent_idx
  on public.messenger_messages (session_id, sent_at desc);
create index if not exists messenger_messages_tenant_idx
  on public.messenger_messages (tenant_id);
create index if not exists messenger_messages_created_idx
  on public.messenger_messages (created_at);

-- ---------------------------------------------------------------------------
-- Who may read a chat (mirrors orders_select_by_tenant)
-- ---------------------------------------------------------------------------
create or replace function public.app_user_may_read_messenger_chat(p_tenant_id uuid, p_psid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and public.app_user_holds_any_permission(p_tenant_id, array['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports'])
           and (
             au.outlet_id is null
             or exists (
               select 1
                 from public.orders o
                where o.tenant_id = p_tenant_id
                  and o.customer_data ? 'messenger_psid'
                  and o.customer_data ->> 'messenger_psid' = p_psid
                  and o.outlet_id = au.outlet_id
             )
           )
         )
       )
  );
$$;

revoke all on function public.app_user_may_read_messenger_chat(uuid, text) from public, anon;
grant execute on function public.app_user_may_read_messenger_chat(uuid, text) to authenticated, service_role;

-- Sessions were service-role only (20260815120000): staff now read the chat
-- columns of the chats they may read, never the cart or checkout state.
alter table public.messenger_sessions enable row level security;
revoke all on public.messenger_sessions from anon, authenticated;
grant select (id, tenant_id, psid, first_name, last_name, profile_pic_url, last_message_at, last_message_preview,
  last_inbound_at, bot_paused_until) on public.messenger_sessions to authenticated;

drop policy if exists messenger_sessions_select_chat on public.messenger_sessions;
create policy messenger_sessions_select_chat on public.messenger_sessions
  for select to authenticated
  using ((select public.app_user_may_read_messenger_chat(tenant_id, psid)));

alter table public.messenger_messages enable row level security;
revoke all on public.messenger_messages from anon, authenticated;
grant select on public.messenger_messages to authenticated;
grant all on public.messenger_messages to service_role;

drop policy if exists messenger_messages_select_chat on public.messenger_messages;
create policy messenger_messages_select_chat on public.messenger_messages
  for select to authenticated
  using (exists (
    -- The session's own policy decides (RLS applies inside the subquery).
    select 1 from public.messenger_sessions s
     where s.id = messenger_messages.session_id and s.tenant_id = messenger_messages.tenant_id
  ));

-- ---------------------------------------------------------------------------
-- What the app calls (SECURITY INVOKER: the caller's RLS decides)
-- ---------------------------------------------------------------------------

-- The customer behind a Messenger order and the newest lines of their chat
-- (oldest first). NULL when the order isn't from Messenger, isn't readable,
-- or the chat isn't.
create or replace function public.messenger_chat_for_order(p_order_id uuid, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_psid text;
  v_session record;
  v_messages jsonb;
begin
  select o.tenant_id, o.customer_data ->> 'messenger_psid'
    into v_tenant, v_psid
    from public.orders o
   where o.id = p_order_id;
  if v_psid is null then
    return null;
  end if;

  select s.id, s.first_name, s.last_name, s.profile_pic_url, s.last_message_at, s.last_inbound_at, s.bot_paused_until
    into v_session
    from public.messenger_sessions s
   where s.tenant_id = v_tenant and s.psid = v_psid;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.sent_at, m.created_at), '[]'::jsonb)
    into v_messages
    from (
      select mm.id, mm.direction, mm.kind, mm.body, mm.sent_at, mm.created_at
        from public.messenger_messages mm
       where mm.session_id = v_session.id
       order by mm.sent_at desc, mm.created_at desc
       limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) m;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'first_name', v_session.first_name,
      'last_name', v_session.last_name,
      'profile_pic_url', v_session.profile_pic_url,
      'last_message_at', v_session.last_message_at,
      'last_inbound_at', v_session.last_inbound_at,
      'bot_paused_until', v_session.bot_paused_until
    ),
    'messages', v_messages
  );
end;
$$;

revoke all on function public.messenger_chat_for_order(uuid, integer) from public, anon;
grant execute on function public.messenger_chat_for_order(uuid, integer) to authenticated, service_role;

-- A store's conversations, newest first, each with its newest order the
-- caller can read. Paged by last_message_at (`p_before` = the last row's).
create or replace function public.messenger_chats(p_tenant_id uuid, p_limit integer default 30, p_before timestamptz default null)
returns table (
  session_id uuid,
  first_name text,
  last_name text,
  profile_pic_url text,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  bot_paused_until timestamptz,
  order_id uuid,
  order_daily_number integer,
  order_status text,
  order_created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.first_name, s.last_name, s.profile_pic_url, s.last_message_at, s.last_message_preview,
         s.last_inbound_at, s.bot_paused_until,
         o.id, o.daily_number, o.status, o.created_at
    from public.messenger_sessions s
    left join lateral (
      select o.id, o.daily_number, o.status::text as status, o.created_at
        from public.orders o
       where o.tenant_id = s.tenant_id
         and o.customer_data ? 'messenger_psid'
         and o.customer_data ->> 'messenger_psid' = s.psid
       order by o.created_at desc
       limit 1
    ) o on true
   where s.tenant_id = p_tenant_id
     and s.last_message_at is not null
     and (p_before is null or s.last_message_at < p_before)
   order by s.last_message_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke all on function public.messenger_chats(uuid, integer, timestamptz) from public, anon;
grant execute on function public.messenger_chats(uuid, integer, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 30-day retention (D4), hourly from the database (pattern: 20260924130000)
-- ---------------------------------------------------------------------------
create or replace function public.purge_messenger_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.messenger_messages
   where id in (
     select id from public.messenger_messages
      where created_at < now() - interval '30 days'
      limit 20000
   );
  get diagnostics v_deleted = row_count;

  update public.messenger_sessions
     set last_message_preview = null
   where last_message_preview is not null
     and last_message_at < now() - interval '30 days';

  return v_deleted;
end;
$$;

revoke all on function public.purge_messenger_messages() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.unschedule(jobid) from cron.job where jobname = 'messenger-messages-purge';
select cron.schedule('messenger-messages-purge', '17 * * * *', $$select public.purge_messenger_messages()$$);
