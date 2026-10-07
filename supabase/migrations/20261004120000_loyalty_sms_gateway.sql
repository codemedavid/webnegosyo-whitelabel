-- Loyalty SMS gateway: phone heartbeats + a server (Semaphore) fallback path.
--
-- 1. Every authorized claim poll records a heartbeat, so issuance can tell a
--    customer "this store can't send codes right now" instead of queueing a
--    code no phone will ever pick up. Heartbeats live in their OWN table: the
--    claim path already holds a FOR SHARE lock on the device row, and updating
--    that row from two concurrent polls would deadlock. The upsert runs after
--    the per-device advisory lock, so polls for one device are serialized.
-- 2. When no phone is online and the store has a Semaphore key, the trusted
--    server takes the still-queued job itself. It locks challenge -> outbox in
--    the same order as every other path, and only a QUEUED job that no phone
--    has started can move, so exactly one sender ever releases a code.
-- 3. tenant_secrets gains the store's own Semaphore key (the store pays).
--
-- Purely additive: one table, two columns, three new functions, and
-- claim_loyalty_sms_job re-created with an identical signature and body plus
-- the heartbeat. Safe to apply ahead of the web deploy. Rollback at the bottom.

create table public.loyalty_sms_device_heartbeats (
  device_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  last_seen_at timestamptz not null
);
create index loyalty_sms_device_heartbeats_tenant_idx
  on public.loyalty_sms_device_heartbeats(tenant_id, last_seen_at desc);
alter table public.loyalty_sms_device_heartbeats enable row level security;
revoke all on public.loyalty_sms_device_heartbeats from public,anon,authenticated,service_role;
grant select on public.loyalty_sms_device_heartbeats to service_role;
create policy loyalty_sms_device_heartbeats_service_select on public.loyalty_sms_device_heartbeats
  for select to service_role using(true);

alter table public.tenant_secrets
  add column if not exists semaphore_api_key text,
  add column if not exists semaphore_sender_name text
    check (semaphore_sender_name is null or semaphore_sender_name ~ '^[A-Za-z0-9 ]{1,11}$');

create or replace function public.claim_loyalty_sms_job(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  candidate record;
  challenge public.loyalty_otp_challenges%rowtype;
  job public.loyalty_sms_outbox%rowtype;
  current_job uuid;
  claimed_time timestamptz;
begin
  if not public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash) then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform pg_advisory_xact_lock(18704,hashtext(p_device_id::text));
  -- Heartbeat: an authorized poll proves this phone can send right now.
  -- Throttled so a 5-second poll is not a 5-second write.
  insert into public.loyalty_sms_device_heartbeats as h(device_id,tenant_id,last_seen_at)
    values(p_device_id,p_tenant_id,clock_timestamp())
    on conflict (device_id) do update set last_seen_at=excluded.last_seen_at,tenant_id=excluded.tenant_id
    where h.last_seen_at<clock_timestamp()-interval '10 seconds';
  select id into current_job from public.loyalty_sms_outbox where tenant_id=p_tenant_id
    and claimed_by_device=p_device_id::text and status='claimed'
    and (lease_expires_at>clock_timestamp() or dispatch_started_at is not null) order by id limit 1;
  -- Filter dead OTP history before bounding work. If the oldest 25 live
  -- candidates are locked, return no_job and let the device poll later.
  for candidate in select o.id,o.challenge_id from public.loyalty_sms_outbox o
    join public.loyalty_otp_challenges c on c.id=o.challenge_id and c.tenant_id=p_tenant_id
    where o.tenant_id=p_tenant_id and o.transport='android_sim'
      and c.expires_at>clock_timestamp() and c.verified_at is null
      and c.attempts>=0 and c.max_attempts between 1 and 5 and c.attempts<c.max_attempts
      and (current_job is null or o.id=current_job)
      and (o.status='queued' or (o.status='claimed' and (o.id=current_job
        or (o.lease_expires_at<=clock_timestamp() and o.dispatch_started_at is null))))
    order by o.created_at,o.id limit 25
  loop
    -- Never lock an outbox row before its challenge: issuance supersedes in this order.
    select * into challenge from public.loyalty_otp_challenges where id=candidate.challenge_id
      and tenant_id=p_tenant_id for update skip locked;
    if not found then continue; end if;
    if challenge.expires_at<=clock_timestamp() or challenge.verified_at is not null
      or challenge.attempts<0 or challenge.max_attempts not between 1 and 5
      or challenge.attempts>=challenge.max_attempts then continue; end if;
    select * into job from public.loyalty_sms_outbox where id=candidate.id
      and tenant_id=p_tenant_id and challenge_id=challenge.id for update skip locked;
    if not found or job.dispatch_started_at is not null or job.transport<>'android_sim' then continue; end if;
    claimed_time:=clock_timestamp();
    if challenge.expires_at<=claimed_time then continue; end if;
    if job.status='claimed' and job.lease_expires_at>claimed_time then
      if job.claimed_by_device is distinct from p_device_id::text
        or job.claimed_by_actor is distinct from p_actor_id then continue; end if;
    elsif job.status='queued' or (job.status='claimed' and job.lease_expires_at<=claimed_time) then
      update public.loyalty_sms_outbox set status='claimed',claimed_by_device=p_device_id::text,
        claimed_by_actor=p_actor_id,claimed_at=claimed_time,lease_token=gen_random_uuid(),
        lease_expires_at=least(claimed_time+interval '30 seconds',challenge.expires_at),error=null
        where id=job.id returning * into job;
    else continue;
    end if;
    return jsonb_build_object('ok',true,'jobId',job.id,'leaseToken',job.lease_token,
      'leaseExpiresAt',job.lease_expires_at,'challengeId',challenge.id,'expiresAt',challenge.expires_at);
  end loop;
  return jsonb_build_object('ok',false,'error','no_job');
