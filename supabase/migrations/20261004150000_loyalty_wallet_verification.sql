-- Optional "text me a code before you show my rewards" gate for the public
-- /loyalty page. Off by default; a store turns it on from its loyalty settings.
--
-- The code travels the SAME road as a reward-claim code: an android_sim job in
-- loyalty_sms_outbox, sent by the store's gateway phone or moved to Semaphore
-- by begin_loyalty_sms_server_dispatch. Delivery never reads entitlement_id, so
-- a wallet challenge (purpose 'wallet', no reward) needs no delivery change.
-- A verified code buys a short wallet session, never a reward claim:
-- verify_loyalty_claim already refuses any purpose other than 'claim'.

create table public.loyalty_store_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  wallet_otp_required boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.loyalty_store_settings enable row level security;
revoke all on public.loyalty_store_settings from public,anon,authenticated,service_role;
grant select,insert,update on public.loyalty_store_settings to service_role;
create policy loyalty_store_settings_service on public.loyalty_store_settings
  for all to service_role using(true) with check(true);

alter table public.loyalty_otp_challenges drop constraint loyalty_otp_challenges_purpose_check;
alter table public.loyalty_otp_challenges add constraint loyalty_otp_challenges_purpose_check
  check (purpose in ('claim','wallet'));
alter table public.loyalty_otp_challenges add constraint loyalty_otp_challenges_wallet_has_no_reward
  check (purpose<>'wallet' or entitlement_id is null);

-- Separate from loyalty_issuance_rate_events on purpose: sharing it would let a
-- wallet code spend the 60-second cooldown of the reward code a customer asks
-- for right after, and that request would be silently refused.
create table public.loyalty_wallet_issuance_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index loyalty_wallet_issuance_phone_idx on public.loyalty_wallet_issuance_events(tenant_id,phone_hash,created_at desc);
create index loyalty_wallet_issuance_ip_idx on public.loyalty_wallet_issuance_events(ip_hash,created_at desc);
create index loyalty_wallet_issuance_tenant_idx on public.loyalty_wallet_issuance_events(tenant_id,created_at desc);
alter table public.loyalty_wallet_issuance_events enable row level security;
revoke all on public.loyalty_wallet_issuance_events from public,anon,authenticated,service_role;
grant select on public.loyalty_wallet_issuance_events to service_role;
create policy loyalty_wallet_issuance_service_select on public.loyalty_wallet_issuance_events
  for select to service_role using(true);

create table public.loyalty_wallet_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  challenge_id uuid not null unique references public.loyalty_otp_challenges(id) on delete cascade,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at>created_at and expires_at<=created_at+interval '30 minutes')
);
alter table public.loyalty_wallet_sessions enable row level security;
revoke all on public.loyalty_wallet_sessions from public,anon,authenticated,service_role;
grant select on public.loyalty_wallet_sessions to service_role;
create policy loyalty_wallet_sessions_service_select on public.loyalty_wallet_sessions
  for select to service_role using(true);

