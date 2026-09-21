-- =============================================================================
-- SmartMenu University
-- =============================================================================
-- A public learning portal the platform operator curates: courses made of
-- modules made of lessons. A lesson is a hosted video (YouTube / Vimeo /
-- Loom), an article of typed content blocks, or both, plus attached
-- resources (uploaded documents and outside links). Three tables:
--
--   university_courses   the catalog entry: slug, cover, level, publish state
--   university_modules   ordered chapters inside a course
--   university_lessons   ordered lessons inside a module; carry the video
--                        url, the block body and the resource list
--
-- No tenant_id anywhere: the university is platform-level and, for now, open
-- to everyone. Anonymous visitors read published rows only; drafts are
-- visible to the superadmin policy alone. Bodies are typed JSON blocks,
-- never HTML — shape enforced by src/lib/university/blocks.ts on write and
-- re-checked on read, so nothing an author types is interpreted as markup.
-- =============================================================================

create table if not exists public.university_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 1000),
  cover_image_url text,
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  -- Free-text shelf label the catalog groups by ("Getting started", "Menu engineering").
  category text check (category is null or char_length(category) <= 80),
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists university_courses_published_idx
  on public.university_courses (sort_order, published_at desc)
  where status = 'published';

drop trigger if exists university_courses_set_updated_at on public.university_courses;
create trigger university_courses_set_updated_at
  before update on public.university_courses
  for each row execute function set_updated_at();

create table if not exists public.university_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.university_courses(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists university_modules_course_idx
  on public.university_modules (course_id, sort_order);

drop trigger if exists university_modules_set_updated_at on public.university_modules;
create trigger university_modules_set_updated_at
  before update on public.university_modules
  for each row execute function set_updated_at();

create table if not exists public.university_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.university_courses(id) on delete cascade,
  module_id uuid not null references public.university_modules(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  summary text check (summary is null or char_length(summary) <= 500),
  -- A hosted video page url (YouTube / Vimeo / Loom); the app derives the embed.
  video_url text,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 600),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  -- [{ kind: 'file' | 'link', label, url, fileType? }]
  resources jsonb not null default '[]'::jsonb check (jsonb_typeof(resources) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug)
);

create index if not exists university_lessons_module_idx
  on public.university_lessons (module_id, sort_order);

drop trigger if exists university_lessons_set_updated_at on public.university_lessons;
create trigger university_lessons_set_updated_at
  before update on public.university_lessons
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.university_courses enable row level security;
alter table public.university_modules enable row level security;
alter table public.university_lessons enable row level security;

-- Anyone (signed in or not) reads published courses. A module or lesson is
-- visible only through a published course; a lesson must itself be published.
drop policy if exists "university_courses_read_published" on public.university_courses;
create policy "university_courses_read_published" on public.university_courses
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "university_modules_read_published" on public.university_modules;
create policy "university_modules_read_published" on public.university_modules
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.university_courses c
      where c.id = course_id and c.status = 'published'
    )
  );

drop policy if exists "university_lessons_read_published" on public.university_lessons;
create policy "university_lessons_read_published" on public.university_lessons
  for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.university_courses c
      where c.id = course_id and c.status = 'published'
    )
  );

-- The platform operator manages everything, drafts included.
drop policy if exists "university_courses_superadmin" on public.university_courses;
create policy "university_courses_superadmin" on public.university_courses
  for all to authenticated
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));

drop policy if exists "university_modules_superadmin" on public.university_modules;
create policy "university_modules_superadmin" on public.university_modules
  for all to authenticated
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));

drop policy if exists "university_lessons_superadmin" on public.university_lessons;
create policy "university_lessons_superadmin" on public.university_lessons
  for all to authenticated
  using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'))
  with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));
