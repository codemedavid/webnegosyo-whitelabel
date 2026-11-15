-- Export log follow-ups from the 2026-11-15 review (base: 20261114120000_report_exports.sql).
--
-- 1. Branch scope. `activity_view` let a BRANCH-locked account read the whole
--    store's export log (who exported which dates, for which branch). Store
--    Activity itself shows a branch account only its own branch, so the log
--    now does the same:
--      * your own rows (unchanged: you hold `reports`);
--      * `activity_view` on a store-wide account (owner, store-wide staff,
--        superadmin): every row of the store (unchanged);
--      * `activity_view` on a branch account: rows exported FOR a branch it
--        reaches. Whole-store and "no branch yet" rows stay hidden from it.
--
-- 2. Shape. A custom report or a saved format was logged by its catalogue
--    sheets only, so "Download again" rebuilt the raw sheets instead of the
--    file the person made. The log now keeps what shaped the file:
--      shape        'sheets' | 'custom' | 'template' (rows before this = 'sheets')
--      custom_spec  the custom report's spec (custom-report.ts), <= 4000 bytes as jsonb text (a link spec is <= 2400 base64 chars)
--      template_id  the saved format (report_templates); NULL once it is removed,
--                   and then "Download again" is not offered.
--
-- Additive + a policy swap: the code deployed before this migration keeps
-- working (it never names the new columns), so apply it BEFORE the web deploy
-- that writes them (an insert naming a missing column would refuse the file).

set lock_timeout = '3s';

alter table public.report_exports
  add column if not exists shape text not null default 'sheets',
  add column if not exists custom_spec jsonb,
  add column if not exists template_id uuid references public.report_templates(id) on delete set null;

alter table public.report_exports drop constraint if exists report_exports_shape_check;
alter table public.report_exports add constraint report_exports_shape_check check (
  shape in ('sheets', 'custom', 'template')
  and (custom_spec is null or (jsonb_typeof(custom_spec) = 'object' and octet_length(custom_spec::text) <= 4000))
  and (shape = 'custom') = (custom_spec is not null)
  and (shape = 'template' or template_id is null)
);

comment on column public.report_exports.shape is
  'What shaped the file: sheets (catalogue), custom (custom_spec), template (template_id; NULL once the format is removed).';

drop policy if exists report_exports_select on public.report_exports;
create policy report_exports_select on public.report_exports
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.app_user_has_permission(tenant_id, 'reports'))
    or (
      public.app_user_has_permission(tenant_id, 'activity_view')
      and (
        public.app_user_may_reach_branch(tenant_id, null)
        or exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.role = 'superadmin')
        -- A branch account: rows exported for a branch it reaches. CASE keeps the
        -- uuid cast away from 'unassigned' and NULL.
        or case
             when branch ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then public.app_user_may_reach_branch(tenant_id, branch::uuid)
             else false
           end
      )
    )
  );

-- ============================================
-- Rollback (manual)
-- ============================================
-- drop policy if exists report_exports_select on public.report_exports;
-- create policy report_exports_select on public.report_exports for select to authenticated
--   using ((user_id = (select auth.uid()) and public.app_user_has_permission(tenant_id, 'reports'))
--          or public.app_user_has_permission(tenant_id, 'activity_view'));
-- alter table public.report_exports drop constraint if exists report_exports_shape_check,
--   drop column if exists template_id, drop column if exists custom_spec, drop column if exists shape;
