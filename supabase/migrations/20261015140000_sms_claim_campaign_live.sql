-- Send-time checks the claim was missing (review of feat/sms-automations, 2026-10-15).
--
-- 1. Campaign texts (source='campaign', web Texts) were released even after
--    their campaign was paused or archived: the web flips the status and THEN
--    withdraws the queued rows (two writes), and a pause written by staff
--    through PostgREST does not touch sms_outbox at all (the 5-minute tick
--    reconciles). The claim now cancels a campaign text unless its run is
--    still open (pending/running) AND its campaign is still 'scheduled'.
--    skip_reason 'paused' (put back on resume, like the tick's withdraw) or
--    'archived'.
-- 2. The per-guest cap now also counts texts the phone reported as
--    `device_restarted` (its journal said "sending" when the app died): like
--    `unconfirmed`, no report is not proof the guest never got it.
-- 3. sms_campaigns_guard: an untrusted writer (staff via PostgREST) could take
--    a server DRAFT (or an archived campaign) to 'paused' and then "resume" it
--    to 'scheduled', going live without the web's checks. Pausing is now only
--    allowed from 'scheduled'/'active'; archiving, resuming a paused campaign
--    and renaming are unchanged.
--
-- Safety: replaces two function bodies (same signatures; grants re-stated).
-- No data changes. Apply AFTER 20261015131000_sms_campaign_aggregates.sql.

create or replace function public.claim_sms_outbox_message(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  rules public.sms_settings%rowtype;
  msg public.sms_outbox%rowtype;
  guest public.customers%rowtype;
  candidate record;
  now_at timestamptz;
  day_start timestamptz;
  sent_today integer;
  recent_count integer;
  oldest_recent timestamptz;
  last_contact timestamptz;
  next_at timestamptz;
  reason text;
  outcome text;
  guest_found boolean;
  campaign_status text;
begin
  if not public.sms_outbox_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash) then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  -- One claim at a time per store: the daily limit and the per-guest cap are store-wide.
  perform pg_advisory_xact_lock(18705,hashtext(p_tenant_id::text));
  insert into public.loyalty_sms_device_heartbeats as h(device_id,tenant_id,last_seen_at)
    values(p_device_id,p_tenant_id,clock_timestamp())
    on conflict (device_id) do update set last_seen_at=excluded.last_seen_at,tenant_id=excluded.tenant_id
    where h.last_seen_at<clock_timestamp()-interval '10 seconds';
  perform public.sweep_sms_outbox(p_tenant_id);

  insert into public.sms_settings(tenant_id) values(p_tenant_id) on conflict do nothing;
  select * into rules from public.sms_settings where tenant_id=p_tenant_id;
  now_at:=clock_timestamp();

  if public.sms_is_quiet_at(now_at,rules.quiet_hours_start,rules.quiet_hours_end) then
    return jsonb_build_object('ok',false,'error','quiet_hours'); end if;

  day_start:=date_trunc('day',now_at at time zone 'Asia/Manila') at time zone 'Asia/Manila';
  select count(*) into sent_today from public.sms_outbox
    where tenant_id=p_tenant_id and dispatch_started_at>=day_start;
  if sent_today>=rules.daily_limit then
    return jsonb_build_object('ok',false,'error','daily_limit','retryAt',day_start+interval '1 day'); end if;

  -- Android counts every SMS from this app, so reward codes from the same phone count too.
  select count(*),min(t) into recent_count,oldest_recent from (
    select dispatch_started_at as t from public.sms_outbox
      where claimed_by_device=p_device_id and dispatch_started_at>now_at-interval '30 minutes'
    union all
    select l.dispatch_started_at from public.loyalty_sms_outbox l
      where l.claimed_by_device=p_device_id::text and l.dispatch_started_at>now_at-interval '30 minutes'
  ) sent_recently;
  if recent_count>=25 then
    return jsonb_build_object('ok',false,'error','paced','retryAt',oldest_recent+interval '30 minutes'); end if;

  for candidate in select o.id from public.sms_outbox o
    where o.tenant_id=p_tenant_id and o.status='queued' and o.not_before<=now_at and o.expires_at>now_at
    order by o.priority,o.not_before,o.created_at,o.id limit 25
  loop
    select * into msg from public.sms_outbox where id=candidate.id and status='queued' for update skip locked;
    if not found then continue; end if;
    reason:=null;
    outcome:='skipped';
    select * into guest from public.customers where id=msg.customer_id and tenant_id=p_tenant_id;
    guest_found:=found;
    if msg.source='auto' and not exists(select 1 from public.sms_automations a
        where a.id=msg.automation_id and a.tenant_id=p_tenant_id and a.status='on') then
      -- Switched off (or deleted) after a tick had already read it as on.
      reason:='automation_off'; outcome:='cancelled';
    elsif msg.source='campaign' and not exists(select 1 from public.sms_campaign_runs r
        join public.sms_campaigns c on c.id=r.campaign_id and c.tenant_id=p_tenant_id
        where r.id=msg.campaign_run_id and r.tenant_id=p_tenant_id
          and r.status in ('pending','running') and c.status='scheduled') then
      -- Paused, archived or closed after the run queued it: never released.
      -- 'paused' rows are put back by a resume (requeuePausedTexts).
      select c.status into campaign_status from public.sms_campaign_runs r
        join public.sms_campaigns c on c.id=r.campaign_id and c.tenant_id=p_tenant_id
        where r.id=msg.campaign_run_id and r.tenant_id=p_tenant_id and r.status in ('pending','running');
      reason:=case when campaign_status='paused' then 'paused' else 'archived' end; outcome:='cancelled';
    elsif not guest_found or guest.phone_e164 is distinct from msg.phone_e164 then reason:='guest_changed';
    elsif guest.sms_consent is not true then reason:='no_consent';
    elsif guest.sms_opt_out is true then reason:='opted_out';
    elsif exists(select 1 from public.sms_suppressions s
        where s.tenant_id=p_tenant_id and s.phone_e164=msg.phone_e164) then reason:='suppressed';
    elsif msg.exit_if_ordered_after is not null and guest.last_order_at>msg.exit_if_ordered_after then
      reason:='ordered'; outcome:='cancelled';
    elsif msg.entitlement_id is not null and not exists(select 1 from public.loyalty_entitlements e
        where e.id=msg.entitlement_id and e.tenant_id=p_tenant_id and e.status in ('issued','restored')
          and (e.expires_at is null or e.expires_at>now_at)) then
      reason:='reward_used'; outcome:='cancelled';
    end if;
    if reason is not null then
      update public.sms_outbox set status=outcome,skip_reason=reason where id=msg.id;
      continue;
    end if;

    -- Per-guest cap across automated texts AND campaign sends: hold, never drop.
    select max(t) into last_contact from (
      select coalesce(o.sent_at,o.dispatch_started_at) as t from public.sms_outbox o
        where o.tenant_id=p_tenant_id and o.phone_e164=msg.phone_e164 and o.id<>msg.id
          and (o.status='claimed'
            or (o.status='sent' and o.sent_at>now_at-make_interval(days=>rules.guest_cap_days))
            -- No confirmation is not proof it never arrived.
            or (o.status='failed' and o.error in ('unconfirmed','device_restarted')
              and o.dispatch_started_at>now_at-make_interval(days=>rules.guest_cap_days)))
      union all
      select s.sent_at from public.sms_sends s
        where s.tenant_id=p_tenant_id and s.phone_e164=msg.phone_e164 and s.result='sent'
          and s.sent_at>now_at-make_interval(days=>rules.guest_cap_days)
    ) recent;
    if last_contact is not null then
      update public.sms_outbox set not_before=greatest(last_contact+make_interval(days=>rules.guest_cap_days),now_at+interval '1 hour')
        where id=msg.id;
      continue;
    end if;

    update public.sms_outbox set status='claimed',claimed_by_device=p_device_id,claimed_by_actor=p_actor_id,
      claimed_at=now_at,dispatch_started_at=now_at,lease_token=gen_random_uuid(),skip_reason=null,error=null
      where id=msg.id returning * into msg;
    return jsonb_build_object('ok',true,'messageId',msg.id,'leaseToken',msg.lease_token,
      'phone',msg.phone_e164,'body',msg.body);
  end loop;

  select min(not_before) into next_at from public.sms_outbox
    where tenant_id=p_tenant_id and status='queued' and expires_at>now_at;
  return jsonb_build_object('ok',false,'error','no_job','nextAt',next_at);
end;
$$;
revoke all on function public.claim_sms_outbox_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_sms_outbox_message(uuid,uuid,uuid,text) to service_role;

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
    -- Pause only what is live (a paused draft could otherwise be "resumed" live).
    if new.status is distinct from old.status
       and not ((new.status = 'paused' and old.status in ('scheduled', 'active'))
         or new.status = 'archived'
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

-- ------------------------------------------------------------------------------
-- PROBES (after applying):
--   select prosrc ~ 'campaign_run_id' and prosrc ~ 'device_restarted'
--     from pg_proc where proname = 'claim_sms_outbox_message';                      -- true
--   select prosrc ~ 'Pause only what is live'
--     from pg_proc where proname = 'sms_campaigns_guard';                           -- true
--   select array_to_string(proacl, ' ') from pg_proc where proname = 'claim_sms_outbox_message';
--     -- postgres + service_role only
-- Behavioural (ROLLED BACK; <D> = a server draft, <S> = a scheduled server campaign, <U> = staff with customers):
--   begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<U>","role":"authenticated"}';
--   update sms_campaigns set status = 'paused' where id = '<D>';                    -- ERROR 42501
--   update sms_campaigns set status = 'paused' where id = '<S>' returning status;   -- 'paused'
--   rollback;
--   Service role, throwaway tenant with an enrolled dev phone: queue one campaign row for the open run
--   of <S>, set <S> paused, call claim_sms_outbox_message -> no_job; the row is cancelled, skip_reason 'paused'.
-- ROLLBACK (manual): re-apply claim_sms_outbox_message from 20261013140000_sms_outbox_hardening.sql
-- and sms_campaigns_guard from 20261015130000_sms_campaigns_server_guard.sql.
-- ------------------------------------------------------------------------------
