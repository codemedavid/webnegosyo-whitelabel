// Customer-app sign-in (Phase 3) over PGlite: the REAL migration
// 20261026160000_customer_app_auth.sql (plus 20261026150000_tenant_apps.sql)
// on a base schema copied from the live platform database (table shapes and
// helper bodies read with pg_get_functiondef on 2026-10-27).
//   node tests/sql/run-customer-app-auth.cjs
// `--baseline` skips the migration under test and MUST fail.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const PAYLOAD = 'v1.AAAAAAAAAAAAAAAA.AAAA.AAAAAAAAAAAAAAAAAAAAAA'
const hex = (label) => createHash('sha256').update(String(label)).digest('hex')

// --- Live base schema (shapes as on the platform DB) -------------------------
const BASE = `
create table public.tenants(id uuid primary key, name text, loyalty_enabled boolean not null default false,
  loyalty_shadow boolean not null default true);
create table public.app_users(user_id uuid primary key, tenant_id uuid, role text, is_owner boolean, permissions text[]);
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create table public.customers(id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text, email text, name text, order_count integer not null default 0, total_spent numeric(12,2) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_source text not null default 'order',
  constraint customers_created_source_ck check (created_source = any (array['order','manual','import'])),
  constraint customers_identity_ck check (phone_e164 is not null or email is not null));
create unique index customers_tenant_phone_uq on public.customers(tenant_id, phone_e164) where phone_e164 is not null;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create table public.loyalty_entitlements(id uuid primary key);
create table public.orders(id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete set null);
create table public.loyalty_balances(id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete set null);
create table public.sms_sends(id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete set null);
create table public.loyalty_otp_challenges(id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade, phone_hash text not null, code_hash text not null,
  purpose text not null default 'claim', entitlement_id uuid references public.loyalty_entitlements(id) on delete cascade,
  attempts integer not null default 0, max_attempts integer not null default 5, expires_at timestamptz not null,
  verified_at timestamptz, created_at timestamptz not null default now(),
  issuance_ip_hash text check (issuance_ip_hash ~ '^[0-9a-f]{64}$'),
  issuance_request_hash text check (issuance_request_hash ~ '^[0-9a-f]{64}$'), issuance_expires_at timestamptz,
  constraint loyalty_otp_challenges_purpose_check check (purpose = any (array['claim','wallet'])),
  constraint loyalty_otp_challenges_wallet_has_no_reward check (purpose <> 'wallet' or entitlement_id is null));
create table public.loyalty_sms_outbox(id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  challenge_id uuid not null references public.loyalty_otp_challenges(id) on delete cascade,
  transport text not null default 'android_sim' check (transport = any (array['android_sim','semaphore'])),
  payload_encrypted text not null, status text not null default 'queued' check (status = any (array['queued','claimed','sent','failed'])),
  claimed_by_device text, claimed_at timestamptz, sent_at timestamptz, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  claimed_by_actor uuid references auth.users(id), lease_token uuid, lease_expires_at timestamptz, dispatch_started_at timestamptz);
create table public.loyalty_sms_devices(device_id uuid primary key, tenant_id uuid not null, actor_id uuid not null,
  credential_hash text not null, enabled boolean not null default true);
create table public.loyalty_sms_device_heartbeats(device_id uuid primary key, tenant_id uuid not null, last_seen_at timestamptz not null);
create table public.loyalty_verification_rate_events(id bigint generated always as identity primary key, tenant_id uuid not null,
  phone_hash text not null, ip_hash text not null, created_at timestamptz not null default clock_timestamp());
create table public.loyalty_wallet_sessions(id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  challenge_id uuid not null, phone_hash text not null, token_hash text not null,
  created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null);

-- LIVE bodies, verbatim.
CREATE OR REPLACE FUNCTION public.loyalty_sms_delivery_allowed(p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.sms_outbox_delivery_allowed(p_tenant_id uuid, p_actor_id uuid, p_device_id uuid, p_credential_hash text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if current_setting('transaction_isolation')<>'read committed' or p_tenant_id is null
    or p_device_id is null or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$' then
    return false; end if;
  perform 1 from public.loyalty_sms_devices where device_id=p_device_id and tenant_id=p_tenant_id
    and actor_id=p_actor_id and credential_hash=p_credential_hash and enabled is true for share;
  if not found then return false; end if;
  perform 1 from public.app_users where user_id=p_actor_id
    and (role='superadmin' or (role='admin' and tenant_id=p_tenant_id
      and (is_owner is true or permissions is null or 'customers'=any(permissions)))) for share;
  return found;
end;
$function$;
CREATE OR REPLACE FUNCTION public.verify_loyalty_wallet_challenge(p_tenant_id uuid, p_challenge_id uuid, p_candidate_code_hash text, p_session_token_hash text, p_expected_phone_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
$function$;
`

