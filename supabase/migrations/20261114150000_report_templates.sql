-- Export center (plan docs/plans/2026-11-14-export-center-and-owl-reports.md §6.2, §7):
-- "My formats" — a report the store saved to run again for any dates.
--
-- A row holds a SHAPE, never a figure: for kind 'custom' it is the custom
-- report spec (src/lib/exports/custom-report.ts: one catalogue sheet, chosen
-- columns and headings, filters, sort, top N). The file is built when someone
-- runs the format, by the export engine, as THAT person (their staff keys,
-- their branch), so a saved format can never show a column or a branch its
-- reader may not have. The app re-validates `spec` on every read.
--
--   SELECT / INSERT / DELETE  store-wide accounts that hold `reports`
--                             (a branch-locked account sees and saves none).
--   UPDATE                    nobody: a format is replaced by removing it and
--                             saving again.
--   A store keeps at most 50; names are unique per store, whatever the case.

-- The foreign key takes a brief lock on tenants: give up rather than queue checkouts behind a long transaction.
set local lock_timeout = '3s';

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  -- 'custom' = a custom report spec. An uploaded format (plan §6.3) gets its own kind when it is built.
  kind text not null check (kind in ('custom')),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and octet_length(spec::text) <= 8000),
  created_by uuid not null default auth.uid(),
  -- Who, as shown in the list: a name typed by the store, never trusted for access.
  created_by_label text check (created_by_label is null or char_length(created_by_label) <= 120),
  created_at timestamptz not null default now()
);

comment on table public.report_templates is
  'Saved report formats ("My formats" on the Export page). A shape, never a figure; run as the reader.';

create unique index if not exists report_templates_tenant_name on public.report_templates (tenant_id, lower(name));

-- At most 50 per store. SECURITY DEFINER so the count is the store's, not what the caller's RLS shows.
-- AFTER insert: a row refused by the policy never reaches it, so it tells an outsider nothing.
create or replace function public.report_templates_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.report_templates t where t.tenant_id = new.tenant_id) > 50 then
    raise exception 'report_templates_limit' using errcode = 'P0001', hint = 'A store keeps at most 50 saved formats.';
  end if;
  return new;
end;
$$;
revoke all on function public.report_templates_enforce_limit() from public, anon, authenticated;

drop trigger if exists report_templates_limit on public.report_templates;
create trigger report_templates_limit
  after insert on public.report_templates
  for each row execute function public.report_templates_enforce_limit();

alter table public.report_templates enable row level security;

revoke all on public.report_templates from anon, authenticated;
grant select, insert, delete on public.report_templates to authenticated;
grant all on public.report_templates to service_role;

drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates
  for select to authenticated
  using (
    public.app_user_has_permission(tenant_id, 'reports')
    and public.app_user_may_reach_branch(tenant_id, null)
  );

drop policy if exists report_templates_insert on public.report_templates;
create policy report_templates_insert on public.report_templates
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.app_user_has_permission(tenant_id, 'reports')
    and public.app_user_may_reach_branch(tenant_id, null)
  );

drop policy if exists report_templates_delete on public.report_templates;
create policy report_templates_delete on public.report_templates
  for delete to authenticated
  using (
    public.app_user_has_permission(tenant_id, 'reports')
    and public.app_user_may_reach_branch(tenant_id, null)
  );

-- ============================================
-- Rollback (manual)
-- ============================================
-- drop table if exists public.report_templates;
-- drop function if exists public.report_templates_enforce_limit();
