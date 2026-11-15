-- Export center (plan docs/plans/2026-11-14-export-center-and-owl-reports.md §5):
-- the log of every file a store exported: who, which sheets, which dates.
--
-- Files are built on demand and streamed to the person; nothing is stored, so
-- this row IS the record that customer names / sales figures left the system.
-- It is written by the CALLER's own session right before the file is sent
-- (the route refuses to send a file it could not log), and it also feeds the
-- "Recent exports" list, where one tap runs the same export again.
--
--   INSERT  the caller's own row, for a store where they hold `reports`
--           (the same key the Export page and every report function need).
--   SELECT  your own rows; the owner and staff with `activity_view` see the
--           whole store's (the same people who read Store Activity).
--   UPDATE / DELETE  nobody (append-only; rows go with the store).

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  -- Who, as shown in the list: a name typed by the store, never trusted for access.
  user_label text check (user_label is null or char_length(user_label) <= 120),
  -- Catalogue sheet ids (src/lib/exports/catalogue.ts) that went into the file.
  sheets text[] not null check (cardinality(sheets) between 1 and 60),
  -- Asked for but not given (no access, or not used by this store).
  left_out text[] not null default '{}' check (cardinality(left_out) <= 60),
  preset text not null check (char_length(preset) <= 40),
  period_from date not null,
  period_to date not null,
  -- NULL = whole store; an outlet id or 'unassigned' otherwise.
  branch text check (branch is null or char_length(branch) <= 40),
  format text not null check (format in ('xlsx', 'csv')),
  source text not null check (source in ('page', 'button', 'owl')),
  -- { "<sheet id>": <rows> }
  row_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(row_counts) = 'object'),
  bytes integer not null check (bytes >= 0),
  created_at timestamptz not null default now(),
  check (period_to >= period_from)
);

comment on table public.report_exports is
  'Every export file a store built (Export page, report buttons, Owl). Append-only; written by the caller''s session.';

create index if not exists report_exports_tenant_created on public.report_exports (tenant_id, created_at desc);
create index if not exists report_exports_user_created on public.report_exports (user_id, created_at desc);

alter table public.report_exports enable row level security;

revoke all on public.report_exports from anon, authenticated;
grant select, insert on public.report_exports to authenticated;
grant all on public.report_exports to service_role;

drop policy if exists report_exports_insert_own on public.report_exports;
create policy report_exports_insert_own on public.report_exports
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.app_user_has_permission(tenant_id, 'reports')
  );

drop policy if exists report_exports_select on public.report_exports;
create policy report_exports_select on public.report_exports
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.app_user_has_permission(tenant_id, 'reports'))
    or public.app_user_has_permission(tenant_id, 'activity_view')
  );

-- ============================================
-- Rollback (manual)
-- ============================================
-- drop table if exists public.report_exports;