async function main() {
  const db = new PGlite()
  const LOYALTY_STORE = randomUUID() // stamp card live
  const PLAIN_STORE = randomUUID() // no stamp card
  const OWNER = randomUUID() // owner of PLAIN_STORE
  const CUSTOMERS_STAFF = randomUUID() // LOYALTY_STORE staff with `customers` only
  const LOYALTY_STAFF = randomUUID() // LOYALTY_STORE staff with `loyalty_manage` only
  const DEVICE_PLAIN = randomUUID(), DEVICE_CUST = randomUUID(), DEVICE_LOYAL = randomUUID()
  const CRED = hex('credential')
  const PHONE = '+639171234567', PHONE_HASH = hex('phone-a')
  const call = async (name, args) =>
    (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result
  let ipSeq = 0
  const nextIp = () => hex(`ip-${++ipSeq}`)

  try {
    await installPlatformAuth(db)
    await db.exec(BASE)
    await db.query(`insert into auth.users values ($1),($2),($3)`, [OWNER, CUSTOMERS_STAFF, LOYALTY_STAFF])
    await db.query(`insert into public.tenants(id,name,loyalty_enabled,loyalty_shadow) values ($1,'Loyal Cafe',true,false),($2,'Plain Cafe',false,true)`, [LOYALTY_STORE, PLAIN_STORE])
    await db.query(`insert into public.app_users values ($1,$2,'admin',true,null),($3,$4,'admin',false,array['customers']),($5,$4,'admin',false,array['loyalty_manage'])`,
      [OWNER, PLAIN_STORE, CUSTOMERS_STAFF, LOYALTY_STORE, LOYALTY_STAFF])
    await db.query(`insert into public.loyalty_sms_devices values ($1,$2,$3,$4,true),($5,$6,$7,$4,true),($8,$6,$9,$4,true)`,
      [DEVICE_PLAIN, PLAIN_STORE, OWNER, CRED, DEVICE_CUST, LOYALTY_STORE, CUSTOMERS_STAFF, DEVICE_LOYAL, LOYALTY_STAFF])
    await db.exec(readMigration('20261026150000_tenant_apps.sql'))
    if (!process.argv.includes('--baseline')) await db.exec(readMigration('20261026160000_customer_app_auth.sql'))
    await as(db, 'service_role', null)

    const issue = (o = {}) => {
      const a = { tenant: PLAIN_STORE, challenge: randomUUID(), phone: PHONE_HASH, code: hex('code-1'), ip: nextIp(), payload: PAYLOAD, ...o }
      return call('issue_customer_login_challenge', [a.tenant, a.challenge, a.phone, a.code, a.ip, a.payload]).then((r) => ({ r, a }))
    }
    const verify = (challenge, o = {}) => {
      const a = { tenant: PLAIN_STORE, code: hex('code-1'), token: hex(randomUUID()), phoneHash: PHONE_HASH, phone: PHONE, ...o }
      return call('verify_customer_login_challenge', [a.tenant, challenge, a.code, a.token, a.phoneHash, a.phone]).then((r) => ({ r, token: a.token }))
    }
    const clearRates = async () => {
      await reset(db)
      await db.exec('delete from public.customer_login_issuance_events')
      await as(db, 'service_role', null)
    }
    const invalid = { ok: false, error: 'invalid_code' }

    // 1. Anyone may ask for a code (no membership check); one phone job queued.
    const first = await issue()
    assert.equal(first.r.ok, true, JSON.stringify(first.r))
    const row = (await db.query('select purpose, entitlement_id, max_attempts from public.loyalty_otp_challenges where id=$1', [first.a.challenge])).rows[0]
    assert.deepEqual(row, { purpose: 'login', entitlement_id: null, max_attempts: 5 })
    assert.deepEqual((await db.query('select transport, status from public.loyalty_sms_outbox where challenge_id=$1', [first.a.challenge])).rows,
      [{ transport: 'android_sim', status: 'queued' }])
    // Exact retry: same answer, no second SMS. A changed retry is refused.
    const again = await call('issue_customer_login_challenge', [PLAIN_STORE, first.a.challenge, PHONE_HASH, hex('code-1'), first.a.ip, PAYLOAD])
    assert.equal(again.ok, true)
    assert.equal(Number((await db.query('select count(*) n from public.loyalty_sms_outbox where challenge_id=$1', [first.a.challenge])).rows[0].n), 1)
    assert.deepEqual(await call('issue_customer_login_challenge', [PLAIN_STORE, first.a.challenge, PHONE_HASH, hex('code-2'), first.a.ip, PAYLOAD]),
      { ok: false, error: 'request_denied' })
    assert.deepEqual((await issue({ tenant: randomUUID() })).r, { ok: false, error: 'request_denied' }, 'unknown store')

    // 2. Rate limits: phone 1/60s, 3/15min, 10/24h; IP 30/15min, 100/24h; store 20/min, 300/h, 1000/24h.
    const limited = (await issue()).r
    assert.equal(limited.error, 'rate_limited', '60-second cooldown')
    assert.ok(limited.retryAfterSeconds >= 1 && limited.retryAfterSeconds <= 60, JSON.stringify(limited))
    const seed = async (rows) => {
      await reset(db)
      for (const [tenant, phone, ip, ago] of rows) {
        await db.query(`insert into public.customer_login_issuance_events(tenant_id,phone_hash,ip_hash,created_at) values($1,$2,$3,clock_timestamp()-$4::interval)`, [tenant, phone, ip, ago])
      }
      await as(db, 'service_role', null)
    }
    const expectLimited = async (rows, o, label) => {
      await clearRates()
      await seed(rows)
      assert.equal((await issue(o)).r.error, 'rate_limited', label)
    }
    const many = (n, make) => Array.from({ length: n }, (_, i) => make(i))
    await expectLimited(many(3, (i) => [PLAIN_STORE, PHONE_HASH, hex(`x${i}`), `${2 + i} minutes`]), {}, 'phone 3/15min')
    await expectLimited(many(10, (i) => [PLAIN_STORE, PHONE_HASH, hex(`y${i}`), `${1 + i} hours`]), {}, 'phone 10/24h')
    const sharedIp = hex('shared-ip')
    await expectLimited(many(30, (i) => [PLAIN_STORE, hex(`p${i}`), sharedIp, `${i % 14 + 1} minutes`]), { ip: sharedIp, phone: hex('fresh-1') }, 'IP 30/15min')
    await expectLimited(many(100, (i) => [PLAIN_STORE, hex(`q${i}`), sharedIp, `${i % 23 + 1} hours`]), { ip: sharedIp, phone: hex('fresh-2') }, 'IP 100/24h')
    await expectLimited(many(20, (i) => [PLAIN_STORE, hex(`r${i}`), hex(`ri${i}`), '10 seconds']), { phone: hex('fresh-3') }, 'store 20/min')
    await expectLimited(many(300, (i) => [PLAIN_STORE, hex(`s${i}`), hex(`si${i}`), `${2 + (i % 50)} minutes`]), { phone: hex('fresh-4') }, 'store 300/h')
    await expectLimited(many(1000, (i) => [PLAIN_STORE, hex(`t${i}`), hex(`ti${i}`), `${2 + (i % 20)} hours`]), { phone: hex('fresh-5') }, 'store 1000/24h')
    // Login limits are their own: the other store is unaffected.
    await clearRates()
    assert.equal((await issue({ tenant: LOYALTY_STORE, phone: hex('other-store') })).r.ok, true, 'other store unaffected')

    // 3. Verify: wrong code ×5 burns the challenge; right code opens a session.
    await clearRates()
    const burn = await issue({ phone: hex('burn') })
    for (let i = 0; i < 5; i++) assert.deepEqual((await verify(burn.a.challenge, { code: hex('wrong'), phoneHash: hex('burn') })).r, invalid)
    assert.deepEqual((await verify(burn.a.challenge, { phoneHash: hex('burn') })).r, invalid, 'locked after 5 wrong codes')
    assert.deepEqual((await verify(first.a.challenge, { phoneHash: hex('someone-else') })).r, invalid, 'phone must match')
    const ok = await verify(first.a.challenge)
    assert.equal(ok.r.ok, true, JSON.stringify(ok.r))
    assert.equal(ok.r.isNewCustomer, true)
    assert.equal(ok.r.phoneE164, PHONE)
    const customer = (await db.query('select id, created_source from public.customers where tenant_id=$1 and phone_e164=$2', [PLAIN_STORE, PHONE])).rows[0]
    assert.deepEqual(customer, { id: ok.r.customerId, created_source: 'app' })
    assert.deepEqual((await verify(first.a.challenge)).r, invalid, 'a code works once')
    // Expired codes never verify.
    await clearRates()
    const old = await issue({ phone: hex('old') })
    await reset(db)
    await db.query(`update public.loyalty_otp_challenges set created_at=clock_timestamp()-interval '6 minutes', expires_at=clock_timestamp()-interval '1 minute' where id=$1`, [old.a.challenge])
    await as(db, 'service_role', null)
    assert.deepEqual((await verify(old.a.challenge, { phoneHash: hex('old') })).r, invalid, 'expired')
    // A second sign-in for a known customer is not "new"; an order-made customer is reused.
    await clearRates()
    const second = await issue({ phone: PHONE_HASH, code: hex('code-3') })
    const back = await verify(second.a.challenge, { code: hex('code-3') })
    assert.equal(back.r.ok, true)
    assert.equal(back.r.isNewCustomer, false)
    assert.equal(back.r.customerId, ok.r.customerId)
    await reset(db)
    await db.query(`insert into public.customers(tenant_id,phone_e164,name,created_source) values($1,'+639170000001','Ana','order')`, [PLAIN_STORE])
    await as(db, 'service_role', null)
    await clearRates()
    const ana = await issue({ phone: hex('ana'), code: hex('code-ana') })
    const anaIn = await verify(ana.a.challenge, { phoneHash: hex('ana'), phone: '+639170000001', code: hex('code-ana') })
    assert.equal(anaIn.r.ok, true)
    assert.equal(anaIn.r.name, 'Ana', 'store record name shows until the app profile has its own')
    assert.equal(Number((await db.query(`select count(*) n from public.customers where phone_e164='+639170000001'`)).rows[0].n), 1)

    // 4. Purpose isolation: a login code is not a wallet code and back.
    await clearRates()
    const loginCode = await issue({ phone: hex('iso') })
    assert.deepEqual(await call('verify_loyalty_wallet_challenge', [PLAIN_STORE, loginCode.a.challenge, hex('code-1'), hex('wallet-token'), hex('iso')]), invalid)
    const walletChallenge = randomUUID()
    await reset(db)
    await db.query(`insert into public.loyalty_otp_challenges(id,tenant_id,purpose,phone_hash,code_hash,expires_at) values($1,$2,'wallet',$3,$4,clock_timestamp()+interval '4 minutes')`,
      [walletChallenge, PLAIN_STORE, hex('iso'), hex('code-1')])
    await as(db, 'service_role', null)
    assert.deepEqual((await verify(walletChallenge, { phoneHash: hex('iso') })).r, invalid, 'wallet code cannot sign in')
    await reset(db)
    await db.exec(`insert into public.loyalty_entitlements values ('00000000-0000-4000-8000-00000000e001')`)
    await assert.rejects(db.query(`insert into public.loyalty_otp_challenges(tenant_id,purpose,entitlement_id,phone_hash,code_hash,expires_at)
      values($1,'login','00000000-0000-4000-8000-00000000e001',$2,$2,now())`, [PLAIN_STORE, hex('x')]), /login_has_no_reward/)
    await as(db, 'service_role', null)

    // 5. Sessions: touch slides (never past absolute), revoke ends it, other store's token refused.
    const touched = await call('touch_customer_app_session', [PLAIN_STORE, ok.token])
    assert.equal(touched.ok, true)
    assert.equal(touched.customerId, ok.r.customerId)
    assert.equal((await call('touch_customer_app_session', [LOYALTY_STORE, ok.token])).ok, false, 'bound to its store')
    await reset(db)
    await db.query(`update public.customer_app_sessions set last_used_at=clock_timestamp()-interval '30 days', expires_at=clock_timestamp()+interval '30 days' where token_hash=$1`, [ok.token])
    await as(db, 'service_role', null)
    const slid = await call('touch_customer_app_session', [PLAIN_STORE, ok.token])
    assert.ok(new Date(slid.expiresAt) > new Date(Date.now() + 59 * 86400e3), 'slid to 60 days')
    await reset(db)
    await db.query(`update public.customer_app_sessions set created_at=clock_timestamp()-interval '364 days', absolute_expires_at=clock_timestamp()+interval '1 day',
      last_used_at=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()+interval '1 day' where token_hash=$1`, [ok.token])
    await as(db, 'service_role', null)
    const capped = await call('touch_customer_app_session', [PLAIN_STORE, ok.token])
    assert.ok(new Date(capped.expiresAt) <= new Date(Date.now() + 86400e3 + 5e3), 'never past the absolute end')
    await reset(db)
    await db.query(`update public.customer_app_sessions set absolute_expires_at=clock_timestamp()-interval '1 second', expires_at=clock_timestamp()-interval '1 second' where token_hash=$1`, [ok.token])
    await as(db, 'service_role', null)
    assert.equal((await call('touch_customer_app_session', [PLAIN_STORE, ok.token])).ok, false, 'expired session')
    assert.equal((await call('touch_customer_app_session', [PLAIN_STORE, back.token])).ok, true)
    assert.equal((await call('revoke_customer_app_session', [PLAIN_STORE, back.token])).revoked, 1)
    assert.equal((await call('touch_customer_app_session', [PLAIN_STORE, back.token])).ok, false, 'revoked')
    // Account deletion: sessions and profile gone; the store's own customer record stays.
    const deleted = await call('delete_customer_app_account', [PLAIN_STORE, anaIn.r.customerId])
    assert.equal(deleted.removedProfile, 1)
    assert.equal(deleted.removedCustomer, 0, 'an order-made customer belongs to the store')
    assert.equal((await call('touch_customer_app_session', [PLAIN_STORE, anaIn.token])).ok, false)
    assert.equal(Number((await db.query(`select count(*) n from public.customer_app_sessions where customer_id=$1`, [anaIn.r.customerId])).rows[0].n), 0, 'session rows deleted, not just revoked')
    assert.equal(Number((await db.query(`select count(*) n from public.customers where id=$1`, [anaIn.r.customerId])).rows[0].n), 1, 'store keeps its customer')
    // An app-made customer nothing refers to goes with the account; one with an order stays.
    const appMade = await call('delete_customer_app_account', [PLAIN_STORE, ok.r.customerId])
    assert.equal(appMade.removedCustomer, 1, 'app-made, unreferenced customer is erased')
    await reset(db)
    const kept = (await db.query(`insert into public.customers(tenant_id,phone_e164,created_source) values($1,'+639170000099','app') returning id`, [PLAIN_STORE])).rows[0].id
    await db.query(`insert into public.orders(customer_id) values($1)`, [kept])
    await as(db, 'service_role', null)
    assert.equal((await call('delete_customer_app_account', [PLAIN_STORE, kept])).removedCustomer, 0, 'a customer with an order stays')
    assert.equal((await call('delete_customer_app_account', [PLAIN_STORE, randomUUID()])).ok, false, 'unknown customer')

    // 6. Delivery gate by purpose.
    await reset(db)
    await db.exec(`delete from public.loyalty_sms_outbox; delete from public.loyalty_otp_challenges;`)
    const insertJob = async (tenant, purpose) => {
      const id = randomUUID()
      await db.query(`insert into public.loyalty_otp_challenges(id,tenant_id,purpose,phone_hash,code_hash,expires_at) values($1,$2,$3,$4,$4,clock_timestamp()+interval '4 minutes')`, [id, tenant, purpose, hex(id)])
      await db.query(`insert into public.loyalty_sms_outbox(tenant_id,challenge_id,payload_encrypted) values($1,$2,$3)`, [tenant, id, PAYLOAD])
      return id
    }
    const claimFor = (tenant, actor, device) => call('claim_loyalty_sms_job', [tenant, actor, device, CRED])
    const plainWallet = await insertJob(PLAIN_STORE, 'wallet')
    const plainLogin = await insertJob(PLAIN_STORE, 'login')
    await as(db, 'service_role', null)
    // A store without a stamp card: the phone gets the login job, never the wallet one.
    const plainClaim = await claimFor(PLAIN_STORE, OWNER, DEVICE_PLAIN)
    assert.equal(plainClaim.challengeId, plainLogin, JSON.stringify(plainClaim))
    const grant = await call('authorize_loyalty_sms_dispatch', [PLAIN_STORE, OWNER, DEVICE_PLAIN, CRED, plainClaim.jobId, plainClaim.leaseToken])
    assert.equal(grant.ok, true)
    assert.equal(grant.purpose, 'login')
    assert.deepEqual(await call('finish_loyalty_sms_job', [PLAIN_STORE, OWNER, DEVICE_PLAIN, CRED, plainClaim.jobId, plainClaim.leaseToken, 'sent']), { ok: true })
    assert.deepEqual(await claimFor(PLAIN_STORE, OWNER, DEVICE_PLAIN), { ok: false, error: 'no_job' }, 'wallet job stays (no stamp card)')
    assert.equal((await db.query('select status from public.loyalty_sms_outbox where challenge_id=$1', [plainWallet])).rows[0].status, 'queued')
    // Loyalty store: a `customers`-only phone gets login jobs only; a `loyalty_manage`-only phone gets claim jobs only.
    await reset(db)
    const loyalClaimJob = await insertJob(LOYALTY_STORE, 'claim')
    const loyalLoginJob = await insertJob(LOYALTY_STORE, 'login')
    await as(db, 'service_role', null)
    const custClaim = await claimFor(LOYALTY_STORE, CUSTOMERS_STAFF, DEVICE_CUST)
    assert.equal(custClaim.challengeId, loyalLoginJob, 'customers key → login job')
    const loyalClaim = await claimFor(LOYALTY_STORE, LOYALTY_STAFF, DEVICE_LOYAL)
    assert.equal(loyalClaim.challengeId, loyalClaimJob, 'loyalty_manage → claim job, never the login job')
    // The loyalty-only phone cannot authorize or finish a login job.
    assert.deepEqual(await call('authorize_loyalty_sms_dispatch', [LOYALTY_STORE, LOYALTY_STAFF, DEVICE_LOYAL, CRED, custClaim.jobId, custClaim.leaseToken]),
      { ok: false, error: 'request_denied' })
    assert.deepEqual(await call('finish_loyalty_sms_job', [LOYALTY_STORE, LOYALTY_STAFF, DEVICE_LOYAL, CRED, custClaim.jobId, custClaim.leaseToken, 'sent']),
      { ok: false, error: 'device_denied' })
    // A phone with neither key is refused outright.
    await reset(db)
    await db.query(`update public.app_users set permissions=array['orders'] where user_id=$1`, [CUSTOMERS_STAFF])
    await as(db, 'service_role', null)
    assert.deepEqual(await claimFor(LOYALTY_STORE, CUSTOMERS_STAFF, DEVICE_CUST), { ok: false, error: 'request_denied' })

    // 7. App Review: only while the app is a draft; every try logged.
    await reset(db)
    await db.query(`insert into public.tenant_apps(tenant_id,display_name,bundle_id,android_package,review_phone_e164,review_code_hash)
      values($1,'Plain','com.webnegosyo.plain','com.webnegosyo.plain','+639990000000',$2)`, [PLAIN_STORE, hex('review-code')])
    await as(db, 'service_role', null)
    const review = (code) => call('open_customer_app_review_session', [PLAIN_STORE, '+639990000000', hex('review-phone'), code, hex(randomUUID()), hex('review-ip')])
    assert.deepEqual(await review(hex('nope')), invalid)
    const reviewIn = await review(hex('review-code'))
    assert.equal(reviewIn.ok, true, JSON.stringify(reviewIn))
    await reset(db)
    await db.query(`update public.tenant_apps set status='live' where tenant_id=$1`, [PLAIN_STORE])
    await as(db, 'service_role', null)
    assert.deepEqual(await review(hex('review-code')), invalid, 'not once the app is live')
    const audit = (await db.query('select outcome from public.customer_app_review_logins order by id')).rows.map((r) => r.outcome)
    assert.deepEqual(audit, ['refused', 'signed_in', 'refused'])
    // Lockout: 5 refused review sign-ins in an hour shut the door, even to the right code.
    await reset(db)
    await db.query(`update public.tenant_apps set status='draft' where tenant_id=$1`, [PLAIN_STORE])
    await as(db, 'service_role', null)
    for (let i = 0; i < 3; i++) assert.deepEqual(await review(hex(`guess-${i}`)), invalid)
    assert.deepEqual(await review(hex('review-code')), invalid, 'locked out after 5 refusals')
    // The review number's code request is counted and limited like any other.
    await reset(db)
    await db.exec('delete from public.customer_login_issuance_events')
    await as(db, 'service_role', null)
    assert.deepEqual(await call('note_customer_login_review_request', [PLAIN_STORE, hex('review-phone'), hex('review-ip')]), { ok: true })
    assert.equal((await call('note_customer_login_review_request', [PLAIN_STORE, hex('review-phone'), hex('review-ip')])).error, 'rate_limited')

    // 8. Client roles: no table, no function.
    for (const [label, enter] of [['anon', () => asAnon(db)], ['authenticated', () => as(db, 'authenticated', OWNER)]]) {
      for (const table of ['customer_app_sessions', 'customer_app_profiles', 'customer_login_issuance_events', 'customer_app_review_logins']) {
        await enter()
        await db.exec('begin')
        await assert.rejects(db.query(`select * from public.${table}`), /permission denied/, `${label} reads ${table}`)
        await db.exec('rollback')
      }
      for (const fn of ["issue_customer_login_challenge(null,null,null,null,null,null)", "verify_customer_login_challenge(null,null,null,null,null,null)",
        "touch_customer_app_session(null,null)", "revoke_customer_app_session(null,null)", "delete_customer_app_account(null,null)",
        "open_customer_app_review_session(null,null,null,null,null,null)", "claim_loyalty_sms_job(null,null,null,null)",
        "note_customer_login_review_request(null,null,null)", "customer_login_rate_limited(null,null,null,null)"]) {
        await enter()
        await db.exec('begin')
        await assert.rejects(db.query(`select public.${fn}`), /permission denied/, `${label} calls ${fn}`)
        await db.exec('rollback')
      }
    }
    await as(db, 'service_role', null)
    await db.exec('begin')
    await assert.rejects(db.query(`select public.customer_app_open_session(null,null,null,null,null)`), /permission denied/, 'internal step not callable')
    await db.exec('rollback')

    console.log('customer-app auth SQL checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
