-- Web "Texts": campaigns the SERVER runs (through sms_outbox), next to the
-- existing campaigns the owner's Android phone runs by hand.
--
-- The contract (see docs in src/lib/texts/):
--   * `delivery`  phone (default; every existing row, every Owl/MCP/onboarding/
--                 old-app insert) | server (only the service role may set it).
--   * `status`    gains `scheduled` = "the server runs this". It ALWAYS pairs
--                 with delivery='server'. `active` keeps meaning "the phone
--                 runs it". Shipped apps read an unknown status as `archived`
--                 (campaigns-repo.ts toStatus), so `scheduled` is inert there.
--   * An old app tapping "Resume" (status := 'active') on a server campaign is
--     coerced back to `scheduled` by the guard trigger, so it stays server-run.
--   * No phone may create or touch a run of a server campaign (runs guard):
--     covers the app's stale-claim takeover and a stale "Send now" screen.
--   * `ends_on`   repeats stop after this Manila date (null on legacy rows).
--   * `pause_reason` why a campaign is paused: the owner, or the server paused
--     it itself because an occurrence went more than a day without a phone
--     (`missed_no_phone`). Cleared automatically whenever status leaves paused.
--   * `scheduled_from` anchor: nothing before it is ever caught up.
--
-- Safety: additive. The only change to existing data is the widened status
-- CHECK, added NOT VALID then validated. No row changes behaviour.
--
-- Apply order: THIS file, then 20261015121000_sms_outbox_campaign_rows.sql,
-- then deploy the web code, then the app OTA.

-- 1. sms_campaigns ------------------------------------------------------------
alter table public.sms_campaigns
  add column if not exists delivery text not null default 'phone',
  add column if not exists scheduled_from timestamptz,
  add column if not exists ends_on date,
  add column if not exists pause_reason text;

alter table public.sms_campaigns
  add constraint sms_campaigns_delivery_ck check (delivery in ('phone', 'server')),
  add constraint sms_campaigns_pause_reason_ck check (pause_reason is null or pause_reason in ('owner', 'missed_no_phone'));

alter table public.sms_campaigns drop constraint sms_campaigns_status_ck;
alter table public.sms_campaigns
  add constraint sms_campaigns_status_ck
    check (status in ('draft', 'active', 'paused', 'archived', 'scheduled')) not valid,
  add constraint sms_campaigns_scheduled_is_server_ck
    check (status <> 'scheduled' or delivery = 'server') not valid;
alter table public.sms_campaigns validate constraint sms_campaigns_status_ck;
alter table public.sms_campaigns validate constraint sms_campaigns_scheduled_is_server_ck;

-- The tick reads stores with a server campaign to run.
create index if not exists sms_campaigns_server_scheduled_idx
  on public.sms_campaigns(tenant_id) where status = 'scheduled';

-- Trusted callers: the service role through PostgREST, or a superuser session
-- (SQL editor / MCP / migrations). Everyone else is a phone or a browser.
create or replace function public.sms_campaigns_is_trusted_writer()
returns boolean language sql stable set search_path = public as $$
  -- JWT first: a PostgREST caller always carries a role claim, so only a
  -- claim-less session (migrations, SQL editor, MCP) falls back to the
  -- session user. Testable with `set local role` + request.jwt.claims.
  select coalesce(auth.role(), '') = 'service_role'
      or (coalesce(auth.role(), '') = '' and session_user in ('postgres', 'supabase_admin'))
$$;
revoke all on function public.sms_campaigns_is_trusted_writer() from public, anon;
grant execute on function public.sms_campaigns_is_trusted_writer() to authenticated, service_role;

create or replace function public.sms_campaigns_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- An old app "resuming" a server campaign writes active: keep it server-run.
  if new.delivery = 'server' and new.status = 'active' then new.status := 'scheduled'; end if;
  if new.status <> 'paused' then new.pause_reason := null; end if;
  if not public.sms_campaigns_is_trusted_writer()
     and ((tg_op = 'INSERT' and new.delivery = 'server')
       or (tg_op = 'UPDATE' and new.delivery is distinct from old.delivery)) then
    raise exception 'delivery_is_server_managed' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists sms_campaigns_guard on public.sms_campaigns;
create trigger sms_campaigns_guard before insert or update on public.sms_campaigns
  for each row execute function public.sms_campaigns_guard();

