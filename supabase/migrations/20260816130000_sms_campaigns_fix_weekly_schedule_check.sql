-- supabase/migrations/20260816130000_sms_campaigns_fix_weekly_schedule_check.sql
--
-- Fixes a hole in sms_campaigns_schedule_fields_ck from 20260816120000, found
-- by probing the constraint immediately after applying it rather than trusting
-- that it worked.
--
-- `array_length(x, 1)` returns NULL for an empty array, not 0. So for a weekly
-- campaign with no weekday selected the third branch evaluated to
-- `true AND NULL` = NULL, the whole OR evaluated to NULL, and a CHECK
-- constraint PASSES on NULL. The row was accepted.
--
-- The damage that would have done is quiet, which is what makes it worth a
-- migration of its own: `computeNextDueAt` in webnegosyo-app/lib/sms/schedule.ts
-- correctly returns null for an empty weekday list, so such a campaign would sit
-- in the merchant's list looking active, forever, and simply never send. No
-- error, no failed run, no log line.
--
-- `cardinality()` returns 0 for an empty array and never returns NULL.
--
-- Safety: constraint-only change. No column or row data is touched. Existing
-- rows are re-validated on ADD CONSTRAINT; the table was empty when this was
-- applied, so there was nothing to reject.

alter table public.sms_campaigns
  drop constraint if exists sms_campaigns_schedule_fields_ck;

alter table public.sms_campaigns
  add constraint sms_campaigns_schedule_fields_ck check (
    (schedule_kind = 'one_off' and schedule_date is not null)
    or (schedule_kind = 'every_n_days' and schedule_interval_days is not null)
    or (schedule_kind = 'weekly' and cardinality(schedule_weekdays) > 0)
  );

-- ------------------------------------------------------------------------------
-- ROLLBACK (manual; this repo's migrations are forward-only):
--   Reverting reintroduces the NULL hole. If it must be done, restore the
--   array_length form from 20260816120000.
-- ------------------------------------------------------------------------------