end;
$$;
revoke all on function public.claim_loyalty_sms_job(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_loyalty_sms_job(uuid,uuid,uuid,text) to service_role;

-- Is any enabled phone of this store polling? The window is the caller's so
-- the poll cadence and the "online" rule live together in TypeScript.
create function public.loyalty_sms_sender_status(p_tenant_id uuid,p_window_seconds integer)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('ok',true,
    'gatewayOnline',coalesce(max(h.last_seen_at)>clock_timestamp()-make_interval(secs=>greatest(p_window_seconds,1)),false),
    'lastSeenAt',max(h.last_seen_at))
  from public.loyalty_sms_device_heartbeats h
  join public.loyalty_sms_devices d on d.device_id=h.device_id and d.tenant_id=h.tenant_id and d.enabled is true
  where h.tenant_id=p_tenant_id;
$$;
revoke all on function public.loyalty_sms_sender_status(uuid,integer) from public,anon,authenticated;
grant execute on function public.loyalty_sms_sender_status(uuid,integer) to service_role;

-- The trusted server takes a queued phone job for its own transport. One-use:
-- the payload is released exactly once, and only before any phone started it.
create function public.begin_loyalty_sms_server_dispatch(p_tenant_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge public.loyalty_otp_challenges%rowtype;
  job public.loyalty_sms_outbox%rowtype;
  started timestamptz;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or p_tenant_id is null or p_challenge_id is null then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into challenge from public.loyalty_otp_challenges
    where id=p_challenge_id and tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  started:=clock_timestamp();
  if challenge.expires_at<=started or challenge.verified_at is not null
    or challenge.attempts<0 or challenge.max_attempts not between 1 and 5
    or challenge.attempts>=challenge.max_attempts then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where challenge_id=challenge.id
    and tenant_id=p_tenant_id order by created_at desc,id limit 1 for update;
  if not found or job.status<>'queued' or job.transport<>'android_sim'
    or job.dispatch_started_at is not null or job.claimed_by_device is not null then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  update public.loyalty_sms_outbox set transport='semaphore',status='claimed',claimed_at=started,
    dispatch_started_at=started,error=null where id=job.id;
  return jsonb_build_object('ok',true,'jobId',job.id,'payloadEncrypted',job.payload_encrypted);
end;
$$;
revoke all on function public.begin_loyalty_sms_server_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_loyalty_sms_server_dispatch(uuid,uuid) to service_role;

create function public.finish_loyalty_sms_server_dispatch(p_tenant_id uuid,p_job_id uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  job public.loyalty_sms_outbox%rowtype;
  challenge_id uuid;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or p_outcome is null or p_outcome not in ('sent','failed') then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  perform 1 from public.loyalty_otp_challenges c where c.id=challenge_id
    and c.tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where id=p_job_id and tenant_id=p_tenant_id for update;
  if job.id is null or job.transport<>'semaphore' or job.claimed_by_device is not null
    or job.dispatch_started_at is null then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.status in ('sent','failed') then
    if job.status=p_outcome then return jsonb_build_object('ok',true); end if;
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.status<>'claimed' then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  update public.loyalty_sms_outbox set status=p_outcome,
    sent_at=case when p_outcome='sent' then clock_timestamp() else null end,
    error=case when p_outcome='failed' then 'delivery_failed' else null end where id=job.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.finish_loyalty_sms_server_dispatch(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_loyalty_sms_server_dispatch(uuid,uuid,text) to service_role;

comment on function public.begin_loyalty_sms_server_dispatch(uuid,uuid) is
  'Trusted server only. Moves a still-queued phone job to the server transport and releases its encrypted payload once. Never retry an uncertain dispatch; the customer requests a new code.';

-- Rollback:
--   drop function public.finish_loyalty_sms_server_dispatch(uuid,uuid,text);
--   drop function public.begin_loyalty_sms_server_dispatch(uuid,uuid);
--   drop function public.loyalty_sms_sender_status(uuid,integer);
--   re-apply claim_loyalty_sms_job from 20260909120000_loyalty_sms_delivery.sql;
--   drop table public.loyalty_sms_device_heartbeats;
--   alter table public.tenant_secrets drop column semaphore_sender_name, drop column semaphore_api_key;
