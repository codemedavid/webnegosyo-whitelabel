-- Messenger automations, release 1 (docs/plans/2026-11-10-messenger-automations.md).
--
-- messenger_rules     the owner's triggers → actions. Edited in Settings →
--                     Messenger → Automations by staff with `settings` on a
--                     store-wide account; read by the webhook (service role).
-- messenger_settings  bot on/off, how long a staff reply pauses the bot,
--                     whether the owner's rules replace the built-in ones,
--                     Messenger Profile sync state, the owner's test PSID.
-- messenger_sessions  gains a per-store key, the 24h window stamp and the
--                     staff-takeover pause. Still service-role only.

-- ---------------------------------------------------------------------------
-- messenger_sessions
-- ---------------------------------------------------------------------------
alter table public.messenger_sessions
  add column if not exists page_id text,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists bot_paused_until timestamptz;

-- PSIDs are page-scoped, so the real key is (store, psid). The old UNIQUE(psid)
-- stays until release 2 so the code deployed before this one keeps working.
create unique index if not exists messenger_sessions_tenant_psid_key
  on public.messenger_sessions (tenant_id, psid);

-- ---------------------------------------------------------------------------
-- Who may manage a store's Messenger automations: `settings` (the same key as
-- the Messenger settings page and facebook_pages writes) on a store-wide
-- account. SECURITY INVOKER: it adds no power of its own.
-- ---------------------------------------------------------------------------
create or replace function public.app_user_manages_messenger(target_tenant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.app_user_has_permission(target_tenant_id, 'settings')
     and (
       public.app_user_may_reach_branch(target_tenant_id, null)
       or exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
     )
$$;

revoke all on function public.app_user_manages_messenger(uuid) from public, anon;
grant execute on function public.app_user_manages_messenger(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- messenger_rules
-- ---------------------------------------------------------------------------
create table if not exists public.messenger_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- Shape is validated by the app's zod schema on save AND on read; the
  -- database pins the kind and a size ceiling.
  trigger jsonb not null check (
    jsonb_typeof(trigger) = 'object'
    and trigger ->> 'kind' in ('keyword', 'get_started', 'ice_breaker', 'menu_button', 'fallback')
    and octet_length(trigger::text) <= 4000
  ),
  action jsonb not null check (
    jsonb_typeof(action) = 'object'
    and action ->> 'kind' in ('menu_card', 'categories', 'category_items', 'featured_items', 'text', 'hours_location', 'talk_to_staff', 'order_status')
    and octet_length(action::text) <= 8000
  ),
  is_enabled boolean not null default true,
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists messenger_rules_tenant_position_idx on public.messenger_rules (tenant_id, position);

drop trigger if exists messenger_rules_set_updated_at on public.messenger_rules;
create trigger messenger_rules_set_updated_at
  before update on public.messenger_rules
  for each row execute function set_updated_at();

-- At most 50 rules per store (MAX_RULES in src/lib/messenger/rules.ts).
create or replace function public.messenger_rules_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('messenger_rules:' || new.tenant_id::text));
  if (select count(*) from public.messenger_rules r where r.tenant_id = new.tenant_id) >= 50 then
    raise exception 'A store can have at most 50 Messenger automations' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.messenger_rules_enforce_cap() from public, anon, authenticated;

drop trigger if exists messenger_rules_cap on public.messenger_rules;
create trigger messenger_rules_cap
  before insert on public.messenger_rules
  for each row execute function public.messenger_rules_enforce_cap();

alter table public.messenger_rules enable row level security;
revoke all on public.messenger_rules from anon;
revoke all on public.messenger_rules from authenticated;
grant select, insert, update, delete on public.messenger_rules to authenticated;

drop policy if exists messenger_rules_select on public.messenger_rules;
create policy messenger_rules_select on public.messenger_rules
  for select to authenticated using (public.app_user_manages_messenger(tenant_id));
drop policy if exists messenger_rules_insert on public.messenger_rules;
create policy messenger_rules_insert on public.messenger_rules
  for insert to authenticated with check (public.app_user_manages_messenger(tenant_id));
drop policy if exists messenger_rules_update on public.messenger_rules;
create policy messenger_rules_update on public.messenger_rules
  for update to authenticated
  using (public.app_user_manages_messenger(tenant_id))
  with check (public.app_user_manages_messenger(tenant_id));
drop policy if exists messenger_rules_delete on public.messenger_rules;
create policy messenger_rules_delete on public.messenger_rules
  for delete to authenticated using (public.app_user_manages_messenger(tenant_id));

-- ---------------------------------------------------------------------------
-- messenger_settings
-- ---------------------------------------------------------------------------
create table if not exists public.messenger_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- On by default: connected stores already answered menu keywords.
  bot_enabled boolean not null default true,
  -- A staff reply from Page Inbox pauses the bot for this thread (0 = never pause).
  takeover_minutes integer not null default 60 check (takeover_minutes between 0 and 1440),
  -- NULL = the store runs the built-in rules; set = its messenger_rules rows
  -- are the whole set, even when there are none.
  rules_customized_at timestamptz,
  -- Bumped by every save_messenger_rules: a save from a stale editor is refused.
  rules_version integer not null default 0 check (rules_version >= 0),
  -- Messenger Profile (Get Started, ice breakers, persistent menu) sync state.
  -- Service role only: written after the Graph call.
  profile_hash text,
  -- The profile fields WE set, so a later sync only ever deletes our own.
  profile_fields text[] not null default '{}' check (profile_fields <@ array['get_started', 'ice_breakers', 'persistent_menu']),
  profile_synced_at timestamptz,
  profile_error text check (profile_error is null or char_length(profile_error) <= 500),
  -- "Send test to me": the owner's own PSID on their Page, linked by a
  -- short-lived code. Service role only.
  tester_psid text,
  tester_code_hash text,
  tester_code_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists messenger_settings_set_updated_at on public.messenger_settings;
create trigger messenger_settings_set_updated_at
  before update on public.messenger_settings
  for each row execute function set_updated_at();

alter table public.messenger_settings enable row level security;
revoke all on public.messenger_settings from anon;
revoke all on public.messenger_settings from authenticated;
grant select (tenant_id, bot_enabled, takeover_minutes, rules_customized_at, rules_version, profile_synced_at, profile_error, updated_at)
  on public.messenger_settings to authenticated;
grant insert (tenant_id, bot_enabled, takeover_minutes, rules_customized_at, updated_by)
  on public.messenger_settings to authenticated;
grant update (bot_enabled, takeover_minutes, rules_customized_at, rules_version, updated_by)
  on public.messenger_settings to authenticated;

drop policy if exists messenger_settings_select on public.messenger_settings;
create policy messenger_settings_select on public.messenger_settings
  for select to authenticated using (public.app_user_manages_messenger(tenant_id));
drop policy if exists messenger_settings_insert on public.messenger_settings;
create policy messenger_settings_insert on public.messenger_settings
  for insert to authenticated with check (public.app_user_manages_messenger(tenant_id));
drop policy if exists messenger_settings_update on public.messenger_settings;
create policy messenger_settings_update on public.messenger_settings
  for update to authenticated
  using (public.app_user_manages_messenger(tenant_id))
  with check (public.app_user_manages_messenger(tenant_id));

-- ---------------------------------------------------------------------------
-- save_messenger_rules: replace a store's whole rule set, and its bot on/off +
-- takeover setting, in ONE transaction (the editor saves both with one button).
--
-- SECURITY INVOKER, so every row still passes the policies above as the
-- caller. p_expected_version is the rules_version the editor loaded; a save
-- from a stale editor (another tab, a colleague) raises 40001 instead of
-- silently dropping their rules. p_rules = [{id, name, trigger, action,
-- is_enabled}] in order; position = array index. Returns the new version.
-- ---------------------------------------------------------------------------
create or replace function public.save_messenger_rules(
  p_tenant_id uuid,
  p_expected_version integer,
  p_rules jsonb,
  p_bot_enabled boolean,
  p_takeover_minutes integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version integer;
  v_inserted integer;
begin
  if not public.app_user_manages_messenger(p_tenant_id) then
    raise exception 'Not allowed to manage this store''s Messenger automations' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) > 50 then
    raise exception 'p_rules must be an array of at most 50 rules' using errcode = '22023';
  end if;

  insert into public.messenger_settings (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  select s.rules_version into v_version from public.messenger_settings s where s.tenant_id = p_tenant_id for update;
  if v_version is null then
    raise exception 'Messenger settings row not readable' using errcode = '42501';
  end if;
  if v_version <> p_expected_version then
    raise exception 'These automations changed since you opened them' using errcode = '40001';
  end if;

  delete from public.messenger_rules r where r.tenant_id = p_tenant_id;

  insert into public.messenger_rules (id, tenant_id, name, trigger, action, is_enabled, position, updated_by)
  select (rule ->> 'id')::uuid, p_tenant_id, rule ->> 'name', rule -> 'trigger', rule -> 'action',
         coalesce((rule ->> 'is_enabled')::boolean, true), (ordinality - 1)::integer, auth.uid()
    from jsonb_array_elements(p_rules) with ordinality as rules(rule, ordinality);
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_rules) then
    raise exception 'Not every rule was saved' using errcode = '42501';
  end if;

  update public.messenger_settings s
     set rules_version = v_version + 1, rules_customized_at = now(), updated_by = auth.uid(),
         bot_enabled = p_bot_enabled, takeover_minutes = p_takeover_minutes
   where s.tenant_id = p_tenant_id;
  if not found then
    raise exception 'Messenger settings not updated' using errcode = '42501';
  end if;
  return v_version + 1;
end;
$$;

revoke all on function public.save_messenger_rules(uuid, integer, jsonb, boolean, integer) from public, anon;
grant execute on function public.save_messenger_rules(uuid, integer, jsonb, boolean, integer) to authenticated;
