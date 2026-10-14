-- Campaign texts in sms_outbox (web "Texts", server-run campaigns).
--
-- A server campaign run writes one sms_outbox row per guest:
--   family = recipe = source = 'campaign', automation_id = null,
--   campaign_run_id = the run, occurrence_key = 'run:<run id>', priority 20.
-- Nothing else changes: claim_sms_outbox_message never filters on recipe or
-- family, consent / opt-out / suppression / per-guest cap / daily limit /
-- quiet hours / pacing already apply to every row, and the `automation_off`
-- cancel only looks at source='auto'. The phone app needs no change.
--
-- Constraint names: `recipe` and `source` were INLINE column checks in
-- 20261013120000_sms_automations.sql, so Postgres named them
-- sms_outbox_recipe_check / sms_outbox_source_check. Verified on the platform
-- database 2026-10-14 (pg_constraint) before writing this file.
--
-- Safety: additive. Existing rows all satisfy the widened checks (added NOT
-- VALID, then validated). No grant change: the web reads through the service
-- role, and campaign_run_id is deliberately NOT added to the authenticated
-- column grant from 20261013140000_sms_outbox_hardening.sql.
--
-- Apply AFTER 20261015120000_sms_campaigns_server_delivery.sql.

alter table public.sms_outbox
  drop constraint sms_outbox_recipe_check,
  drop constraint sms_outbox_source_check;

alter table public.sms_outbox
  add constraint sms_outbox_recipe_check check (recipe in ('review_request', 'first_visit_followup',
    'loyalty_almost_there', 'loyalty_reward_waiting', 'loyalty_reward_expiring', 'win_back',
    'regulars_gone_quiet', 'campaign')) not valid,
  add constraint sms_outbox_source_check check (source in ('auto', 'run_now', 'campaign')) not valid;

alter table public.sms_outbox
  add column if not exists campaign_run_id uuid references public.sms_campaign_runs(id) on delete set null;

-- campaign_run_id is not required here on purpose: deleting a run (tenant
-- teardown cascades) sets it null, and a CHECK requiring it would block that.
alter table public.sms_outbox
  add constraint sms_outbox_campaign_shape_ck check (
    (source = 'campaign') = (recipe = 'campaign')
    and (source <> 'campaign' or (family = 'campaign' and automation_id is null))
  ) not valid;

alter table public.sms_outbox validate constraint sms_outbox_recipe_check;
alter table public.sms_outbox validate constraint sms_outbox_source_check;
alter table public.sms_outbox validate constraint sms_outbox_campaign_shape_ck;

create index if not exists sms_outbox_campaign_run_idx
  on public.sms_outbox(campaign_run_id, status) where campaign_run_id is not null;

comment on column public.sms_outbox.campaign_run_id is
  'Server-run campaign texts: the sms_campaign_runs row that queued it. Service-role only (not in the staff column grant).';

-- ------------------------------------------------------------------------------
-- PROBES (run after applying):
--   select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.sms_outbox'::regclass
--       and conname in ('sms_outbox_recipe_check','sms_outbox_source_check','sms_outbox_campaign_shape_ck');
--     -- 3 rows, all convalidated, recipe incl. 'campaign', source incl. 'campaign'
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='sms_outbox' and column_name='campaign_run_id';   -- 1 row
--   select has_column_privilege('authenticated', 'public.sms_outbox', 'campaign_run_id', 'select');  -- false
--   select count(*) from public.sms_outbox where source = 'campaign';   -- 0 right after apply
--   select indexname from pg_indexes where indexname = 'sms_outbox_campaign_run_idx';   -- 1 row
-- Behavioural (service role, throwaway tenant with an enrolled dev phone, then delete the rows):
--   insert a server campaign + run, insert one row with family/recipe/source='campaign',
--   campaign_run_id=<run>, occurrence_key='run:<run>', priority=20; then
--   select claim_sms_outbox_message(<tenant>, <actor>, <device>, <hash>)  -- returns that message
--   select finish_sms_outbox_message(...)                                 -- row goes 'sent'
--   insert the same (tenant, family, customer, occurrence_key) again    -- 23505 (dedupe holds)
-- ROLLBACK (manual): drop index + shape check + column; restore the two checks
-- without 'campaign' (only after deleting every source='campaign' row).
-- ------------------------------------------------------------------------------
