-- =============================================================================
-- Platform app release policy (merchant app update gate)
-- =============================================================================
-- One row per store platform, written by the superadmin, read by every
-- signed-in merchant device on app open:
--
--   latest_version   the newest binary in the store. A device behind it gets
--                    a dismissible "new version available" nudge.
--   minimum_version  the oldest binary the platform still supports. A device
--                    behind it gets a BLOCKING screen it cannot dismiss.
--   store_url        where "Update" sends them. iOS cannot install a store
--                    build from inside the app, so this link is the whole of
--                    the store path.
--
-- OTA (JS-only) updates need nothing here: expo-updates already serves them
-- per runtime version, and the app offers them on its own. This table exists
-- for the case OTA cannot solve — a new NATIVE binary.
--
-- Platform-level, like announcements: no tenant_id, no backend routing. Every
-- store's merchants read the same two rows.
-- =============================================================================

create table if not exists public.platform_app_releases (
  platform text primary key check (platform in ('ios', 'android')),
  latest_version text not null check (latest_version ~ '^\d+(\.\d+){0,2}$'),
  minimum_version text not null check (minimum_version ~ '^\d+(\.\d+){0,2}$'),
  store_url text not null check (store_url ~* '^https://'),
  -- Shown under the prompt. Plain text; the app renders it as-is.
  release_notes text check (release_notes is null or char_length(release_notes) <= 2000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- A floor above the newest shipped build would lock every merchant out with
-- no version that clears it. The app refuses such a row too, but the database
-- is where the mistake must be impossible rather than merely survivable.
-- Compared as (major, minor, patch) integers, not as text: '1.0.10' sorts
-- BELOW '1.0.9' as a string.
create or replace function public.app_release_version_key(version text)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select array[
    coalesce((string_to_array(version, '.'))[1]::integer, 0),
    coalesce((string_to_array(version, '.'))[2]::integer, 0),
    coalesce((string_to_array(version, '.'))[3]::integer, 0)
  ];
$$;

alter table public.platform_app_releases
  drop constraint if exists platform_app_releases_floor_not_above_latest;
alter table public.platform_app_releases
  add constraint platform_app_releases_floor_not_above_latest
  check (
    public.app_release_version_key(minimum_version)
    <= public.app_release_version_key(latest_version)
  );

drop trigger if exists platform_app_releases_set_updated_at on public.platform_app_releases;
create trigger platform_app_releases_set_updated_at
  before update on public.platform_app_releases
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.platform_app_releases enable row level security;

-- Every signed-in account reads the policy: the gate runs after login, and a
-- merchant on any store needs to know their own build is supported.
drop policy if exists "platform_app_releases_read" on public.platform_app_releases;
create policy "platform_app_releases_read" on public.platform_app_releases
  for select to authenticated
  using (true);

drop policy if exists "platform_app_releases_superadmin" on public.platform_app_releases;
create policy "platform_app_releases_superadmin" on public.platform_app_releases
  for all to authenticated
  using (
    exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
  )
  with check (
    exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
  );

-- Seed both platforms at the version shipping today, with the floor at the
-- same value so NOBODY is blocked until the operator deliberately raises it.
insert into public.platform_app_releases (platform, latest_version, minimum_version, store_url)
values
  ('ios', '1.0.8', '1.0.0', 'https://apps.apple.com/app/id6761642956'),
  ('android', '1.0.8', '1.0.0', 'https://play.google.com/store/apps/details?id=com.webnegosyo.admin')
on conflict (platform) do nothing;
