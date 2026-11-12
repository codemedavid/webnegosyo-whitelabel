-- Customer app sign-in (Phase 3): a customer of ONE store proves their PH
-- mobile with a 6-digit text code and gets an opaque app session.
--
-- The code rides the loyalty OTP path unchanged: a challenge row in
-- loyalty_otp_challenges (new purpose 'login'), one encrypted job in
-- loyalty_sms_outbox, delivered by the store's enrolled phone or, when it is
-- offline, the store's own Semaphore account. Nothing new is texted by the
-- platform itself.
--
-- What changes for delivery: until now the store's phone could only pick up
-- codes when loyalty is live (loyalty_sms_delivery_allowed: loyalty on, not
-- shadow, `loyalty_manage`). Sign-in codes are not a loyalty feature, so a
-- LOGIN job is allowed under the store's automated-text rule instead
-- (sms_outbox_delivery_allowed: enrolled device + the `customers` key) — a
-- store without a stamp card can still sign its customers in. Claim and
-- wallet jobs keep exactly the loyalty rule. Phone-side RPC bodies below are
-- the LIVE bodies (pg_get_functiondef, 2026-10-27) with only the gate changed.
--
-- Everything here is service-role only. The /api/app/v1 routes derive every
-- hash on the server (claim-crypto: HMAC with LOYALTY_HASH_KEY) and never
-- accept hashes from a client.

-- 1. Purposes -----------------------------------------------------------------

alter table public.loyalty_otp_challenges drop constraint if exists loyalty_otp_challenges_purpose_check;
alter table public.loyalty_otp_challenges
  add constraint loyalty_otp_challenges_purpose_check check (purpose = any (array['claim'::text, 'wallet'::text, 'login'::text]));

alter table public.loyalty_otp_challenges drop constraint if exists loyalty_otp_challenges_login_has_no_reward;
alter table public.loyalty_otp_challenges
  add constraint loyalty_otp_challenges_login_has_no_reward check (purpose <> 'login' or entitlement_id is null);

-- A customer who first appears by signing in to the store's app.
alter table public.customers drop constraint if exists customers_created_source_ck;
alter table public.customers
  add constraint customers_created_source_ck check (created_source = any (array['order'::text, 'manual'::text, 'import'::text, 'app'::text]));

-- 2. Issuance rate events (login's own, so sign-in never eats the reward-code
--    cooldown and vice versa) -------------------------------------------------

create table if not exists public.customer_login_issuance_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_login_issuance_phone_idx
  on public.customer_login_issuance_events (tenant_id, phone_hash, created_at desc);
create index if not exists customer_login_issuance_ip_idx
  on public.customer_login_issuance_events (ip_hash, created_at desc);
create index if not exists customer_login_issuance_tenant_idx
  on public.customer_login_issuance_events (tenant_id, created_at desc);

comment on table public.customer_login_issuance_events is
  'One row per customer-app sign-in code requested (before any check), for rate limits. Service role only.';

-- 3. App profiles + sessions ------------------------------------------------

-- The customer's app account for one store. The store's customer record
-- (public.customers, its orders and stamps) belongs to the store; deleting the
-- app account removes this row and every session, never the store's history.
create table if not exists public.customer_app_profiles (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_app_profiles_tenant_idx on public.customer_app_profiles (tenant_id);

comment on table public.customer_app_profiles is
  'A customer''s app account at one store (name the app shows). Service role only.';

create table if not exists public.customer_app_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  -- sha256 of the opaque `cs1.` token; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz not null default clock_timestamp(),
  -- Sliding 60 days, never past the absolute one-year end.
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint customer_app_sessions_window_ck check (
    expires_at <= absolute_expires_at
    and absolute_expires_at <= created_at + interval '366 days'
  )
);
create index if not exists customer_app_sessions_customer_idx
  on public.customer_app_sessions (tenant_id, customer_id) where revoked_at is null;

comment on table public.customer_app_sessions is
  'Customer-app sessions (opaque bearer tokens, hash only). Service role only.';

