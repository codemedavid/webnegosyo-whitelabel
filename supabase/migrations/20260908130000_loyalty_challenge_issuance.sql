-- Trusted issuance only; no public endpoint or delivery worker is enabled here.
alter table public.loyalty_otp_challenges add column issuance_ip_hash text
  check (issuance_ip_hash ~ '^[0-9a-f]{64}$');
alter table public.loyalty_otp_challenges add column issuance_request_hash text
  check (issuance_request_hash ~ '^[0-9a-f]{64}$');
-- Retry metadata survives later invalidation without making an old OTP valid.
alter table public.loyalty_otp_challenges add column issuance_expires_at timestamptz;

-- No tenant FK: well-formed requests for missing tenants must still consume
-- the global IP budget, and deleting a tenant must not erase abuse history.
create table public.loyalty_issuance_rate_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index loyalty_issuance_rate_phone_idx on public.loyalty_issuance_rate_events(tenant_id,phone_hash,created_at desc);
create index loyalty_issuance_rate_ip_idx on public.loyalty_issuance_rate_events(ip_hash,created_at desc);
create index loyalty_issuance_rate_tenant_idx on public.loyalty_issuance_rate_events(tenant_id,created_at desc);
alter table public.loyalty_issuance_rate_events enable row level security;
revoke all on public.loyalty_issuance_rate_events from public,anon,authenticated,service_role;
grant select on public.loyalty_issuance_rate_events to service_role;
create policy loyalty_issuance_rate_service_select on public.loyalty_issuance_rate_events for select to service_role using(true);