create function public.issue_loyalty_wallet_challenge(
  p_tenant_id uuid, p_challenge_id uuid, p_expected_customer_key text, p_phone_hash text,
  p_code_hash text, p_ip_hash text, p_payload_encrypted text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  previous public.loyalty_otp_challenges%rowtype;
  request_hash text;
  ciphertext text;
  issued_time timestamptz;
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
  -- Same namespaces and order as issue_loyalty_challenge, so the two never
  -- invert lock order against each other.
  perform pg_advisory_xact_lock(18701,hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(18702,hashtext(p_tenant_id::text));
  perform pg_advisory_xact_lock(18703,hashtext(p_challenge_id::text));
  request_hash:=encode(sha256(convert_to(jsonb_build_array('wallet',p_tenant_id,p_challenge_id,
    p_expected_customer_key,p_phone_hash,p_code_hash,p_ip_hash,p_payload_encrypted)::text,'UTF8')),'hex');
  select * into previous from public.loyalty_otp_challenges where id=p_challenge_id;
  if found then
    -- An exact retry of a committed issuance recovers it without a second SMS.
    if previous.tenant_id=p_tenant_id and previous.purpose='wallet'
      and previous.issuance_request_hash=request_hash and previous.issuance_ip_hash=p_ip_hash then
      return jsonb_build_object('ok',true,'challengeId',previous.id,'expiresAt',previous.issuance_expires_at);
    end if;
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  issued_time:=clock_timestamp();
  -- Every well-formed attempt counts, members or not, so probing numbers costs
  -- the same budget as using them. Saturated requests add no events.
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
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  insert into public.loyalty_wallet_issuance_events(tenant_id,phone_hash,ip_hash,created_at)
    values(p_tenant_id,p_phone_hash,p_ip_hash,issued_time);
  -- Only a number this store has stamps or rewards for is ever texted: the
  -- page cannot become a free SMS cannon aimed at arbitrary numbers. The
  -- caller answers the same either way.
  if not exists(select 1 from public.loyalty_balances where tenant_id=p_tenant_id
      and customer_key=p_expected_customer_key)
    and not exists(select 1 from public.loyalty_entitlements where tenant_id=p_tenant_id
      and customer_key=p_expected_customer_key) then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  -- Supersede only this phone's open WALLET codes; a reward code in flight is
  -- left alone. Challenge before outbox, ordered by id, as issuance does.
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
$$;
revoke all on function public.issue_loyalty_wallet_challenge(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.issue_loyalty_wallet_challenge(uuid,uuid,text,text,text,text,text) to service_role;

-- Call allow_loyalty_verification_attempt first, in its own transaction, as the
-- reward-claim verifier does: wallet and claim attempts share that budget.
create function public.verify_loyalty_wallet_challenge(
  p_tenant_id uuid, p_challenge_id uuid, p_candidate_code_hash text,
  p_session_token_hash text, p_expected_phone_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge public.loyalty_otp_challenges%rowtype;
  session public.loyalty_wallet_sessions%rowtype;
  verified_time timestamptz;
begin
  if p_tenant_id is null or p_challenge_id is null
    or p_candidate_code_hash is null or p_candidate_code_hash !~ '^[0-9a-f]{64}$'
    or p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_expected_phone_hash is null or p_expected_phone_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  select * into challenge from public.loyalty_otp_challenges
    where id=p_challenge_id and tenant_id=p_tenant_id for update;
  if not found or challenge.purpose<>'wallet' or challenge.entitlement_id is not null
    or challenge.attempts<0 or challenge.max_attempts not between 1 and 5
    or challenge.attempts>=challenge.max_attempts or challenge.verified_at is not null
    or challenge.expires_at<=clock_timestamp()
    or challenge.expires_at>challenge.created_at+interval '5 minutes'
    or challenge.created_at>clock_timestamp()
    or challenge.phone_hash is distinct from p_expected_phone_hash then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  if challenge.code_hash is distinct from p_candidate_code_hash then
    update public.loyalty_otp_challenges set attempts=attempts+1 where id=challenge.id;
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  verified_time:=clock_timestamp();
  update public.loyalty_otp_challenges set verified_at=verified_time where id=challenge.id;
  insert into public.loyalty_wallet_sessions(tenant_id,challenge_id,phone_hash,token_hash,created_at,expires_at)
    values(p_tenant_id,challenge.id,challenge.phone_hash,p_session_token_hash,verified_time,verified_time+interval '30 minutes')
    returning * into session;
  return jsonb_build_object('ok',true,'expiresAt',session.expires_at);
end;
$$;
revoke all on function public.verify_loyalty_wallet_challenge(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.verify_loyalty_wallet_challenge(uuid,uuid,text,text,text) to service_role;

-- A session is good for one store, one number, until it expires.
create function public.loyalty_wallet_session_valid(p_tenant_id uuid,p_token_hash text,p_phone_hash text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.loyalty_wallet_sessions
    where tenant_id=p_tenant_id and token_hash=p_token_hash and phone_hash=p_phone_hash
      and expires_at>clock_timestamp());
$$;
revoke all on function public.loyalty_wallet_session_valid(uuid,text,text) from public,anon,authenticated;
grant execute on function public.loyalty_wallet_session_valid(uuid,text,text) to service_role;

comment on function public.issue_loyalty_wallet_challenge(uuid,uuid,text,text,text,text,text) is
  'Trusted server only, READ COMMITTED. Same proof derivation as issue_loyalty_challenge (claim-crypto). Texts only numbers with a balance or reward at this store; answers request_denied otherwise. Limits: phone 60s cooldown, 3/15 minutes, 10/24 hours; IP 30/15 minutes, 100/24 hours; tenant 60/minute, 1000/hour.';

-- Rollback:
--   drop function public.loyalty_wallet_session_valid(uuid,text,text);
--   drop function public.verify_loyalty_wallet_challenge(uuid,uuid,text,text,text);
--   drop function public.issue_loyalty_wallet_challenge(uuid,uuid,text,text,text,text,text);
--   drop table public.loyalty_wallet_sessions;
--   drop table public.loyalty_wallet_issuance_events;
--   delete from public.loyalty_otp_challenges where purpose='wallet';
--   alter table public.loyalty_otp_challenges drop constraint loyalty_otp_challenges_wallet_has_no_reward;
--   alter table public.loyalty_otp_challenges drop constraint loyalty_otp_challenges_purpose_check;
--   alter table public.loyalty_otp_challenges add constraint loyalty_otp_challenges_purpose_check check (purpose in ('claim'));
--   drop table public.loyalty_store_settings;