-- Every use of a store's App Review sign-in (allow-listed number + fixed code).
create table if not exists public.customer_app_review_logins (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('signed_in', 'refused')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_app_review_logins_tenant_idx
  on public.customer_app_review_logins (tenant_id, created_at desc);

comment on table public.customer_app_review_logins is
  'Audit of App Review sign-ins (no phone, no code). Service role only.';

-- App Review credentials per store app: a test number and a code hash
-- (HMAC with LOYALTY_HASH_KEY, label app-review-code). Honoured only while the
-- app is a draft.
alter table public.tenant_apps add column if not exists review_phone_e164 text
  check (review_phone_e164 is null or review_phone_e164 ~ '^[+]639[0-9]{9}$');
alter table public.tenant_apps add column if not exists review_code_hash text
  check (review_code_hash is null or review_code_hash ~ '^[0-9a-f]{64}$');

-- 4. Issue a sign-in code -----------------------------------------------------

create or replace function public.customer_login_issuance_retry_at(
  p_tenant_id uuid, p_phone_hash text, p_ip_hash text, p_now timestamptz
) returns timestamptz
language sql stable security definer set search_path to 'public'
as $$
  select max(nth.created_at+limits.span)
  from (values
    ('phone',interval '60 seconds',1),
    ('phone',interval '15 minutes',3),
    ('phone',interval '24 hours',10),
    ('ip',interval '15 minutes',30),
    ('ip',interval '24 hours',100),
    ('tenant',interval '1 minute',20),
    ('tenant',interval '1 hour',300),
    ('tenant',interval '24 hours',1000)
  ) as limits(scope,span,cap)
  cross join lateral (
    select e.created_at from public.customer_login_issuance_events e
    where case limits.scope
      when 'phone' then e.tenant_id=p_tenant_id and e.phone_hash=p_phone_hash
      when 'ip' then e.ip_hash=p_ip_hash
      else e.tenant_id=p_tenant_id end
    order by e.created_at desc offset limits.cap-1 limit 1
  ) as nth
  where nth.created_at>p_now-limits.span
$$;

-- The sign-in limits, in one place: null = allowed, else the rate_limited answer.
-- Used by the real issuer AND by the App Review number's request, so the
-- review number rate-limits exactly like any other (no side channel).
create or replace function public.customer_login_rate_limited(
  p_tenant_id uuid, p_phone_hash text, p_ip_hash text, p_now timestamptz
) returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  retry_at timestamptz;
begin
  if exists(select 1 from public.customer_login_issuance_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>p_now-interval '60 seconds')
    or (select count(*) from public.customer_login_issuance_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>p_now-interval '15 minutes')>=3
    or (select count(*) from public.customer_login_issuance_events where tenant_id=p_tenant_id
      and phone_hash=p_phone_hash and created_at>p_now-interval '24 hours')>=10
    or (select count(*) from public.customer_login_issuance_events where ip_hash=p_ip_hash
      and created_at>p_now-interval '15 minutes')>=30
    or (select count(*) from public.customer_login_issuance_events where ip_hash=p_ip_hash
      and created_at>p_now-interval '24 hours')>=100
    or (select count(*) from public.customer_login_issuance_events where tenant_id=p_tenant_id
      and created_at>p_now-interval '1 minute')>=20
    or (select count(*) from public.customer_login_issuance_events where tenant_id=p_tenant_id
      and created_at>p_now-interval '1 hour')>=300
    or (select count(*) from public.customer_login_issuance_events where tenant_id=p_tenant_id
      and created_at>p_now-interval '24 hours')>=1000 then
    retry_at:=public.customer_login_issuance_retry_at(p_tenant_id,p_phone_hash,p_ip_hash,p_now);
    return jsonb_build_object('ok',false,'error','rate_limited','retryAfterSeconds',
      greatest(1,least(86400,coalesce(ceil(extract(epoch from retry_at-p_now))::int,60))));
  end if;
  return null;
end;
$$;

-- The App Review number's "send me a code": no code, no text, but the same
-- limits and the same issuance event as a real request.
create or replace function public.note_customer_login_review_request(p_tenant_id uuid, p_phone_hash text, p_ip_hash text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  noted timestamptz := clock_timestamp();
  limited jsonb;
begin
  if p_tenant_id is null or p_phone_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  perform pg_advisory_xact_lock(18721,hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(18722,hashtext(p_tenant_id::text));
  limited := public.customer_login_rate_limited(p_tenant_id,p_phone_hash,p_ip_hash,noted);
  if limited is not null then return limited; end if;
  insert into public.customer_login_issuance_events(tenant_id,phone_hash,ip_hash,created_at)
    values(p_tenant_id,p_phone_hash,p_ip_hash,noted);
  return jsonb_build_object('ok',true);
end;
$$;

-- Copied from the live issue_loyalty_wallet_challenge. Changes: purpose
-- 'login'; no "must already be a member" check (anyone may sign in); its own
-- rate table with lower store caps (paid Semaphore sends are the store's
-- money) incl. a daily cap; its own advisory-lock keys; supersedes only open
-- LOGIN codes for the number.
create or replace function public.issue_customer_login_challenge(
  p_tenant_id uuid, p_challenge_id uuid, p_phone_hash text, p_code_hash text, p_ip_hash text, p_payload_encrypted text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  previous public.loyalty_otp_challenges%rowtype;
  request_hash text;
  ciphertext text;
  issued_time timestamptz;
  limited jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed'
    or p_tenant_id is null or p_challenge_id is null
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
  perform 1 from public.tenants where id=p_tenant_id;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform pg_advisory_xact_lock(18721,hashtext(p_ip_hash));
  perform pg_advisory_xact_lock(18722,hashtext(p_tenant_id::text));
  perform pg_advisory_xact_lock(18723,hashtext(p_challenge_id::text));
  request_hash:=encode(sha256(convert_to(jsonb_build_array('login',p_tenant_id,p_challenge_id,
    p_phone_hash,p_code_hash,p_ip_hash,p_payload_encrypted)::text,'UTF8')),'hex');
  select * into previous from public.loyalty_otp_challenges where id=p_challenge_id;
  if found then
    -- An uncertain commit retried with identical arguments: same answer, no second SMS.
    if previous.tenant_id=p_tenant_id and previous.purpose='login'
      and previous.issuance_request_hash=request_hash and previous.issuance_ip_hash=p_ip_hash then
      return jsonb_build_object('ok',true,'challengeId',previous.id,'expiresAt',previous.issuance_expires_at);
    end if;
    return jsonb_build_object('ok',false,'error','request_denied');
  end if;
  issued_time:=clock_timestamp();
  limited := public.customer_login_rate_limited(p_tenant_id,p_phone_hash,p_ip_hash,issued_time);
  if limited is not null then return limited; end if;
  insert into public.customer_login_issuance_events(tenant_id,phone_hash,ip_hash,created_at)
    values(p_tenant_id,p_phone_hash,p_ip_hash,issued_time);
  perform 1 from public.loyalty_otp_challenges where tenant_id=p_tenant_id
    and phone_hash=p_phone_hash and purpose='login' and verified_at is null order by id for update;
  perform 1 from public.loyalty_sms_outbox o join public.loyalty_otp_challenges c on c.id=o.challenge_id
    where c.tenant_id=p_tenant_id and c.phone_hash=p_phone_hash and c.purpose='login'
      and c.verified_at is null and o.status='queued' order by o.id for update of o;
  issued_time:=clock_timestamp();
  with superseded as (
    update public.loyalty_otp_challenges set expires_at=least(expires_at,issued_time)
      where tenant_id=p_tenant_id and phone_hash=p_phone_hash and purpose='login' and verified_at is null
      returning id
  ) update public.loyalty_sms_outbox set status='failed',error='superseded'
      where challenge_id in (select id from superseded) and status='queued';
  insert into public.loyalty_otp_challenges(id,tenant_id,purpose,entitlement_id,phone_hash,code_hash,issuance_ip_hash,
      issuance_request_hash,issuance_expires_at,created_at,expires_at,max_attempts)
    values(p_challenge_id,p_tenant_id,'login',null,p_phone_hash,p_code_hash,p_ip_hash,request_hash,
      issued_time+interval '5 minutes',issued_time,issued_time+interval '5 minutes',5);
  insert into public.loyalty_sms_outbox(tenant_id,challenge_id,transport,payload_encrypted)
    values(p_tenant_id,p_challenge_id,'android_sim',p_payload_encrypted);
  return jsonb_build_object('ok',true,'challengeId',p_challenge_id,'expiresAt',issued_time+interval '5 minutes');
end;
$$;

-- 5. Open a session (shared by code sign-in and App Review) -------------------

-- Not callable by anyone but the two functions below: finds or creates the
-- store's customer record for the number, the app profile, and the session.
create or replace function public.customer_app_open_session(
  p_tenant_id uuid, p_phone_e164 text, p_phone_hash text, p_session_token_hash text, p_opened_at timestamptz
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  customer_row public.customers%rowtype;
  profile_row public.customer_app_profiles%rowtype;
  is_new boolean := false;
  session_end timestamptz;
begin
  insert into public.customers(tenant_id,phone_e164,created_source)
    values(p_tenant_id,p_phone_e164,'app')
    on conflict (tenant_id,phone_e164) where phone_e164 is not null do nothing;
  select * into customer_row from public.customers where tenant_id=p_tenant_id and phone_e164=p_phone_e164;
  if not found then return jsonb_build_object('ok',false,'error','unavailable'); end if;
  insert into public.customer_app_profiles(customer_id,tenant_id,display_name,created_at,updated_at)
    values(customer_row.id,p_tenant_id,null,p_opened_at,p_opened_at)
    on conflict (customer_id) do nothing
    returning * into profile_row;
  if profile_row.customer_id is not null then
    is_new := true;
  else
    select * into profile_row from public.customer_app_profiles where customer_id=customer_row.id;
  end if;
  session_end := p_opened_at+interval '365 days';
  insert into public.customer_app_sessions(tenant_id,customer_id,phone_hash,token_hash,created_at,last_used_at,
      expires_at,absolute_expires_at)
    values(p_tenant_id,customer_row.id,p_phone_hash,p_session_token_hash,p_opened_at,p_opened_at,
      least(p_opened_at+interval '60 days',session_end),session_end);
  return jsonb_build_object('ok',true,'customerId',customer_row.id,'isNewCustomer',is_new,
    'name',coalesce(profile_row.display_name,customer_row.name),'phoneE164',customer_row.phone_e164);
end;
$$;

-- Copied from the live verify_loyalty_wallet_challenge. Changes: purpose
-- 'login'; on success opens an app session (customer + profile + session) in
-- the same transaction instead of a 30-minute wallet session. The server calls
-- allow_loyalty_verification_attempt first, in its own transaction, so every
-- wrong guess spends the number's shared guessing budget.
create or replace function public.verify_customer_login_challenge(
  p_tenant_id uuid, p_challenge_id uuid, p_candidate_code_hash text, p_session_token_hash text,
  p_expected_phone_hash text, p_phone_e164 text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  challenge public.loyalty_otp_challenges%rowtype;
  verified_time timestamptz;
begin
  if p_tenant_id is null or p_challenge_id is null
    or p_candidate_code_hash is null or p_candidate_code_hash !~ '^[0-9a-f]{64}$'
    or p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_expected_phone_hash is null or p_expected_phone_hash !~ '^[0-9a-f]{64}$'
    or p_phone_e164 is null or p_phone_e164 !~ '^[+]639[0-9]{9}$' then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  select * into challenge from public.loyalty_otp_challenges
    where id=p_challenge_id and tenant_id=p_tenant_id for update;
  if not found or challenge.purpose<>'login' or challenge.entitlement_id is not null
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
  return public.customer_app_open_session(p_tenant_id,p_phone_e164,challenge.phone_hash,p_session_token_hash,verified_time);
end;
$$;

-- App Review: the store's allow-listed number and code (hash checked by the
-- server) open a session without a text, only while the app is a draft.
-- Every attempt is logged.
create or replace function public.open_customer_app_review_session(
  p_tenant_id uuid, p_phone_e164 text, p_phone_hash text, p_candidate_code_hash text,
  p_session_token_hash text, p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  app public.tenant_apps%rowtype;
begin
  if p_tenant_id is null or p_phone_e164 is null or p_phone_e164 !~ '^[+]639[0-9]{9}$'
    or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_candidate_code_hash is null or p_candidate_code_hash !~ '^[0-9a-f]{64}$'
    or p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  select * into app from public.tenant_apps where tenant_id=p_tenant_id;
  -- Lockout: 5 refused review sign-ins in an hour close the review door for
  -- this store for that hour (a 6-digit code cannot be guessed at 5/hour).
  if (select count(*) from public.customer_app_review_logins where tenant_id=p_tenant_id
      and outcome='refused' and created_at>clock_timestamp()-interval '1 hour')>=5 then
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  if not found or app.status<>'draft' or app.review_phone_e164 is distinct from p_phone_e164
    or app.review_code_hash is null or app.review_code_hash is distinct from p_candidate_code_hash then
    if found and app.review_phone_e164 is not distinct from p_phone_e164 then
      insert into public.customer_app_review_logins(tenant_id,ip_hash,outcome) values(p_tenant_id,p_ip_hash,'refused');
    end if;
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  insert into public.customer_app_review_logins(tenant_id,ip_hash,outcome) values(p_tenant_id,p_ip_hash,'signed_in');
  return public.customer_app_open_session(p_tenant_id,p_phone_e164,p_phone_hash,p_session_token_hash,clock_timestamp());
end;
$$;

-- 6. Sessions -----------------------------------------------------------------

-- A live session for this store: slides its 60-day window (never past the
-- absolute end) at most every 10 minutes, so each request is not a write.
create or replace function public.touch_customer_app_session(p_tenant_id uuid, p_token_hash text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  session public.customer_app_sessions%rowtype;
  touched timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false);
  end if;
  select * into session from public.customer_app_sessions where token_hash=p_token_hash and tenant_id=p_tenant_id;
  if not found or session.revoked_at is not null or session.expires_at<=touched
    or session.absolute_expires_at<=touched then
    return jsonb_build_object('ok',false);
  end if;
  if session.last_used_at<touched-interval '10 minutes' then
    update public.customer_app_sessions
      set last_used_at=touched, expires_at=least(touched+interval '60 days',absolute_expires_at)
      where id=session.id
      returning * into session;
  end if;
  return jsonb_build_object('ok',true,'customerId',session.customer_id,'phoneHash',session.phone_hash,
    'expiresAt',session.expires_at);
end;
$$;

create or replace function public.revoke_customer_app_session(p_tenant_id uuid, p_token_hash text)
returns jsonb
language sql security definer set search_path to 'public'
as $$
  with revoked as (
    update public.customer_app_sessions set revoked_at=coalesce(revoked_at,clock_timestamp())
      where tenant_id=p_tenant_id and token_hash=p_token_hash
      returning id
  ) select jsonb_build_object('ok',true,'revoked',(select count(*) from revoked));
$$;

create or replace function public.revoke_customer_app_sessions_for_customer(p_tenant_id uuid, p_customer_id uuid)
returns jsonb
language sql security definer set search_path to 'public'
as $$
  with revoked as (
    update public.customer_app_sessions set revoked_at=clock_timestamp()
      where tenant_id=p_tenant_id and customer_id=p_customer_id and revoked_at is null
      returning id
  ) select jsonb_build_object('ok',true,'revoked',(select count(*) from revoked));
$$;

-- Apple 5.1.1(v) in-app account deletion. Removed: every session (rows, not
-- just revoked), the app profile, open sign-in codes for the number (their
-- queued texts cascade), and the store's customer record IF the app created
-- it and nothing of the store's refers to it (no order, stamp balance or
-- text). Kept: anything the store already holds about this customer — its
-- orders, stamps and the customer record those point at.
create or replace function public.delete_customer_app_account(p_tenant_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  customer_row public.customers%rowtype;
  removed_profile int;
  removed_customer int := 0;
begin
  select * into customer_row from public.customers where id=p_customer_id and tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  delete from public.loyalty_otp_challenges c
    where c.tenant_id=p_tenant_id and c.purpose='login' and c.verified_at is null
      and c.phone_hash in (select s.phone_hash from public.customer_app_sessions s
        where s.tenant_id=p_tenant_id and s.customer_id=p_customer_id);
  delete from public.customer_app_sessions where tenant_id=p_tenant_id and customer_id=p_customer_id;
  delete from public.customer_app_profiles where tenant_id=p_tenant_id and customer_id=p_customer_id;
  get diagnostics removed_profile = row_count;
  if customer_row.created_source='app'
    and not exists(select 1 from public.orders where customer_id=p_customer_id)
    and not exists(select 1 from public.loyalty_balances where customer_id=p_customer_id)
    and not exists(select 1 from public.sms_sends where customer_id=p_customer_id) then
    delete from public.customers where id=p_customer_id;
    get diagnostics removed_customer = row_count;
  end if;
  return jsonb_build_object('ok',true,'removedProfile',removed_profile,'removedCustomer',removed_customer);
end;
$$;

-- 7. Phone-side delivery gate by purpose ----------------------------------------

-- Login jobs: an enrolled device + the `customers` key (the automated-text
-- rule). Claim and wallet jobs: the loyalty rule, unchanged. An unknown
-- purpose (no such job) is allowed if either rule holds; the caller then finds
-- no job and refuses.
create or replace function public.loyalty_sms_job_delivery_allowed(
  p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text, p_purpose text
) returns boolean
language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_purpose='login' then
    return public.sms_outbox_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash);
  elsif p_purpose in ('claim','wallet') then
    return public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash);
  end if;
  return public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash)
    or public.sms_outbox_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash);
end;
$$;

-- LIVE body; changed: the gate is evaluated per rule, and only jobs whose
-- purpose the phone may send are offered (the held job too).
create or replace function public.claim_loyalty_sms_job(p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  candidate record;
  challenge public.loyalty_otp_challenges%rowtype;
  job public.loyalty_sms_outbox%rowtype;
  current_job uuid;
  claimed_time timestamptz;
  can_loyalty boolean;
  can_login boolean;
begin
  can_loyalty:=public.loyalty_sms_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash);
  can_login:=public.sms_outbox_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash);
  if not can_loyalty and not can_login then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform pg_advisory_xact_lock(18704,hashtext(p_device_id::text));
  -- Heartbeat: an authorized poll proves this phone can send right now.
  -- Throttled so a 5-second poll is not a 5-second write.
  insert into public.loyalty_sms_device_heartbeats as h(device_id,tenant_id,last_seen_at)
    values(p_device_id,p_tenant_id,clock_timestamp())
    on conflict (device_id) do update set last_seen_at=excluded.last_seen_at,tenant_id=excluded.tenant_id
    where h.last_seen_at<clock_timestamp()-interval '10 seconds';
  select o.id into current_job from public.loyalty_sms_outbox o
    join public.loyalty_otp_challenges c on c.id=o.challenge_id and c.tenant_id=p_tenant_id
    where o.tenant_id=p_tenant_id
    and o.claimed_by_device=p_device_id::text and o.status='claimed'
    and (o.lease_expires_at>clock_timestamp() or o.dispatch_started_at is not null)
    and (case when c.purpose='login' then can_login else can_loyalty end)
    order by o.id limit 1;
  -- Filter dead OTP history before bounding work. If the oldest 25 live
  -- candidates are locked, return no_job and let the device poll later.
  for candidate in select o.id,o.challenge_id from public.loyalty_sms_outbox o
    join public.loyalty_otp_challenges c on c.id=o.challenge_id and c.tenant_id=p_tenant_id
    where o.tenant_id=p_tenant_id and o.transport='android_sim'
      and c.expires_at>clock_timestamp() and c.verified_at is null
      and c.attempts>=0 and c.max_attempts between 1 and 5 and c.attempts<c.max_attempts
      and (case when c.purpose='login' then can_login else can_loyalty end)
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
$function$;

-- LIVE body; changed: the gate follows the job's purpose, and the grant says
-- which purpose it is so the server words the SMS ("reward code" / "sign-in code").
create or replace function public.authorize_loyalty_sms_dispatch(p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text, p_job_id uuid, p_lease_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  challenge public.loyalty_otp_challenges%rowtype;
  job public.loyalty_sms_outbox%rowtype;
  challenge_id uuid;
  job_purpose text;
  dispatch_time timestamptz;
begin
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  select c.purpose into job_purpose from public.loyalty_otp_challenges c
    where c.id=challenge_id and c.tenant_id=p_tenant_id;
  if not public.loyalty_sms_job_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash,job_purpose) then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into challenge from public.loyalty_otp_challenges c where c.id=challenge_id
    and c.tenant_id=p_tenant_id for update;
  if not found or challenge.purpose is distinct from job_purpose then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
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
    'payloadEncrypted',job.payload_encrypted,'purpose',challenge.purpose);
