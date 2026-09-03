-- =============================================================================
-- Platform "What's New" announcements + on-command push
-- =============================================================================
-- The platform operator writes blog-post-style updates (typed content blocks:
-- heading / paragraph / image / video / embed) and short notices, and can
-- push any of them to every merchant device on command. Three tables:
--
--   platform_announcements        what was written, and whether/when it was
--                                 published and pushed
--   platform_announcement_reads   who has opened what (drives the one-time
--                                 popup and the read counts)
--   platform_device_tokens        ONE token row per signed-in merchant
--                                 device, whatever the store's order backend.
--                                 Order pushes stay split (Convex per tenant
--                                 / public.push_tokens); platform messages
--                                 must not, or a broadcast would fan out into
--                                 every tenant's deployment.
--
-- No tenant_id on announcements: they are platform-level. An optional
-- audience list narrows one to chosen stores; null means everyone.
-- =============================================================================

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'post' check (kind in ('post', 'notice')),
  title text not null check (char_length(title) between 1 and 200),
  summary text check (summary is null or char_length(summary) <= 500),
  cover_image_url text,
  -- Ordered typed blocks; shape enforced by src/lib/announcements/blocks.ts
  -- on write and re-checked by the app on read.
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  -- Greet the merchant with this post the next time the app opens.
  show_popup boolean not null default true,
  -- null = every store. A list must name at least one store.
  audience_tenant_ids uuid[] check (audience_tenant_ids is null or cardinality(audience_tenant_ids) > 0),
  push_title text check (push_title is null or char_length(push_title) <= 200),
  push_body text check (push_body is null or char_length(push_body) <= 500),
  push_sent_at timestamptz,
  push_recipient_count integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_announcements_published_idx
  on public.platform_announcements (published_at desc)
  where status = 'published';

drop trigger if exists platform_announcements_set_updated_at on public.platform_announcements;
create trigger platform_announcements_set_updated_at
  before update on public.platform_announcements
  for each row execute function set_updated_at();

create table if not exists public.platform_announcement_reads (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists platform_announcement_reads_user_idx
  on public.platform_announcement_reads (user_id);

create table if not exists public.platform_device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The store the device signed into; null for a platform superadmin's own
  -- phone. A deleted store degrades its devices to "no store" rather than
  -- deleting them, so they keep hearing platform-wide posts.
  tenant_id uuid references public.tenants(id) on delete set null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists platform_device_tokens_user_idx
  on public.platform_device_tokens (user_id);
create index if not exists platform_device_tokens_tenant_idx
  on public.platform_device_tokens (tenant_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.platform_announcements enable row level security;
alter table public.platform_announcement_reads enable row level security;
alter table public.platform_device_tokens enable row level security;

-- Any signed-in account reads published announcements aimed at everyone or
-- at a store that account belongs to. Drafts are invisible outside the
-- superadmin policy below.
drop policy if exists "platform_announcements_read_published" on public.platform_announcements;
create policy "platform_announcements_read_published" on public.platform_announcements
  for select to authenticated
  using (
    status = 'published'
    and (
      audience_tenant_ids is null
      or exists (
        select 1 from public.app_users au
        where au.user_id = auth.uid()
          and au.tenant_id = any (audience_tenant_ids)
      )
    )
  );

drop policy if exists "platform_announcements_superadmin" on public.platform_announcements;
create policy "platform_announcements_superadmin" on public.platform_announcements
  for all to authenticated
  using (
    exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
  )
  with check (
    exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
  );

-- A reader records and sees only their own reads.
drop policy if exists "platform_announcement_reads_own" on public.platform_announcement_reads;
create policy "platform_announcement_reads_own" on public.platform_announcement_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "platform_announcement_reads_superadmin_select" on public.platform_announcement_reads;
create policy "platform_announcement_reads_superadmin_select" on public.platform_announcement_reads
  for select to authenticated
  using (
    exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin')
  );

-- A device manages only its own account's token rows. Sends read the table
-- with the service role, so no superadmin policy is needed here.
drop policy if exists "platform_device_tokens_own" on public.platform_device_tokens;
create policy "platform_device_tokens_own" on public.platform_device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
