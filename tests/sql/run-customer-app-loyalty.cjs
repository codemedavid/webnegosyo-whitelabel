// Customer app, phase 5 (loyalty card + "Use now" reward claim) over PGlite:
// the REAL migration 20261111223138_customer_app_loyalty.sql on top of the
// real loyalty chain (programs → verified claims → wallet → quote issuance →
// cleanup → wallet history) and the real customer-app sign-in migrations
// (20261026150000_tenant_apps.sql, 20261026160000_customer_app_auth.sql).
// Supabase's default grants are installed first, so the migration's REVOKE is
// what keeps anon / authenticated out.
//
// The bodies of lookup_loyalty_wallet, issue_loyalty_pos_quote,
// verify_loyalty_claim and expire_loyalty_reservations come from the repo's
// latest migration that defines each (20260926152000, 20260914163000,
// 20260908120000, 20260914164000).
//   node tests/sql/run-customer-app-loyalty.cjs
// `--baseline` skips the migration under test and MUST fail.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const hex = (label) => createHash('sha256').update(String(label)).digest('hex')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER_STORE = '00000000-0000-4000-8000-000000000002'
const BRANCH = '00000000-0000-4000-8000-0000000000b1'
const ACTOR = '00000000-0000-4000-8000-0000000000a1'
const PHONE = '+639171234567'
const KEY = `phone:${PHONE}`
const OTHER_PHONE = '+639179999999'
const OTHER_KEY = `phone:${OTHER_PHONE}`

// Shapes as on the platform DB (only what the migrations and functions touch).
const BASE = `
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
create table public.tenants(id uuid primary key, name text);
create table public.outlets(id uuid primary key, tenant_id uuid, name text, is_active boolean default true);
create table public.app_users(user_id uuid primary key, tenant_id uuid, role text, is_owner boolean, permissions text[], outlet_id uuid);
create table public.customers(id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text, email text, name text, created_source text not null default 'order',
  constraint customers_created_source_ck check (created_source = any (array['order','manual','import'])),
  constraint customers_identity_ck check (phone_e164 is not null or email is not null));
create unique index customers_tenant_phone_uq on public.customers(tenant_id, phone_e164) where phone_e164 is not null;
create table public.orders(id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete set null);
create table public.sms_sends(id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete set null);
`

const LOYALTY_CHAIN = [
  '20260905140000_loyalty_programs.sql',
  '20260905141000_loyalty_versions_cascade.sql',
  '20260906150000_loyalty_reversal_accounting.sql',
  '20260906160000_loyalty_access.sql',
  '20260906170000_loyalty_pos_settlement.sql',
  '20260907120000_loyalty_quote_immutability.sql',
  '20260908120000_loyalty_verified_claims.sql',
  '20260914161000_loyalty_program_management.sql',
  '20260914162000_loyalty_wallet.sql',
  '20260914163000_loyalty_quote_issuance.sql',
  '20260914164000_loyalty_cleanup.sql',
  '20260926152000_loyalty_wallet_history.sql',
]