end;
$function$;

-- LIVE body; changed: the gate follows the job's purpose.
create or replace function public.finish_loyalty_sms_job(p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text, p_job_id uuid, p_lease_token uuid, p_outcome text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  job public.loyalty_sms_outbox%rowtype;
  challenge_id uuid;
  job_purpose text;
begin
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  select c.purpose into job_purpose from public.loyalty_otp_challenges c
    where c.id=challenge_id and c.tenant_id=p_tenant_id;
  if not public.loyalty_sms_job_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash,job_purpose) then
    return jsonb_build_object('ok',false,'error','device_denied'); end if;
  if p_outcome is null or p_outcome not in ('sent','failed') then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
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
  update public.loyalty_sms_outbox set status=p_outcome,
    sent_at=case when p_outcome='sent' then clock_timestamp() else null end,
    error=case when p_outcome='failed' then 'delivery_failed' else null end where id=job.id;
  return jsonb_build_object('ok',true);
end;
$function$;

-- LIVE body; changed: the gate follows the job's purpose.
create or replace function public.recover_loyalty_sms_ack(p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text, p_job_id uuid, p_lease_token uuid, p_outcome text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  challenge_id uuid;
  job_purpose text;
  job public.loyalty_sms_outbox%rowtype;
begin
  select o.challenge_id into challenge_id from public.loyalty_sms_outbox o
    where o.id=p_job_id and o.tenant_id=p_tenant_id;
  select c.purpose into job_purpose from public.loyalty_otp_challenges c
    where c.id=challenge_id and c.tenant_id=p_tenant_id;
  if not public.loyalty_sms_job_delivery_allowed(p_tenant_id,p_actor_id,p_device_id,p_credential_hash,job_purpose) then
    return jsonb_build_object('ok',false,'error','device_denied'); end if;
  if p_lease_token is null or p_outcome is null or p_outcome not in ('sent','failed') then
    return jsonb_build_object('ok',false,'error','request_denied'); end if;
  perform 1 from public.loyalty_otp_challenges c where c.id=challenge_id
    and c.tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  select * into job from public.loyalty_sms_outbox where id=p_job_id and tenant_id=p_tenant_id for update;
  if job.id is null or job.challenge_id is distinct from challenge_id or job.transport<>'android_sim'
    or job.lease_token is null then return jsonb_build_object('ok',false,'error','request_denied'); end if;
  if job.lease_token<>p_lease_token then
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
$function$;

-- (abandon_loyalty_sms_dispatch is owner-only and purpose-agnostic: unchanged.)

-- 8. Grants: service role only ------------------------------------------------

alter table public.customer_login_issuance_events enable row level security;
alter table public.customer_app_profiles enable row level security;
alter table public.customer_app_sessions enable row level security;
alter table public.customer_app_review_logins enable row level security;
revoke all on public.customer_login_issuance_events from anon, authenticated;
revoke all on public.customer_app_profiles from anon, authenticated;
revoke all on public.customer_app_sessions from anon, authenticated;
revoke all on public.customer_app_review_logins from anon, authenticated;
grant all on public.customer_login_issuance_events to service_role;
grant all on public.customer_app_profiles to service_role;
grant all on public.customer_app_sessions to service_role;
grant all on public.customer_app_review_logins to service_role;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.customer_login_issuance_retry_at(uuid, text, text, timestamptz)',
    'public.customer_login_rate_limited(uuid, text, text, timestamptz)',
    'public.note_customer_login_review_request(uuid, text, text)',
    'public.issue_customer_login_challenge(uuid, uuid, text, text, text, text)',
    'public.customer_app_open_session(uuid, text, text, text, timestamptz)',
    'public.verify_customer_login_challenge(uuid, uuid, text, text, text, text)',
    'public.open_customer_app_review_session(uuid, text, text, text, text, text)',
    'public.touch_customer_app_session(uuid, text)',
    'public.revoke_customer_app_session(uuid, text)',
    'public.revoke_customer_app_sessions_for_customer(uuid, uuid)',
    'public.delete_customer_app_account(uuid, uuid)',
    'public.claim_loyalty_sms_job(uuid, uuid, uuid, text)',
    'public.authorize_loyalty_sms_dispatch(uuid, uuid, uuid, text, uuid, uuid)',
    'public.finish_loyalty_sms_job(uuid, uuid, uuid, text, uuid, uuid, text)',
    'public.recover_loyalty_sms_ack(uuid, uuid, uuid, text, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
-- Internal steps, like the live loyalty_sms_delivery_allowed: callable only by
-- the definer functions above, never through the API.
revoke execute on function public.customer_app_open_session(uuid, text, text, text, timestamptz) from service_role;
revoke all on function public.loyalty_sms_job_delivery_allowed(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;

-- Rollback (restore the four phone-side RPCs from the live bodies they were
-- copied from — 20261004120000 / 20260909120000 — before dropping the gate):
--   drop function if exists public.open_customer_app_review_session(uuid, text, text, text, text, text);
--   drop function if exists public.verify_customer_login_challenge(uuid, uuid, text, text, text, text);
--   drop function if exists public.customer_app_open_session(uuid, text, text, text, timestamptz);
--   drop function if exists public.issue_customer_login_challenge(uuid, uuid, text, text, text, text);
--   drop function if exists public.note_customer_login_review_request(uuid, text, text);
--   drop function if exists public.customer_login_rate_limited(uuid, text, text, timestamptz);
--   drop function if exists public.customer_login_issuance_retry_at(uuid, text, text, timestamptz);
--   drop function if exists public.touch_customer_app_session(uuid, text);
--   drop function if exists public.revoke_customer_app_session(uuid, text);
--   drop function if exists public.revoke_customer_app_sessions_for_customer(uuid, uuid);
--   drop function if exists public.delete_customer_app_account(uuid, uuid);
--   drop table if exists public.customer_app_review_logins, public.customer_app_sessions,
--     public.customer_app_profiles, public.customer_login_issuance_events;
--   alter table public.tenant_apps drop column if exists review_phone_e164, drop column if exists review_code_hash;
--   (purpose/created_source checks: re-add without 'login' / 'app' once no such rows exist)
