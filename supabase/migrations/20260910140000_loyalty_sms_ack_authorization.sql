-- Distinguish invalid device access from a valid device with a refused lease ACK.
-- HTTP maps device_denied to 403; lease/outcome conflicts remain retry/recovery results.

create or replace function public.finish_loyalty_sms_job(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text,
  p_job_id uuid,p_lease_token uuid,p_outcome text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  job public.loyalty_sms_outbox%rowtype;
  challenge_id uuid;
begin
  if not public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash) then
    return jsonb_build_object('ok',false,'error','device_denied'); end if;
  if p_outcome is null or p_outcome not in ('sent','failed') then
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

create or replace function public.recover_loyalty_sms_ack(
  p_tenant_id uuid,p_actor_id uuid,p_device_id uuid,p_credential_hash text,
  p_job_id uuid,p_lease_token uuid,p_outcome text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge_id uuid;
  job public.loyalty_sms_outbox%rowtype;
begin
  if not public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash) then
    return jsonb_build_object('ok',false,'error','device_denied'); end if;
  if p_lease_token is null or p_outcome is null or p_outcome not in ('sent','failed') then
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
