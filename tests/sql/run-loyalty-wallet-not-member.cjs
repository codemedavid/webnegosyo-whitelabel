// The rewards page's "text me a code" step on a number with no stamp card:
// the issuer says not_member (the page then says so) instead of a silent
// request_denied, still spends the number's budget, and queues nothing.
//   node tests/sql/run-loyalty-wallet-not-member.cjs
// `--baseline` skips the migration under test and MUST fail.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const assert = require('node:assert/strict')

const MIGRATIONS = ['20260905140000_loyalty_programs.sql','20260905141000_loyalty_versions_cascade.sql',
  '20260906150000_loyalty_reversal_accounting.sql','20260906160000_loyalty_access.sql',
  '20260906170000_loyalty_pos_settlement.sql','20260907120000_loyalty_quote_immutability.sql',
  '20260908120000_loyalty_verified_claims.sql','20260908130000_loyalty_challenge_issuance.sql',
  '20260909120000_loyalty_sms_delivery.sql','20260909130000_loyalty_sms_device_management.sql',
  '20260910140000_loyalty_sms_ack_authorization.sql','20261004120000_loyalty_sms_gateway.sql',
  '20261004150000_loyalty_wallet_verification.sql','20261004185000_loyalty_wallet_rate_limit_reason.sql']
const UNDER_TEST = '20261029130000_loyalty_wallet_not_member.sql'
const PAYLOAD = 'v1.AAAAAAAAAAAAAAAA.AAAA.AAAAAAAAAAAAAAAAAAAAAA'
const hex = c => c.repeat(64)

async function main() {
  const db = new PGlite()
  const tenant = randomUUID(), other = randomUUID(), actor = randomUUID()
  const member = 'phone:+639171234567', stranger = 'phone:+639179999999'
  const rpc = async (name, args) => (await db.query(`select ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result
  const count = async (sql, args) => Number((await db.query(sql, args)).rows[0].n)
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key); create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table tenant_secrets(tenant_id uuid primary key, lalamove_api_key text);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${tenant}'),('${other}'); insert into auth.users values('${actor}');`)
    const files = process.argv.includes('--baseline') ? MIGRATIONS : [...MIGRATIONS, UNDER_TEST]
    for (const name of files) await db.exec(readFileSync(path.resolve(__dirname, '../../supabase/migrations', name), 'utf8'))
    await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
    const program = (await db.query("insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id", [tenant])).rows[0].id
    await db.query('insert into loyalty_balances(tenant_id,program_id,customer_key,balance) values($1,$2,$3,3)', [tenant, program, member])

    let ip = 0
    const issue = (o = {}) => {
      const a = { tenant, challenge: randomUUID(), key: member, phone: hex('b'), ip: (++ip).toString(16).padStart(64, '0'), payload: PAYLOAD, ...o }
      return rpc('issue_loyalty_wallet_challenge', [a.tenant, a.challenge, a.key, a.phone, hex('c'), a.ip, a.payload]).then(r => ({ r, a }))
    }

    // A number with no card here is told so, and nothing is queued for it.
    const unknown = await issue({ key: stranger, phone: hex('e') })
    assert.deepEqual(unknown.r, { ok: false, error: 'not_member' })
    assert.equal(await count('select count(*) n from loyalty_otp_challenges where id=$1', [unknown.a.challenge]), 0)
    assert.equal(await count('select count(*) n from loyalty_sms_outbox', []), 0)
    assert.equal(await count('select count(*) n from loyalty_wallet_issuance_events where phone_hash=$1', [hex('e')]), 1, 'Probing still spends budget')
    // ...and asking again inside the cooldown is a rate limit, member or not.
    assert.equal((await issue({ key: stranger, phone: hex('e') })).r.error, 'rate_limited')

    // Membership is per store.
    assert.deepEqual((await issue({ tenant: other, phone: hex('f') })).r, { ok: false, error: 'not_member' })

    // A member still gets a code queued for the phone.
    const ok = await issue()
    assert.equal(ok.r.ok, true, JSON.stringify(ok.r))
    assert.equal(await count("select count(*) n from loyalty_sms_outbox where challenge_id=$1 and status='queued'", [ok.a.challenge]), 1)

    // Malformed input and a reused id are still plain refusals.
    assert.deepEqual((await issue({ payload: 'v1.bad', phone: hex('1') })).r, { ok: false, error: 'request_denied' })
    assert.deepEqual((await issue({ key: 'phone:+15551234567', phone: hex('2') })).r, { ok: false, error: 'request_denied' })
    assert.deepEqual((await issue({ challenge: ok.a.challenge, phone: hex('3') })).r, { ok: false, error: 'request_denied' })

    // Still service-role only.
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query(`select has_function_privilege('${role}','public.issue_loyalty_wallet_challenge(uuid,uuid,text,text,text,text,text)','execute') ok`)).rows[0].ok, false)
    }
    console.log('Loyalty wallet not-member SQL regressions passed')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exit(1) })
