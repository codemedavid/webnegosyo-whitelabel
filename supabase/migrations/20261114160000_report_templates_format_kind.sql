-- Export center (plan docs/plans/2026-11-14-export-center-and-owl-reports.md §6.3):
-- "Owl follows my format" — a saved format may now be the owner's OWN layout.
--
-- kind 'format' = the tabs and columns of a spreadsheet the owner uploaded,
-- each column matched to a catalogue column or left blank
-- (src/lib/exports/report-format.ts). Still a SHAPE, never a figure: the
-- uploaded file itself is not stored, only tab names, headings and which
-- catalogue column fills each one. Up to 4 tabs x 25 columns, so the shape
-- may be longer than a custom report's: the size cap goes from 8000 to
-- 20000 bytes for every kind.
--
-- Nothing else changes: same readers and writers (store-wide accounts that
-- hold `reports`), no UPDATE, 50 per store, names unique per store.

-- Both statements lock report_templates only, briefly: give up rather than queue.
set local lock_timeout = '3s';

alter table public.report_templates drop constraint if exists report_templates_kind_check;
alter table public.report_templates add constraint report_templates_kind_check check (kind in ('custom', 'format'));

alter table public.report_templates drop constraint if exists report_templates_spec_check;
alter table public.report_templates
  add constraint report_templates_spec_check check (jsonb_typeof(spec) = 'object' and octet_length(spec::text) <= 20000);
