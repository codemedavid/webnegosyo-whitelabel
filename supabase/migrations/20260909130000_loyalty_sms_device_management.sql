-- All management RPCs serialize on the tenant before device -> actor locks.
-- Delivery takes tenant SHARE first, so revocation cannot race an authorized send.
create table public.loyalty_sms_device_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_id uuid not null,
  device_id uuid not null,
  job_id uuid,
  action text not null check (action in ('enrolled','revoked','dispatch_abandoned')),
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  check ((action='dispatch_abandoned' and job_id is not null and reason is not null and reason='unknown_outcome')
    or (action in ('enrolled','revoked') and job_id is null and reason is null))
);
alter table public.loyalty_sms_device_audit enable row level security;
revoke all on public.loyalty_sms_device_audit from public,anon,authenticated,service_role;
grant select on public.loyalty_sms_device_audit to service_role;
create policy loyalty_sms_device_audit_service_select on public.loyalty_sms_device_audit
  for select to service_role using(true);
create index loyalty_sms_device_audit_device_idx on public.loyalty_sms_device_audit(device_id);

create function public.enroll_loyalty_sms_device(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare device public.loyalty_sms_devices%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' or p_device_id is null
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.tenants where id=p_tenant_id and loyalty_enabled is true
    and loyalty_shadow is false for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into device from public.loyalty_sms_devices where device_id=p_device_id for update;
  perform 1 from public.app_users where user_id=p_actor_id
    and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id and is_owner is true)) for share;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if device.device_id is not null then
    if device.tenant_id=p_tenant_id and device.actor_id=p_actor_id
      and device.credential_hash=p_credential_hash and device.enabled is true then
      return jsonb_build_object('ok',true); end if;
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  -- Audit survives registry cascades and permanently retires every enrolled ID.
  if exists(select 1 from public.loyalty_sms_device_audit where device_id=p_device_id) then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if (select count(*) from public.loyalty_sms_devices where tenant_id=p_tenant_id and enabled is true)>=5 then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  insert into public.loyalty_sms_devices(device_id,tenant_id,actor_id,credential_hash)
    values(p_device_id,p_tenant_id,p_actor_id,p_credential_hash) on conflict do nothing;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  insert into public.loyalty_sms_device_audit(tenant_id,actor_id,device_id,action)
    values(p_tenant_id,p_actor_id,p_device_id,'enrolled');
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.enroll_loyalty_sms_device(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enroll_loyalty_sms_device(uuid,uuid,uuid,text) to service_role;

create function public.revoke_loyalty_sms_device(p_tenant_id uuid,p_actor_id uuid,p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare device public.loyalty_sms_devices%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  -- Incident response stays available while loyalty is disabled or shadowed.
  perform 1 from public.tenants where id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into device from public.loyalty_sms_devices
    where device_id=p_device_id and tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.app_users where user_id=p_actor_id
    and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id and is_owner is true)) for share;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if device.enabled is false then return jsonb_build_object('ok',true); end if;
  update public.loyalty_sms_devices set enabled=false where device_id=p_device_id;
  insert into public.loyalty_sms_device_audit(tenant_id,actor_id,device_id,action)
    values(p_tenant_id,p_actor_id,p_device_id,'revoked');
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.revoke_loyalty_sms_device(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_loyalty_sms_device(uuid,uuid,uuid) to service_role;

create function public.abandon_loyalty_sms_dispatch(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_job_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge_id uuid;
  challenge public.loyalty_otp_challenges%rowtype;
  job public.loyalty_sms_outbox%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.tenants where id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.loyalty_sms_devices where device_id=p_device_id and tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.app_users where user_id=p_actor_id
    and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id and is_owner is true)) for share;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  select * into challenge from public.loyalty_otp_challenges c
    where c.id=challenge_id and c.tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where id=p_job_id and tenant_id=p_tenant_id for update;
  if job.id is null or job.challenge_id is distinct from challenge.id or job.transport<>'android_sim'
    or job.claimed_by_device is distinct from p_device_id::text or job.dispatch_started_at is null
    or challenge.expires_at>clock_timestamp() then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.status='failed' and job.error='dispatch_abandoned' then
    return jsonb_build_object('ok',true); end if;
  if job.status<>'claimed' then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  -- Unknown send outcome is terminal. Never requeue or release encrypted payload.
  update public.loyalty_sms_outbox set status='failed',error='dispatch_abandoned',sent_at=null where id=job.id;
  insert into public.loyalty_sms_device_audit(tenant_id,actor_id,device_id,job_id,action,reason)
    values(p_tenant_id,p_actor_id,p_device_id,p_job_id,'dispatch_abandoned','unknown_outcome');
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.abandon_loyalty_sms_dispatch(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.abandon_loyalty_sms_dispatch(uuid,uuid,uuid,uuid) to service_role;

comment on table public.loyalty_sms_devices is
  'Private device registry; service SELECT only. Owner-controlled service RPCs enroll a fresh self-owned ID or revoke permanently. Never store plaintext credentials.';
comment on table public.loyalty_sms_device_audit is
  'Private append-only owner audit, retained without cascading foreign keys. No credential hashes, tokens, phone data or payload snapshots.';
comment on function public.abandon_loyalty_sms_dispatch(uuid,uuid,uuid,uuid) is
  'Owner incident response for expired OTP dispatch with unknown send outcome. Terminal failed only; no retry or payload release. Each management RPC requires its own READ COMMITTED transaction.';

-- Recovery acknowledges a durable device intent; it never grants dispatch.
create function public.recover_loyalty_sms_ack(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text,
  p_job_id uuid,p_lease_token uuid,p_outcome text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge_id uuid;
  job public.loyalty_sms_outbox%rowtype;
begin
  if not public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash)
    or p_lease_token is null or p_outcome is null or p_outcome not in ('sent','failed') then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  perform 1 from public.loyalty_otp_challenges c where c.id=challenge_id
    and c.tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where id=p_job_id and tenant_id=p_tenant_id for update;
  if job.id is null or job.challenge_id is distinct from challenge_id or job.transport<>'android_sim'
    or job.lease_token is null then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.lease_token<>p_lease_token then
    -- Reassignment proves this old token never dispatched. Forget only the old
    -- failed intent, without changing the current job or another device's lease.
    if p_outcome='failed' then return jsonb_build_object('ok',true); end if;
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.claimed_by_actor is distinct from p_actor_id or job.claimed_by_device is distinct from p_device_id::text then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.dispatch_started_at is not null then
    return public.finish_loyalty_sms_job(p_tenant_id,p_actor_id,p_device_id,p_credential_hash,p_job_id,p_lease_token,p_outcome);
  end if;
  if p_outcome<>'failed' then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.status='failed' and job.error='delivery_not_started' then return jsonb_build_object('ok',true); end if;
  if job.status<>'claimed' or job.lease_expires_at is null or job.lease_expires_at>clock_timestamp() then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  update public.loyalty_sms_outbox set status='failed',error='delivery_not_started',sent_at=null where id=job.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.recover_loyalty_sms_ack(uuid,uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.recover_loyalty_sms_ack(uuid,uuid,uuid,text,uuid,uuid,text) to service_role;
comment on function public.recover_loyalty_sms_ack(uuid,uuid,uuid,text,uuid,uuid,text) is
  'Service-only durable-intent acknowledgement: expired predispatch failure is terminal; stale failed token acknowledgement never mutates the reassigned job. No dispatch or payload release.';
