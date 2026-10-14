-- Review follow-ups to 20261013120000_sms_automations.sql (already applied).
--
-- 1. An automation switched OFF while a tick was already planning could still
--    have rows queued seconds later; the claim now cancels an automatic text
--    whose automation is no longer on (`automation_off`). Run-now texts were
--    an explicit owner action and are kept.
-- 2. The per-guest cap counts texts the sweep marked `unconfirmed`: no report
--    from the phone is not proof the guest never got it.
-- 3. Pacing counts the reward codes the same phone sent (loyalty_sms_outbox):
--    Android's ~30 per 30 minutes is per app, not per queue.
-- 4. Branch-locked accounts no longer read store-wide automations, rules or
--    texts through PostgREST (the API already refused them), and the outbox's
--    lease and device columns are not readable by staff at all.

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
            or (o.status='failed' and o.error='unconfirmed'
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

drop policy sms_automations_staff_select on public.sms_automations;
drop policy sms_settings_staff_select on public.sms_settings;
drop policy sms_outbox_staff_select on public.sms_outbox;
create policy sms_automations_staff_select on public.sms_automations for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers')
    and not exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.outlet_id is not null));
create policy sms_settings_staff_select on public.sms_settings for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers')
    and not exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.outlet_id is not null));
create policy sms_outbox_staff_select on public.sms_outbox for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers')
    and not exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.outlet_id is not null));

revoke select on public.sms_outbox from authenticated;
grant select (id, tenant_id, automation_id, recipe, family, customer_id, phone_e164, body, occurrence_key, priority,
  source, status, not_before, expires_at, sent_at, skip_reason, error, created_at, updated_at)
  on public.sms_outbox to authenticated;

-- Rollback: re-apply claim_sms_outbox_message and the three policies from
-- 20261013120000_sms_automations.sql; `grant select on public.sms_outbox to authenticated`.
