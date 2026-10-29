-- The rewards page's "text me a code" step told a number with no stamp card
-- "a code is on its way" and sent nothing, so a store testing its new SMS
-- gateway (2026-10-28, a program created minutes earlier with no members yet)
-- saw every code request vanish with no trace. Membership is not a secret
-- here: POST /api/loyalty/progress already answers "this number holds N
-- stamps" to anyone who types it. The issuer now answers not_member, so the
-- page can say "this number has no stamp card here yet".
--
-- Only that one answer changes. The rate events are still written BEFORE the
-- membership check (probing still spends budget, and "slow down" still says
-- nothing either way); malformed input and a reused challenge id still answer
-- request_denied; nothing is queued for a non-member.

create or replace function public.issue_loyalty_wallet_challenge(
  p_tenant_id uuid, p_challenge_id uuid, p_expected_customer_key text, p_phone_hash text,
  p_code_hash text, p_ip_hash text, p_payload_encrypted text
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  previous public.loyalty_otp_challenges%rowtype;
  request_hash text;
  ciphertext text;
  issued_time timestamptz;
  retry_at timestamptz;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or p_tenant_id is null or p_challenge_id is null
    or p_expected_customer_key is null or p_expected_customer_key !~ '^phone:[+]639[0-9]{9}$'
    or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_payload_encrypted is null or octet_length(p_payload_encrypted)>4096
    or p_payload_encrypted !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  ciphertext:=split_part(p_payload_encrypted,'.',3);
  if length(ciphertext)%4=1
    or (length(ciphertext)%4=2 and right(ciphertext,1) !~ '^[AQgw]$')
    or (length(ciphertext)%4=3 and right(ciphertext,1) !~ '^[AEIMQUYcgkosw048]$')
    or right(p_payload_encrypted,1) !~ '^[AQgw]$' then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  perform pg_advisory_xact_lock(18701,hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(18702,hashtext(p_tenant_id::text));
  perform pg_advisory_xact_lock(18703,hashtext(p_challenge_id::text));
  request_hash:=encode(sha256(convert_to(jsonb_build_array('wallet',p_tenant_id,p_challenge_id,
    p_expected_customer_key,p_phone_hash,p_code_hash,p_ip_hash,p_payload_encrypted)::text,'UTF8')),'hex');
  select * into previous from public.loyalty_otp_challenges where id=p_challenge_id;
  if found then
    if previous.tenant_id=p_tenant_id and previous.purpose='wallet'
      and previous.issuance_request_hash=request_hash and previous.issuance_ip_hash=p_ip_hash then
      return jsonb_build_object('ok',true,'challengeId',previous.id,'expiresAt',previous.issuance_expires_at);
    end if;
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  issued_time:=clock_timestamp();
  if exists(select 1 from public.loyalty_wallet_issuance_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>issued_time-interval '60 seconds')
    or (select count(*) from public.loyalty_wallet_issuance_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>issued_time-interval '15 minutes')>=3
    or (select count(*) from public.loyalty_wallet_issuance_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>issued_time-interval '24 hours')>=10
    or (select count(*) from public.loyalty_wallet_issuance_events where ip_hash=p_ip_hash
      and created_at>issued_time-interval '15 minutes')>=30
    or (select count(*) from public.loyalty_wallet_issuance_events where ip_hash=p_ip_hash
      and created_at>issued_time-interval '24 hours')>=100
    or (select count(*) from public.loyalty_wallet_issuance_events where tenant_id=p_tenant_id
      and created_at>issued_time-interval '1 minute')>=60
    or (select count(*) from public.loyalty_wallet_issuance_events where tenant_id=p_tenant_id
      and created_at>issued_time-interval '1 hour')>=1000 then
    -- Saying "slow down" leaks nothing: the events above are written for
    -- members and strangers alike, before the membership check below.
    retry_at:=public.loyalty_wallet_issuance_retry_at(p_tenant_id,p_phone_hash,p_ip_hash,issued_time);
    return jsonb_build_object('ok',false,'error','rate_limited','retryAfterSeconds',
      greatest(1,least(86400,coalesce(ceil(extract(epoch from retry_at-issued_time))::int,60))));
  end if;
  insert into public.loyalty_wallet_issuance_events(tenant_id,phone_hash,ip_hash,created_at)
    values(p_tenant_id,p_phone_hash,p_ip_hash,issued_time);
  if not exists(select 1 from public.loyalty_balances where tenant_id=p_tenant_id
      and customer_key=p_expected_customer_key)
    and not exists(select 1 from public.loyalty_entitlements where tenant_id=p_tenant_id
      and customer_key=p_expected_customer_key) then
    -- The same fact /api/loyalty/progress already gives out; the page says so.
    return jsonb_build_object('ok',false,'error','not_member');
  end if;
  perform 1 from public.loyalty_otp_challenges where tenant_id=p_tenant_id
    and phone_hash=p_phone_hash and purpose='wallet' and verified_at is null order by id for update;
  perform 1 from public.loyalty_sms_outbox o join public.loyalty_otp_challenges c on c.id=o.challenge_id
    where c.tenant_id=p_tenant_id and c.phone_hash=p_phone_hash and c.purpose='wallet'
      and c.verified_at is null and o.status='queued' order by o.id for update of o;
  issued_time:=clock_timestamp();
  with superseded as (
    update public.loyalty_otp_challenges set expires_at=least(expires_at,issued_time)
      where tenant_id=p_tenant_id and phone_hash=p_phone_hash and purpose='wallet' and verified_at is null
      returning id
  ) update public.loyalty_sms_outbox set status='failed',error='superseded'
      where challenge_id in (select id from superseded) and status='queued';
  insert into public.loyalty_otp_challenges(id,tenant_id,purpose,entitlement_id,phone_hash,code_hash,issuance_ip_hash,
      issuance_request_hash,issuance_expires_at,created_at,expires_at,max_attempts)
    values(p_challenge_id,p_tenant_id,'wallet',null,p_phone_hash,p_code_hash,p_ip_hash,request_hash,
      issued_time+interval '5 minutes',issued_time,issued_time+interval '5 minutes',5);
  insert into public.loyalty_sms_outbox(tenant_id,challenge_id,transport,payload_encrypted)
    values(p_tenant_id,p_challenge_id,'android_sim',p_payload_encrypted);
  return jsonb_build_object('ok',true,'challengeId',p_challenge_id,'expiresAt',issued_time+interval '5 minutes');
end;
$function$;
