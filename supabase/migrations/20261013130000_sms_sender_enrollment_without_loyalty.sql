-- The store's sending phone now also delivers automated marketing texts
-- (sms_outbox, 20261013120000_sms_automations.sql), so enrolling it must not
-- require live loyalty: a store without a rewards program can still text its
-- guests. Identical to the previous enroll_loyalty_sms_device except the
-- tenant lock no longer filters on loyalty_enabled / loyalty_shadow.
--
-- Unchanged: owner (or superadmin) only, 5 enabled phones per store, a device
-- id is never reused (audit), idempotent re-enroll with the same credential.
-- Reward-code delivery is still gated by loyalty_sms_delivery_allowed, which
-- keeps its loyalty checks.

create or replace function public.enroll_loyalty_sms_device(
  p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare device public.loyalty_sms_devices%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' or p_device_id is null
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.tenants where id=p_tenant_id for update;
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

-- Rollback: re-apply enroll_loyalty_sms_device from 20260909130000_loyalty_sms_device_management.sql.