create or replace function public.issue_loyalty_challenge(
  p_tenant_id uuid, p_challenge_id uuid, p_entitlement_id uuid,
  p_expected_customer_key text, p_phone_hash text, p_code_hash text,
  p_ip_hash text, p_payload_encrypted text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  reward public.loyalty_entitlements%rowtype;
  previous public.loyalty_otp_challenges%rowtype;
  request_hash text;
  tenant_live boolean;
  rate_event_id bigint;
  ciphertext text;
  issued_time timestamptz;
begin
  -- Quota reads must see commits made while advisory locks were awaited.
  if current_setting('transaction_isolation') <> 'read committed'
    or p_tenant_id is null or p_challenge_id is null or p_entitlement_id is null
    or p_expected_customer_key is null or p_expected_customer_key !~ '^phone:[+]639[0-9]{9}$'
    or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_payload_encrypted is null or octet_length(p_payload_encrypted)>4096
    or p_payload_encrypted !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  ciphertext:=split_part(p_payload_encrypted,'.',3);
  -- Match claim-crypto's canonical unpadded base64url validation, including
  -- unused tail bits. SQL cannot authenticate AES: that remains server-only.
  if length(ciphertext)%4=1
    or (length(ciphertext)%4=2 and right(ciphertext,1) !~ '^[AQgw]$')
    or (length(ciphertext)%4=3 and right(ciphertext,1) !~ '^[AEIMQUYcgkosw048]$')
    or right(p_payload_encrypted,1) !~ '^[AQgw]$' then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  select loyalty_enabled is true and loyalty_shadow is false into tenant_live
    from public.tenants where id=p_tenant_id for share;
  -- Separate advisory namespaces prevent IP/tenant/ID hash collisions from
  -- inverting lock order. Hash collisions within a namespace only serialize.
  perform pg_advisory_xact_lock(18701,hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(18702,hashtext(p_tenant_id::text));
  perform pg_advisory_xact_lock(18703,hashtext(p_challenge_id::text));
  request_hash:=encode(sha256(convert_to(jsonb_build_array(p_tenant_id,p_challenge_id,
    p_entitlement_id,p_expected_customer_key,p_phone_hash,p_code_hash,p_ip_hash,p_payload_encrypted)::text,'UTF8')),'hex');
  select * into previous from public.loyalty_otp_challenges where id=p_challenge_id;
  if found then
    if tenant_live is true and previous.tenant_id=p_tenant_id and previous.issuance_request_hash=request_hash
      and previous.issuance_ip_hash=p_ip_hash
      and exists(select 1 from public.loyalty_sms_outbox where challenge_id=p_challenge_id
        and tenant_id=p_tenant_id and transport='android_sim' and payload_encrypted=p_payload_encrypted) then
      return jsonb_build_object('ok',true,'challengeId',previous.id,'expiresAt',previous.issuance_expires_at);
    end if;
  end if;
  issued_time:=clock_timestamp();
  -- Internal bounded pilot policy. Every well-formed non-idempotent attempt
  -- counts, including unavailable rewards and mismatches; saturated requests
  -- need not grow the event table. Global IP MUST use a tenant-independent HMAC.
  if exists(select 1 from public.loyalty_issuance_rate_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>issued_time-interval '60 seconds')
    or (select count(*) from public.loyalty_issuance_rate_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>issued_time-interval '15 minutes')>=3
    or (select count(*) from public.loyalty_issuance_rate_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>issued_time-interval '24 hours')>=10
    or (select count(*) from public.loyalty_issuance_rate_events where ip_hash=p_ip_hash
      and created_at>issued_time-interval '15 minutes')>=30
    or (select count(*) from public.loyalty_issuance_rate_events where ip_hash=p_ip_hash
      and created_at>issued_time-interval '24 hours')>=100
    or (select count(*) from public.loyalty_issuance_rate_events where tenant_id=p_tenant_id
      and created_at>issued_time-interval '1 minute')>=60
    or (select count(*) from public.loyalty_issuance_rate_events where tenant_id=p_tenant_id
      and created_at>issued_time-interval '1 hour')>=1000 then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  insert into public.loyalty_issuance_rate_events(tenant_id,phone_hash,ip_hash,created_at)
    values(p_tenant_id,p_phone_hash,p_ip_hash,issued_time) returning id into rate_event_id;
  if tenant_live is not true or previous.id is not null then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  select * into reward from public.loyalty_entitlements where id=p_entitlement_id and tenant_id=p_tenant_id;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.loyalty_balances where program_id=reward.program_id and customer_key=reward.customer_key for update;
  select * into reward from public.loyalty_entitlements where id=p_entitlement_id and tenant_id=p_tenant_id for update;
  if reward.id is null or reward.customer_key is distinct from p_expected_customer_key
    or reward.status not in ('issued','restored')
    or (reward.expires_at is not null and reward.expires_at<=clock_timestamp()) then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  -- Acquire supersession locks before starting the new challenge's lifetime.
  -- FOR UPDATE rechecks verified_at after waits, preserving completed claims.
  perform 1 from public.loyalty_otp_challenges where tenant_id=p_tenant_id
    and phone_hash=p_phone_hash and verified_at is null order by id for update;
  perform 1 from public.loyalty_sms_outbox o join public.loyalty_otp_challenges c on c.id=o.challenge_id
    where c.tenant_id=p_tenant_id and c.phone_hash=p_phone_hash and c.verified_at is null
      and o.status='queued' order by o.id for update of o;
  issued_time:=clock_timestamp();
  if reward.expires_at is not null and reward.expires_at<=issued_time then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  -- Reward lock waits must not consume the resend cooldown before SMS exists.
  update public.loyalty_issuance_rate_events set created_at=issued_time where id=rate_event_id;
  -- Verification holds balance -> entitlement -> challenge and never waits for
  -- advisory locks. Once it owns a challenge it only inserts its claim, so
  -- expiring other rewards' challenges here cannot form a lock cycle with it.
  with superseded as (
    update public.loyalty_otp_challenges set expires_at=least(expires_at,issued_time)
      where tenant_id=p_tenant_id and phone_hash=p_phone_hash and verified_at is null
      returning id
  ) update public.loyalty_sms_outbox set status='failed',error='superseded'
      where challenge_id in (select id from superseded) and status='queued';
  insert into public.loyalty_otp_challenges(id,tenant_id,entitlement_id,phone_hash,code_hash,issuance_ip_hash,issuance_request_hash,issuance_expires_at,created_at,expires_at,max_attempts)
    values(p_challenge_id,p_tenant_id,p_entitlement_id,p_phone_hash,p_code_hash,p_ip_hash,request_hash,issued_time+interval '5 minutes',issued_time,issued_time+interval '5 minutes',5);
  insert into public.loyalty_sms_outbox(tenant_id,challenge_id,transport,payload_encrypted)
    values(p_tenant_id,p_challenge_id,'android_sim',p_payload_encrypted);
  return jsonb_build_object('ok',true,'challengeId',p_challenge_id,'expiresAt',issued_time+interval '5 minutes');
end;
$$;
revoke all on public.loyalty_otp_challenges,public.loyalty_sms_outbox from public,anon,authenticated;
revoke all on function public.issue_loyalty_challenge(uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.issue_loyalty_challenge(uuid,uuid,uuid,text,text,text,text,text) to service_role;

comment on function public.issue_loyalty_challenge(uuid,uuid,uuid,text,text,text,text,text) is
  'Trusted server only, one RPC per transaction at READ COMMITTED. Derive expected_customer_key and phone_hash together from the SAME canonical PH mobile using claim-crypto; derive code_hash and AES-GCM envelope with the same tenant/challenge context. Never accept client-supplied proofs. IP hash must be a tenant-independent keyed digest of a trusted normalized client IP. Internal pilot limits: phone 60-second cooldown, 3/15 minutes, 10/24 hours per tenant; global IP 30/15 minutes, 100/24 hours; tenant 60/minute, 1000/hour. Fixed Android SIM delivery only. Exact retries recover original metadata without extending the actual challenge expiry or sending again. No public endpoint until delivery and abuse routing are complete.';