async function main() {
  const db = new PGlite()
  const q = async (sql, params = []) => (await db.query(sql, params)).rows
  const one = async (sql, params = []) => (await q(sql, params))[0]
  const call = async (name, args) =>
    (await one(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).result
  // Fixtures are written as the owner; the functions under test run as service_role.
  const owner = async (fn) => {
    await reset(db)
    try { return await fn() } finally { await as(db, 'service_role', null) }
  }
  try {
    await installPlatformAuth(db)
    await db.exec(BASE)
    for (const name of LOYALTY_CHAIN) await db.exec(readMigration(name))
    await db.exec(readMigration('20261026150000_tenant_apps.sql'))
    await db.exec(readMigration('20261026160000_customer_app_auth.sql'))
    if (!process.argv.includes('--baseline')) await db.exec(readMigration('20261111223138_customer_app_loyalty.sql'))

    // --- Fixture --------------------------------------------------------------
    await db.query(`insert into auth.users values ($1)`, [ACTOR])
    await db.query(`insert into public.tenants(id,name) values ($1,'Kape'),($2,'Other')`, [STORE, OTHER_STORE])
    await db.exec(`update public.tenants set loyalty_enabled=true, loyalty_shadow=false`)
    await db.query(`insert into public.outlets(id,tenant_id,name) values ($1,$2,'Makati')`, [BRANCH, STORE])
    await db.query(`insert into public.app_users values ($1,$2,'admin',false,array['pos','loyalty_redeem'],null)`, [ACTOR, STORE])
    const customer = async (tenant, phone) =>
      (await one(`insert into public.customers(tenant_id,phone_e164,created_source) values($1,$2,'app') returning id`, [tenant, phone])).id
    const ME = await customer(STORE, PHONE)
    const SOMEONE = await customer(STORE, OTHER_PHONE)
    const ABROAD = await customer(STORE, '+14155550123')
    const ME_ELSEWHERE = await customer(OTHER_STORE, PHONE)

    // Sessions are written the way customer_app_open_session writes them.
    const session = async (tenant, customerId, o = {}) => {
      const token = hex(randomUUID())
      const row = await one(`insert into public.customer_app_sessions(tenant_id,customer_id,phone_hash,token_hash,expires_at,absolute_expires_at,revoked_at)
        values($1,$2,$3,$4,clock_timestamp()+$5::interval,clock_timestamp()+$6::interval,$7) returning id`,
        [tenant, customerId, hex(`phone-${customerId}`), token, o.expires ?? '60 days', o.absolute ?? '365 days', o.revoked ?? null])
      return { token, id: row.id }
    }

    const program = async (tenant, o = {}) => {
      const p = (await one(`insert into public.loyalty_programs(tenant_id,name,earn_mode,status,activates_at,scope,outlet_id)
        values($1,$2,'stamp',$3,clock_timestamp()-interval '1 day',$4,$5) returning id`,
      [tenant, o.name ?? 'Coffee', o.status ?? 'active', o.scope ?? 'business', o.outlet ?? null])).id
      const rules = { earnMode: 'stamp', threshold: 10, reward: { type: 'fixed', amount: 100 }, isExclusive: true }
      const v = (await one(`insert into public.loyalty_program_versions(tenant_id,program_id,version,rules) values($1,$2,1,$3) returning id`, [tenant, p, rules])).id
      await db.query(`update public.loyalty_programs set current_version_id=$1 where id=$2`, [v, p])
      return p
    }
    const reward = async (tenant, programId, key, o = {}) =>
      (await one(`insert into public.loyalty_entitlements(tenant_id,program_id,customer_key,terms,status,expires_at)
        values($1,$2,$3,$4,$5,$6) returning id`,
      [tenant, programId, key, { programId, programName: 'Coffee', versionNumber: 1, reward: { type: 'fixed', amount: 50 }, isExclusive: true },
        o.status ?? 'issued', o.expiresAt ?? null])).id

    const COFFEE = await program(STORE)
    const BRANCH_CARD = await program(STORE, { name: 'Makati card', scope: 'branch', outlet: BRANCH })
    const ENDED = await program(STORE, { name: 'Old card' })
    const OTHER_COFFEE = await program(OTHER_STORE)
    await db.query(`insert into public.loyalty_balances(tenant_id,program_id,customer_key,balance) values($1,$2,$3,3),($1,$4,$3,7),($1,$5,$3,2)`,
      [STORE, COFFEE, KEY, BRANCH_CARD, ENDED])
    await db.query(`update public.loyalty_programs set status='ended' where id=$1`, [ENDED])

    const mine = await session(STORE, ME)
    const theirs = await session(STORE, SOMEONE)
    const abroad = await session(STORE, ABROAD)
    const elsewhere = await session(OTHER_STORE, ME_ELSEWHERE)
    const revoked = await session(STORE, ME, { revoked: new Date().toISOString() })
    const slidOut = await session(STORE, ME, { expires: '-1 second', absolute: '30 days' })
    const pastEnd = await session(STORE, ME, { expires: '-2 seconds', absolute: '-1 second' })

    // Rewards in the wallet: two of mine that count, plus noise that must not show.
    const issued = await reward(STORE, COFFEE, KEY, { expiresAt: new Date(Date.now() + 30 * 86400e3).toISOString() })
    const restored = await reward(STORE, BRANCH_CARD, KEY, { status: 'restored' })
    const heldThenLapsed = await reward(STORE, COFFEE, KEY, { status: 'reserved' })
    await db.query(`insert into public.loyalty_reservations(tenant_id,entitlement_id,token_hash,reserved_by,expires_at,status)
      values($1,$2,$3,$4,clock_timestamp()-interval '1 second','held')`, [STORE, heldThenLapsed, hex('lapsed-hold'), ACTOR])
    await reward(STORE, COFFEE, KEY, { expiresAt: new Date(Date.now() - 1000).toISOString() })
    await reward(STORE, COFFEE, KEY, { status: 'consumed' })
    const someoneElses = await reward(STORE, COFFEE, OTHER_KEY)
    const otherStoreReward = await reward(OTHER_STORE, OTHER_COFFEE, KEY)

    // --- 1. Grants ------------------------------------------------------------
    const functions = [
      ['app_customer_loyalty', [STORE, mine.token]],
      ['issue_app_loyalty_claim', [STORE, mine.token, issued, hex('grant-probe')]],
    ]
    for (const [label, enter] of [['anon', () => asAnon(db)], ['authenticated', () => as(db, 'authenticated', ACTOR)]]) {
      for (const [fn, args] of functions) {
        await enter()
        await assert.rejects(call(fn, args), /permission denied/, `${label} cannot call ${fn}`)
      }
    }
    const definer = await owner(() => q(`select proname, prosecdef, proconfig from pg_proc
      where proname in ('app_customer_loyalty','issue_app_loyalty_claim') order by proname`))
    assert.deepEqual(definer.map((r) => [r.proname, r.prosecdef, r.proconfig]), [
      ['app_customer_loyalty', true, ['search_path=public']],
      ['issue_app_loyalty_claim', true, ['search_path=public']],
    ], 'both SECURITY DEFINER, search_path pinned')
    await as(db, 'service_role', null)
    assert.equal((await call('app_customer_loyalty', [STORE, mine.token])).ok, true, 'service role reads the wallet')
    // (issue_app_loyalty_claim is exercised as service_role throughout section 3.)

    // --- 2. app_customer_loyalty ---------------------------------------------
    const wallet = (tenant, token) => call('app_customer_loyalty', [tenant, token])
    const signedOut = { ok: false, error: 'signed_out' }
    for (const [token, label] of [
      [null, 'null hash'], ['', 'empty hash'], [mine.token.toUpperCase(), 'uppercase hash'], [mine.token.slice(1), 'short hash'],
      [hex('nobody'), 'unknown session'], [revoked.token, 'revoked session'], [slidOut.token, 'sliding window over'],
      [pastEnd.token, 'absolute end passed'],
    ]) assert.deepEqual(await wallet(STORE, token), signedOut, label)
    assert.deepEqual(await wallet(OTHER_STORE, mine.token), signedOut, 'a session belongs to its store')
    assert.deepEqual(await wallet(STORE, elsewhere.token), signedOut, 'another store’s session is refused here')
    assert.deepEqual(await wallet(null, mine.token), signedOut, 'null store')
    assert.deepEqual(await wallet(STORE, abroad.token),
      { ok: true, live: false, customerKey: null, programs: [], rewards: [] }, 'non-PH phone has no card')

    for (const flags of ['loyalty_enabled=false', 'loyalty_shadow=true']) {
      await owner(() => db.exec(`update public.tenants set ${flags} where id='${STORE}'`))
      assert.deepEqual(await wallet(STORE, mine.token),
        { ok: true, live: false, customerKey: KEY, programs: [], rewards: [] }, `${flags}: nothing live`)
      await owner(() => db.exec(`update public.tenants set loyalty_enabled=true, loyalty_shadow=false where id='${STORE}'`))
    }

    const live = await wallet(STORE, mine.token)
    assert.equal(live.ok, true)
    assert.equal(live.live, true)
    assert.equal(live.customerKey, KEY)
    const lookup = await call('lookup_loyalty_wallet', [STORE, KEY, hex('lookup-phone'), hex('lookup-ip-1')])
    assert.equal(lookup.ok, true, JSON.stringify(lookup))
    assert.deepEqual(live.programs, lookup.programs, 'programs exactly as lookup_loyalty_wallet')
    assert.deepEqual(live.rewards, lookup.rewards, 'rewards exactly as lookup_loyalty_wallet')
    assert.deepEqual(live.programs.map((p) => [p.name, p.status, p.balance, p.branchName]),
      [['Coffee', 'active', 3, null], ['Makati card', 'active', 7, 'Makati'], ['Old card', 'ended', 2, null]], 'cards (incl. ended with a balance)')
    assert.deepEqual(new Set(live.rewards.map((r) => r.id)), new Set([issued, restored, heldThenLapsed]),
      'only my live rewards (a lapsed hold is released back by expire_loyalty_reservations)')
    assert.equal((await owner(() => one(`select status from public.loyalty_entitlements where id=$1`, [heldThenLapsed]))).status, 'issued')
    assert.equal(JSON.stringify(live.rewards).includes(someoneElses), false)
    assert.equal(JSON.stringify(live.rewards).includes(otherStoreReward), false)
    // The other customer at the same store sees their own wallet, not mine.
    const theirWallet = await wallet(STORE, theirs.token)
    const theirLookup = await call('lookup_loyalty_wallet', [STORE, OTHER_KEY, hex('lookup-phone-2'), hex('lookup-ip-2')])
    assert.deepEqual([theirWallet.programs, theirWallet.rewards], [theirLookup.programs, theirLookup.rewards])
    assert.deepEqual(theirWallet.rewards.map((r) => r.id), [someoneElses])
    // No lookup rate limiter on the app path: 20 reads in a row all answer.
    for (let i = 0; i < 20; i++) assert.equal((await wallet(STORE, mine.token)).ok, true, `app read ${i}`)

    // --- 3. issue_app_loyalty_claim ------------------------------------------
    const claim = (o = {}) => {
      const a = { tenant: STORE, token: mine.token, reward: issued, claimHash: hex(randomUUID()), ...o }
      return call('issue_app_loyalty_claim', [a.tenant, a.token, a.reward, a.claimHash]).then((r) => ({ r, hash: a.claimHash }))
    }
    const claimRow = (hash) => owner(() => one(`select * from public.loyalty_verified_claims where token_hash=$1`, [hash]))
    const unavailable = { ok: false, error: 'unavailable' }
    const claimCount = async () => Number((await owner(() => one(`select count(*) n from public.loyalty_verified_claims`))).n)

    // A fresh session per success case keeps the per-session budget out of the way.
    const minted = await claim({ token: (await session(STORE, ME)).token })
    assert.equal(minted.r.ok, true, JSON.stringify(minted.r))
    assert.deepEqual(Object.keys(minted.r).sort(), ['expiresAt', 'ok'], 'no ids or hashes in the answer')
    const mintedRow = await claimRow(minted.hash)
    assert.equal(mintedRow.challenge_id, null, 'no SMS challenge behind an app claim')
    assert.ok(mintedRow.app_session_id, 'bound to the app session')
    assert.equal(mintedRow.entitlement_id, issued)
    assert.equal(mintedRow.used_at, null)
    assert.equal(new Date(mintedRow.expires_at) - new Date(mintedRow.created_at), 120000, 'two-minute claim')
    assert.ok(Math.abs(new Date(minted.r.expiresAt) - (Date.now() + 120000)) < 5000, 'expiresAt ≈ now + 2 min')
    assert.equal(new Date(minted.r.expiresAt).getTime(), new Date(mintedRow.expires_at).getTime())
    assert.equal((await owner(() => one(`select status from public.loyalty_entitlements where id=$1`, [issued]))).status, 'issued', 'a claim does not reserve')

    assert.equal((await claim({ token: (await session(STORE, ME)).token, reward: restored })).r.ok, true, 'a restored reward can be claimed')

    // Refusals.
    const before = await claimCount()
    const refusals = [
      ['someone else’s reward', { reward: someoneElses }],
      ['another store’s reward via this store', { reward: otherStoreReward }],
      ['another store’s reward via its own store', { tenant: OTHER_STORE, token: elsewhere.token, reward: issued }],
      ['my reward at the other store, via the other store session', { tenant: OTHER_STORE, token: elsewhere.token, reward: otherStoreReward, expectOk: true }],
      ['this store’s session at another store', { tenant: OTHER_STORE, reward: otherStoreReward }],
      ['revoked session', { token: revoked.token }],
      ['sliding window over', { token: slidOut.token }],
      ['absolute end passed', { token: pastEnd.token }],
      ['unknown session', { token: hex('nobody') }],
      ['non-PH customer', { token: abroad.token }],
      ['null entitlement', { reward: null }],
      ['unknown entitlement', { reward: randomUUID() }],
      ['null store', { tenant: null }],
      ['null session hash', { token: null }],
      ['uppercase session hash', { token: mine.token.toUpperCase() }],
      ['short session hash', { token: mine.token.slice(2) }],
      ['null claim hash', { claimHash: null }],
      ['uppercase claim hash', { claimHash: hex('x').toUpperCase() }],
      ['long claim hash', { claimHash: `${hex('x')}0` }],
      ['non-hex claim hash', { claimHash: 'g'.repeat(64) }],
    ]
    let allowedHere = 0
    for (const [label, o] of refusals) {
      const { expectOk, ...args } = o
      const { r } = await claim(args)
      if (expectOk) { assert.equal(r.ok, true, `${label}: ${JSON.stringify(r)}`); allowedHere++ } else assert.deepEqual(r, unavailable, label)
    }
    for (const status of ['reserved', 'consumed', 'voided', 'expired']) {
      const item = await owner(() => reward(STORE, COFFEE, KEY, { status }))
      assert.deepEqual((await claim({ reward: item })).r, unavailable, `${status} reward`)
    }
    const lapsed = await owner(() => reward(STORE, COFFEE, KEY, { expiresAt: new Date(Date.now() - 1000).toISOString() }))
    assert.deepEqual((await claim({ reward: lapsed })).r, unavailable, 'issued but past its expiry')
    for (const flags of ['loyalty_enabled=false', 'loyalty_shadow=true']) {
      await owner(() => db.exec(`update public.tenants set ${flags} where id='${STORE}'`))
      assert.deepEqual((await claim()).r, unavailable, flags)
      await owner(() => db.exec(`update public.tenants set loyalty_enabled=true, loyalty_shadow=false where id='${STORE}'`))
    }
    assert.equal(await claimCount(), before + allowedHere, 'no refusal wrote a claim')

    // Claim expiry never outlives the reward.
    const soon = await owner(() => reward(STORE, COFFEE, KEY, { expiresAt: new Date(Date.now() + 45000).toISOString() }))
    const capped = await claim({ token: (await session(STORE, ME)).token, reward: soon })
    assert.equal(capped.r.ok, true, JSON.stringify(capped.r))
    const soonExpiry = (await owner(() => one(`select expires_at from public.loyalty_entitlements where id=$1`, [soon]))).expires_at
    assert.equal(new Date(capped.r.expiresAt).getTime(), new Date(soonExpiry).getTime(), 'capped at the reward’s expiry')

    // Six claims per session per ten minutes; the seventh is refused.
    const budget = await session(STORE, ME)
    for (let i = 0; i < 6; i++) assert.equal((await claim({ token: budget.token })).r.ok, true, `claim ${i + 1} of 6`)
    const before7 = await claimCount()
    assert.deepEqual((await claim({ token: budget.token })).r, { ok: false, error: 'rate_limited' }, 'seventh claim in 10 minutes')
    assert.equal(await claimCount(), before7, 'a rate-limited claim writes nothing')
    assert.equal((await claim({ token: (await session(STORE, ME)).token })).r.ok, true, 'the budget is per session')
    // Claims older than ten minutes no longer count.
    await owner(() => db.query(`update public.loyalty_verified_claims set created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes'
      where app_session_id=$1`, [budget.id]))
    assert.equal((await claim({ token: budget.token })).r.ok, true, 'the window slides')

    // A claim token hash is unique across every source.
    const dupe = hex('duplicate-claim')
    assert.equal((await claim({ token: (await session(STORE, ME)).token, claimHash: dupe })).r.ok, true)
    await assert.rejects(claim({ token: (await session(STORE, ME)).token, claimHash: dupe }), /duplicate key|unique constraint/, 'duplicate claim hash')

    // --- 4. End to end: an app claim redeems at the register ------------------
    const e2eReward = await owner(() => reward(STORE, COFFEE, KEY))
    const e2e = await claim({ token: (await session(STORE, ME)).token, reward: e2eReward })
    assert.equal(e2e.r.ok, true)
    const quoteId = randomUUID()
    const snapshot = { entitlementId: e2eReward, paymentPolicy: { totalCentavos: 5000, allowedMethods: [{ id: 'cash', kind: 'cash', requiresReference: false }] }, items: [] }
    const quote = (id, hash = e2e.hash) =>
      call('issue_loyalty_pos_quote', [STORE, ACTOR, hash, null, id, 'platform_supabase', 5000, snapshot])
    const issuedQuote = await quote(quoteId)
    assert.equal(issuedQuote.quoteId, quoteId)
    assert.equal(issuedQuote.totalCentavos, 5000)
    assert.ok((await claimRow(e2e.hash)).used_at, 'the claim is spent')
    assert.equal((await owner(() => one(`select status from public.loyalty_entitlements where id=$1`, [e2eReward]))).status, 'reserved')
    assert.equal((await owner(() => one(`select status from public.loyalty_reservations where token_hash=$1`, [e2e.hash]))).status, 'held')
    await assert.rejects(quote(randomUUID()), /Claim already used/, 'a claim redeems once')
    // An expired app claim does not redeem.
    const staleReward = await owner(() => reward(STORE, COFFEE, KEY))
    const stale = await claim({ token: (await session(STORE, ME)).token, reward: staleReward })
    await owner(() => db.query(`update public.loyalty_verified_claims set created_at=created_at-interval '3 minutes', expires_at=expires_at-interval '3 minutes' where token_hash=$1`, [stale.hash]))
    await assert.rejects(call('issue_loyalty_pos_quote', [STORE, ACTOR, stale.hash, null, randomUUID(), 'platform_supabase', 5000, { ...snapshot, entitlementId: staleReward }]),
      /Claim expired or unavailable/, 'expired app claim')

    // --- 5. The SMS path still writes a challenge-backed claim ----------------
    const smsReward = await owner(() => reward(STORE, COFFEE, KEY))
    // now()-based: verify_loyalty_claim refuses expires_at > created_at + 5 min,
    // and clock_timestamp()+5 min lands a few µs past that (created_at = now()).
    const challenge = (await owner(() => one(`insert into public.loyalty_otp_challenges(tenant_id,entitlement_id,phone_hash,code_hash,expires_at)
      values($1,$2,$3,$4,now()+interval '4 minutes') returning id`, [STORE, smsReward, hex('sms-phone'), hex('sms-code')]))).id
    const smsHash = hex('sms-claim')
    const sms = await call('verify_loyalty_claim', [STORE, challenge, hex('sms-code'), smsHash, KEY, hex('sms-phone')])
    assert.equal(sms.ok, true, JSON.stringify(sms))
    const smsRow = await claimRow(smsHash)
    assert.equal(smsRow.challenge_id, challenge)
    assert.equal(smsRow.app_session_id, null)

    // --- 6. Exactly one source per claim --------------------------------------
    const sourceSession = await session(STORE, ME)
    await reset(db)
    const rawClaim = (challengeId, sessionId) => db.query(`insert into public.loyalty_verified_claims(tenant_id,challenge_id,app_session_id,entitlement_id,token_hash,expires_at)
      values($1,$2,$3,$4,$5,now()+interval '1 minute')`, [STORE, challengeId, sessionId, smsReward, hex(randomUUID())])
    const freshChallenge = (await one(`insert into public.loyalty_otp_challenges(tenant_id,entitlement_id,phone_hash,code_hash,expires_at)
      values($1,$2,$3,$3,now()+interval '4 minutes') returning id`, [STORE, smsReward, hex('fresh')])).id
    await assert.rejects(rawClaim(freshChallenge, sourceSession.id), /loyalty_verified_claims_one_source/, 'both sources')
    await assert.rejects(rawClaim(null, null), /loyalty_verified_claims_one_source/, 'no source')
    await rawClaim(null, sourceSession.id)
    await rawClaim(freshChallenge, null)
    const index = await one(`select indexdef from pg_indexes where indexname='loyalty_verified_claims_app_session_idx'`)
    assert.match(index?.indexdef ?? '', /\(app_session_id, created_at\) WHERE \(app_session_id IS NOT NULL\)/, 'per-session budget index')

    // --- 7. Cascades -----------------------------------------------------------
    const sessionClaims = async (id) => Number((await one(`select count(*) n from public.loyalty_verified_claims where app_session_id=$1`, [id])).n)
    assert.equal(await sessionClaims(budget.id), 7)
    await db.query(`delete from public.customer_app_sessions where id=$1`, [budget.id])
    assert.equal(await sessionClaims(budget.id), 0, 'deleting the session removes its claims')
    const myClaimsBefore = Number((await one(`select count(*) n from public.loyalty_verified_claims c join public.customer_app_sessions s on s.id=c.app_session_id where s.customer_id=$1`, [ME])).n)
    assert.ok(myClaimsBefore > 0)
    await db.query(`delete from public.customers where id=$1`, [ME])
    assert.equal(Number((await one(`select count(*) n from public.customer_app_sessions where customer_id=$1`, [ME])).n), 0)
    const orphans = Number((await one(`select count(*) n from public.loyalty_verified_claims c where c.app_session_id is not null
      and not exists (select 1 from public.customer_app_sessions s where s.id=c.app_session_id)`)).n)
    assert.equal(orphans, 0, 'deleting the customer removes their sessions and every app claim')
    assert.equal((await one(`select count(*) n from public.loyalty_verified_claims where token_hash=$1`, [smsHash])).n, 1, 'SMS claims are untouched')

    console.log('customer-app loyalty SQL checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
