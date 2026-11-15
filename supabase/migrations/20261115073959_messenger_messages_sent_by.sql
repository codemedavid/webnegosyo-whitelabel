-- Replying from the merchant app (plan docs/plans/2026-11-15-messenger-reply-from-app.md).
--
-- 1. R5: a staff line sent from the app names the account that sent it, so the
--    chat shows "Joy · app". Lines typed in Page Inbox, the bot's lines and the
--    customer's lines keep NULL. Written by the service role only (the app's
--    send route); readers see it under the line's existing policy
--    (messenger_messages_select_chat) through the table-wide SELECT grant
--    authenticated already has. No FK to auth.users: deleting a staff account
--    must not touch the chat log, which purges itself after 30 days anyway.
--
-- 2. R4 + T1: "Needs a reply". Set by the webhook (service role) when the
--    customer asks for a person, types an order the bot noticed, or writes while
--    staff have the bot paused; cleared when a person answers (Page Inbox echo
--    or the app). Staff read it under the sessions' existing policy, as one
--    more granted column (cart_data / checkout_state stay service-only).
--
-- 3. messenger_chats returns needs_reply_since (the chats list chip). Same
--    body, same SECURITY INVOKER, one column added at the end; the return type
--    changes, so the function is dropped and created again in this transaction.

alter table public.messenger_messages
  add column if not exists sent_by uuid;

comment on column public.messenger_messages.sent_by is
  'Staff account that sent this line from the merchant app (service role writes only); NULL for Page Inbox, bot and customer lines.';

alter table public.messenger_sessions
  add column if not exists needs_reply_since timestamptz;

comment on column public.messenger_sessions.needs_reply_since is
  'When the bot handed this chat to a person and nobody has answered yet (service role writes only); NULL = nothing waiting.';

grant select (needs_reply_since) on public.messenger_sessions to authenticated;

drop function if exists public.messenger_chats(uuid, integer, timestamptz);

create function public.messenger_chats(p_tenant_id uuid, p_limit integer default 30, p_before timestamptz default null)
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
  order_created_at timestamptz,
  needs_reply_since timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.first_name, s.last_name, s.profile_pic_url, s.last_message_at, s.last_message_preview,
         s.last_inbound_at, s.bot_paused_until,
         o.id, o.daily_number, o.status, o.created_at,
         s.needs_reply_since
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