-- 2. sms_campaign_runs ---------------------------------------------------------
alter table public.sms_campaign_runs
  add column if not exists delivery text not null default 'phone',
  add column if not exists trigger text not null default 'schedule',
  add column if not exists planned_count integer,
  add column if not exists audience_summary jsonb,
  add column if not exists error text,
  add column if not exists report jsonb,
  add column if not exists report_final_at timestamptz;

alter table public.sms_campaign_runs
  add constraint sms_campaign_runs_delivery_ck check (delivery in ('phone', 'server')),
  add constraint sms_campaign_runs_trigger_ck check (trigger in ('schedule', 'send_now')),
  add constraint sms_campaign_runs_planned_ck check (planned_count is null or planned_count >= 0),
  add constraint sms_campaign_runs_error_ck check (error is null or error ~ '^[a-z0-9_]{1,40}$');

-- One open server run per campaign: a double-click on "Send now" is a no-op.
create unique index if not exists sms_campaign_runs_one_open_server_idx
  on public.sms_campaign_runs(campaign_id)
  where delivery = 'server' and status in ('pending', 'running');
-- The tick's crash recovery + run closing read open runs per store.
create index if not exists sms_campaign_runs_open_idx
  on public.sms_campaign_runs(tenant_id) where status in ('pending', 'running');

-- Definer: reading the parent campaign must not depend on the caller's RLS.
create or replace function public.sms_campaign_runs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.sms_campaigns_is_trusted_writer() then
    return new;
  end if;
  if new.delivery = 'server'
     or exists (select 1 from public.sms_campaigns c where c.id = new.campaign_id and c.delivery = 'server') then
    raise exception 'server_campaign_run' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.sms_campaign_runs_guard() from public, anon, authenticated;

drop trigger if exists sms_campaign_runs_guard on public.sms_campaign_runs;
create trigger sms_campaign_runs_guard before insert or update on public.sms_campaign_runs
  for each row execute function public.sms_campaign_runs_guard();

comment on column public.sms_campaigns.delivery is
  'phone = the owner''s Android app sends it by hand (status active); server = sms_outbox via the tick (status scheduled). Service role only.';
comment on column public.sms_campaigns.pause_reason is
  'owner, or missed_no_phone (an occurrence went more than 24h without a phone; never caught up). Null unless paused.';
comment on column public.sms_campaigns.ends_on is 'Repeats stop after this Manila date. Null on legacy rows.';

-- ------------------------------------------------------------------------------
-- PROBES (run after applying; assert values, not "no error"):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.sms_campaigns'::regclass order by 1;
--     -- expect sms_campaigns_status_ck incl. 'scheduled', _scheduled_is_server_ck,
--     -- _delivery_ck, _pause_reason_ck (all convalidated = true)
--   select column_name, data_type, column_default from information_schema.columns
--     where table_schema = 'public' and table_name in ('sms_campaigns', 'sms_campaign_runs')
--       and column_name in ('delivery','scheduled_from','ends_on','pause_reason','trigger',
--         'planned_count','audience_summary','error','report','report_final_at');   -- 4 + 7 rows
--   select count(*) from public.sms_campaigns where delivery <> 'phone' or status = 'scheduled';  -- 0
--   select tgname from pg_trigger where not tgisinternal and tgrelid in
--     ('public.sms_campaigns'::regclass, 'public.sms_campaign_runs'::regclass);
--     -- sms_campaigns_guard, sms_campaign_runs_guard (+ sms_campaigns_set_updated_at)
--   select indexname from pg_indexes where indexname in
--     ('sms_campaign_runs_one_open_server_idx','sms_campaign_runs_open_idx','sms_campaigns_server_scheduled_idx');  -- 3
-- Behavioural, inside a transaction that is rolled back, AS `authenticated`
-- (set local role authenticated; set local request.jwt.claims = '{"sub":"<staff uid>","role":"authenticated"}'):
--   insert into sms_campaigns(tenant_id,name,message_template,schedule_date,delivery)
--     values ('<tenant>','x','x','2026-12-01','server');                   -- ERROR 42501 delivery_is_server_managed
--   update sms_campaigns set delivery='server' where id='<phone campaign>';  -- ERROR 42501
--   -- with a server campaign <sc> (made by the service role):
--   insert into sms_campaign_runs(tenant_id,campaign_id,due_at) values ('<tenant>','<sc>',now());  -- ERROR 42501 server_campaign_run
--   update sms_campaigns set status='active' where id='<sc>' returning status;  -- 'scheduled'
-- ROLLBACK (manual): drop the two triggers + functions, the three indexes, the
-- new columns, and restore sms_campaigns_status_ck without 'scheduled'.
-- ------------------------------------------------------------------------------
