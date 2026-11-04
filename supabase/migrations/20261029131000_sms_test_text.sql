-- "Send a test text" from the web Texts page (2026-10-29).
--
-- An owner connected a phone, saw "Ready", and had no way to prove a text
-- would really leave it. A test text is one sms_outbox row (source, recipe and
-- family 'test', no guest) that the store's own phone picks up through the
-- normal claim and reports through the normal finish, so it exercises the
-- exact path every automated and campaign text takes.
--
-- 1. Constraints: 'test' is a recipe and a source; a test row carries no
--    guest, automation, campaign run or reward (sms_outbox_test_shape_ck), so
--    customer_id is nullable for test rows only.
-- 2. claim_sms_outbox_message (live body copied verbatim, 2026-10-29):
--    a test row skips the guest checks (consent, opt-out, suppression,
--    exit-on-order, reward) and the per-guest cap — the owner typed the
--    number for themselves — but still needs the device credential, and
--    still waits for quiet hours, the daily limit and the pacing limit.
--    Test texts never count toward a GUEST's per-guest cap.
--
-- Safety: widens two CHECKs, adds one, drops NOT NULL on customer_id (the new
-- CHECK keeps it required outside tests); replaces one function body (same
-- signature; grants re-stated). No data changes. finish_sms_outbox_message and
-- sweep_sms_outbox need no change (neither reads customer_id or recipe).

alter table public.sms_outbox drop constraint if exists sms_outbox_recipe_check;
alter table public.sms_outbox add constraint sms_outbox_recipe_check check (recipe = any (array[
  'review_request','first_visit_followup','loyalty_almost_there','loyalty_reward_waiting',
  'loyalty_reward_expiring','win_back','regulars_gone_quiet','campaign','test'
]));

alter table public.sms_outbox drop constraint if exists sms_outbox_source_check;
alter table public.sms_outbox add constraint sms_outbox_source_check check (source = any (array['auto','run_now','campaign','test']));

-- A test row has no guest, so customer_id becomes nullable; the shape check
-- keeps it required for every other row.
alter table public.sms_outbox drop constraint if exists sms_outbox_test_shape_ck;
alter table public.sms_outbox add constraint sms_outbox_test_shape_ck check (
  ((source = 'test') = (recipe = 'test'))
  and (source = 'test' or customer_id is not null)
  and (source <> 'test' or (family = 'test' and automation_id is null and customer_id is null
    and campaign_run_id is null and entitlement_id is null))
);
alter table public.sms_outbox alter column customer_id drop not null;

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

    -- The owner's test text: no guest to check and no guest cap to respect.
    if msg.source='test' then
      update public.sms_outbox set status='claimed',claimed_by_device=p_device_id,claimed_by_actor=p_actor_id,
        claimed_at=now_at,dispatch_started_at=now_at,lease_token=gen_random_uuid(),skip_reason=null,error=null
        where id=msg.id returning * into msg;
      return jsonb_build_object('ok',true,'messageId',msg.id,'leaseToken',msg.lease_token,
        'phone',msg.phone_e164,'body',msg.body);
    end if;

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
    -- The owner's own test texts never count against a guest.
    select max(t) into last_contact from (
      select coalesce(o.sent_at,o.dispatch_started_at) as t from public.sms_outbox o
        where o.tenant_id=p_tenant_id and o.phone_e164=msg.phone_e164 and o.id<>msg.id and o.source<>'test'
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
