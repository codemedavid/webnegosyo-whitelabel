-- Server-run campaigns (web Texts) are managed by the web only.
--
-- Follow-up to 20261015120000_sms_campaigns_server_delivery.sql (review of
-- 574f3317). Staff with `customers` can still write sms_campaigns through
-- PostgREST (the phone app does). For a row with delivery='server', an
-- UNTRUSTED writer (anyone but the service role / a superuser session — see
-- sms_campaigns_is_trusted_writer, JWT first) may now ONLY:
--   * pause it or archive it (status -> 'paused' | 'archived'),
--   * "Resume" a paused one the old-app way (status -> 'active' or
--     'scheduled'; still coerced to 'scheduled'), which also re-anchors
--     scheduled_from = now() so nothing skipped while paused is caught up,
--   * rename it.
-- Everything else is refused with 42501 'server_campaign_managed':
--   * draft -> scheduled/active (checked BEFORE the active->scheduled coercion,
--     so a draft is never coerced into sending — the web validates first),
--   * any change to message_template, audience, schedule_*, ends_on,
--     scheduled_from, pause_reason, delivery, quiet hours, … (every column
--     except status/name/updated_at, so future columns are guarded too),
--   * DELETE of a server row (new BEFORE DELETE trigger).
--
-- Pause/resume outside the web and the texts already queued: a pause written
-- here does not touch sms_outbox (staff cannot write it). The 5-minute tick
-- reconciles: an open run whose campaign is paused gets its queued texts
-- withdrawn (skip_reason 'paused'); one whose campaign is scheduled again gets
-- those texts back if they have not expired (texts/server/campaign-tick.ts).
-- Until the next tick (<= 5 min) a phone may still send a few of them.
--
-- Safety: replaces one trigger function and adds a delete trigger. No data
-- changes. Rows with delivery='phone' behave exactly as before.

create or replace function public.sms_campaigns_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  is_trusted constant boolean := public.sms_campaigns_is_trusted_writer();
  free_columns constant text[] := array['status', 'name', 'updated_at'];
begin
  if tg_op = 'UPDATE' and old.delivery = 'server' and not is_trusted then
    if old.status = 'draft' and new.status in ('scheduled', 'active') then
      raise exception 'server_campaign_managed' using errcode = '42501',
        detail = 'A web campaign goes live from Texts on the web.';
    end if;
    if (to_jsonb(new) - free_columns) is distinct from (to_jsonb(old) - free_columns) then
      raise exception 'server_campaign_managed' using errcode = '42501',
        detail = 'Only pause, archive, resume or rename a web campaign here.';
    end if;
    if new.status is distinct from old.status
       and not (new.status in ('paused', 'archived')
         or (old.status = 'paused' and new.status in ('active', 'scheduled'))) then
      raise exception 'server_campaign_managed' using errcode = '42501';
    end if;
    -- Resumed outside the web: anchor now, never catch up on what was skipped.
    if old.status = 'paused' and new.status in ('active', 'scheduled') then
      new.scheduled_from := now();
    end if;
  end if;

  -- An old app "resuming" a server campaign writes active: keep it server-run.
  if new.delivery = 'server' and new.status = 'active' then new.status := 'scheduled'; end if;
  if new.status <> 'paused' then new.pause_reason := null; end if;
  if not is_trusted
     and ((tg_op = 'INSERT' and new.delivery = 'server')
       or (tg_op = 'UPDATE' and new.delivery is distinct from old.delivery)) then
    raise exception 'delivery_is_server_managed' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.sms_campaigns_guard_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.delivery = 'server' and not public.sms_campaigns_is_trusted_writer() then
    raise exception 'server_campaign_managed' using errcode = '42501',
      detail = 'Archive a web campaign instead; only the web deletes its drafts.';
  end if;
  return old;
end $$;

drop trigger if exists sms_campaigns_guard_delete on public.sms_campaigns;
create trigger sms_campaigns_guard_delete before delete on public.sms_campaigns
  for each row execute function public.sms_campaigns_guard_delete();

-- ------------------------------------------------------------------------------
-- PROBES (after applying). Static:
--   select tgname from pg_trigger where tgrelid = 'public.sms_campaigns'::regclass and not tgisinternal order by 1;
--     -- sms_campaigns_guard, sms_campaigns_guard_delete, sms_campaigns_set_updated_at
--   select prosrc ~ 'server_campaign_managed' from pg_proc where proname = 'sms_campaigns_guard';   -- true
-- Behavioural — each in its own transaction, ROLLED BACK. Setup as postgres:
--   <S> = a delivery='server' status='scheduled' campaign, <D> = a server draft,
--   <P> = a server paused campaign, <F> = a phone (delivery='phone') campaign, same tenant <T>,
--   <U> = a staff user of <T> with `customers`.
--   begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<U>","role":"authenticated"}';
--   update sms_campaigns set message_template = 'x' where id = '<S>';         -- ERROR 42501 server_campaign_managed
--   update sms_campaigns set ends_on = '2027-01-01' where id = '<S>';         -- ERROR 42501
--   update sms_campaigns set status = 'scheduled' where id = '<D>';           -- ERROR 42501 (draft never goes live here)
--   update sms_campaigns set status = 'active' where id = '<D>';              -- ERROR 42501 (checked before coercion)
--   delete from sms_campaigns where id = '<S>';                               -- ERROR 42501
--   update sms_campaigns set status = 'paused' where id = '<S>' returning status;            -- 1 row, 'paused'
--   update sms_campaigns set status = 'active' where id = '<P>' returning status, scheduled_from;  -- 'scheduled', ~now()
--   update sms_campaigns set name = 'Renamed' where id = '<S>' returning name;              -- 1 row
--   update sms_campaigns set message_template = 'still mine' where id = '<F>' returning id; -- 1 row (phone rows unchanged)
--   rollback;
-- As service_role (set local request.jwt.claims = '{"role":"service_role"}'): every update above succeeds.
-- ROLLBACK (manual): re-run the sms_campaigns_guard body from 20261015120000; drop trigger + function sms_campaigns_guard_delete.
-- ------------------------------------------------------------------------------
