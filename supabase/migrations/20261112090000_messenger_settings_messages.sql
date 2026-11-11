-- Messenger Studio (plan docs/plans/2026-11-11-messenger-studio-and-chat-inbox.md, A2):
-- every message the bot sends can be reworded per store.
--
-- messenger_settings.messages  flat object: message id -> text | on/off, plus
--                              "lang" ('en' | 'tl'). NULL / missing key = the
--                              built-in wording (src/lib/messenger/messages/registry.ts).
--                              Checked by the registry on save AND again on read
--                              in the webhook; the database only bounds the shape
--                              and the size.
--
-- Same column grants and RLS as order_updates (20261110080757): owners and
-- staff with `settings` on a store-wide account, through the existing
-- messenger_settings policies (app_user_manages_messenger).
--
-- Additive: no existing row is written (nullable, no default).

alter table public.messenger_settings
  add column if not exists messages jsonb check (
    messages is null or (jsonb_typeof(messages) = 'object' and octet_length(messages::text) <= 32000)
  );

grant select (messages) on public.messenger_settings to authenticated;
grant insert (messages) on public.messenger_settings to authenticated;
grant update (messages) on public.messenger_settings to authenticated;
