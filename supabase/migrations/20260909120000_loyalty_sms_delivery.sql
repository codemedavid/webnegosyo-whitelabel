-- Trusted provisioning only. A client supplied device UUID is never a credential.
create table public.loyalty_sms_devices (
  device_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  credential_hash text not null check (credential_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true
);
alter table public.loyalty_sms_devices enable row level security;
revoke all on public.loyalty_sms_devices from public,anon,authenticated,service_role;
grant select on public.loyalty_sms_devices to service_role;
create policy loyalty_sms_devices_service_select on public.loyalty_sms_devices
  for select to service_role using(true);

-- Internal helper holds authorization stable until commit. Serialize claims
-- per device separately from row SHARE locks so provisioning can revoke safely.
create function public.loyalty_sms_delivery_allowed(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  if current_setting('transaction_isolation') <> 'read committed'
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  perform 1 from public.tenants where id=p_tenant_id and loyalty_enabled is true
    and loyalty_shadow is false for share;
  if not found then return false; end if;
  perform 1 from public.loyalty_sms_devices where device_id=p_device_id and tenant_id=p_tenant_id
    and actor_id=p_actor_id and credential_hash=p_credential_hash and enabled is true for share;
  if not found then return false; end if;
  perform 1 from public.app_users where user_id=p_actor_id
    and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id
      and (is_owner is true or permissions is null or 'loyalty_manage'=any(permissions)))) for share;
  return found;
end;
$$;
revoke all on function public.loyalty_sms_delivery_allowed(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

alter table public.loyalty_sms_outbox
  add column claimed_by_actor uuid references auth.users(id),
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column dispatch_started_at timestamptz;
revoke all on public.loyalty_sms_outbox from public,anon,authenticated;
create index loyalty_sms_outbox_device_lease_idx on public.loyalty_sms_outbox(claimed_by_device)
  where status='claimed';

create function public.claim_loyalty_sms_job(
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

create function public.authorize_loyalty_sms_dispatch(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text,p_job_id uuid,p_lease_token uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge public.loyalty_otp_challenges%rowtype;
  job public.loyalty_sms_outbox%rowtype;
  challenge_id uuid;
  dispatch_time timestamptz;
begin
  if not public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash) then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  select * into challenge from public.loyalty_otp_challenges c where c.id=challenge_id
    and c.tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where id=p_job_id and tenant_id=p_tenant_id for update;
  dispatch_time:=clock_timestamp();
  if job.id is null or job.challenge_id is distinct from challenge.id or job.transport<>'android_sim'
    or job.status<>'claimed' or job.claimed_by_actor is distinct from p_actor_id
    or job.claimed_by_device is distinct from p_device_id::text or p_lease_token is null
    or job.lease_token is distinct from p_lease_token or job.lease_expires_at is null
    or job.lease_expires_at<=dispatch_time or job.dispatch_started_at is not null
    or challenge.expires_at<=dispatch_time or challenge.verified_at is not null
    or challenge.attempts<0 or challenge.max_attempts not between 1 and 5
    or challenge.attempts>=challenge.max_attempts then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  update public.loyalty_sms_outbox set dispatch_started_at=dispatch_time where id=job.id;
  return jsonb_build_object('ok',true,'jobId',job.id,'leaseToken',job.lease_token,
    'leaseExpiresAt',job.lease_expires_at,'challengeId',challenge.id,'expiresAt',challenge.expires_at,
    'payloadEncrypted',job.payload_encrypted);
end;
$$;
revoke all on function public.authorize_loyalty_sms_dispatch(uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_loyalty_sms_dispatch(uuid,uuid,uuid,text,uuid,uuid) to service_role;

create function public.finish_loyalty_sms_job(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text,
  p_job_id uuid,p_lease_token uuid,p_outcome text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  job public.loyalty_sms_outbox%rowtype;
  challenge_id uuid;
begin
  if not public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash)
    or p_outcome is null or p_outcome not in ('sent','failed') then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  perform 1 from public.loyalty_otp_challenges c where c.id=challenge_id
    and c.tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where id=p_job_id and tenant_id=p_tenant_id for update;
  if job.id is null or job.challenge_id is distinct from challenge_id or job.transport<>'android_sim'
    or job.claimed_by_actor is distinct from p_actor_id or job.claimed_by_device is distinct from p_device_id::text
    or p_lease_token is null or job.lease_token is distinct from p_lease_token
    or job.dispatch_started_at is null then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.status in ('sent','failed') then
    if job.status=p_outcome then return jsonb_build_object('ok',true); end if;
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.status<>'claimed' then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  -- Once dispatch starts it is never reassigned, including after OTP/lease expiry.
  update public.loyalty_sms_outbox set status=p_outcome,
    sent_at=case when p_outcome='sent' then clock_timestamp() else null end,
    error=case when p_outcome='failed' then 'delivery_failed' else null end where id=job.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.finish_loyalty_sms_job(uuid,uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_loyalty_sms_job(uuid,uuid,uuid,text,uuid,uuid,text) to service_role;

comment on table public.loyalty_sms_devices is
  'Private trusted-operator provisioning only; service role SELECT, no enrollment RPC. Store a cryptographic credential hash, never a device identifier as proof. Revocation holds through each transaction.';
comment on function public.authorize_loyalty_sms_dispatch(uuid,uuid,uuid,text,uuid,uuid) is
  'One use encrypted payload release to a trusted service, which decrypts after commit. Never retry uncertain dispatch; issue a fresh customer challenge. Invoke each RPC in its own READ COMMITTED transaction. No SMS transport or public endpoint is enabled.';
