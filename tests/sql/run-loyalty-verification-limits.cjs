// Isolated PostgreSQL behavior tests; PGlite is installed outside this repo.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const assert = require('node:assert/strict')
async function main() {
  const db = new PGlite()
  const tenant = randomUUID()
  const hash = n => n.toString(16).padStart(64, '0')
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    await db.exec(readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260910130000_loyalty_verification_limits.sql'), 'utf8'))
    const allow = async (t = tenant, phone = hash(1), ip = hash(2)) => (await db.query('select allow_loyalty_verification_attempt($1,$2,$3) as result', [t, phone, ip])).rows[0].result
    assert.deepEqual(await allow(), { ok: true }, 'Missing tenants/challenges still consume the attempt budget')
    assert.equal(Number((await db.query('select count(*) as n from loyalty_verification_rate_events')).rows[0].n), 1)
    const denied = { ok: false, error: 'invalid_claim' }
    const count = async () => Number((await db.query('select count(*) as n from loyalty_verification_rate_events')).rows[0].n)
    const foreign = randomUUID()
    for (const [dimension, limit, age] of [
      ['phone', 10, '2 minutes'], ['phone', 30, '2 hours'],
      ['ip', 30, '2 minutes'], ['ip', 100, '2 hours'],
      ['tenant', 120, '10 seconds'], ['tenant', 2000, '2 minutes'],
    ]) {
      await db.exec('truncate loyalty_verification_rate_events')
      await db.query(`insert into loyalty_verification_rate_events(tenant_id,phone_hash,ip_hash,created_at)
        select $1,case when $2='phone' then $3 else repeat(md5(i::text),2) end,
        case when $2='ip' then $4 else repeat(md5(('ip'||i)::text),2) end,
        clock_timestamp()-$5::interval from generate_series(1,$6::int) i`,
      [dimension === 'ip' ? foreign : tenant, dimension, hash(1), hash(2), age, limit])
      assert.deepEqual(await allow(), denied, `${dimension} ${limit} / ${age} denies the next request`)
      assert.equal(await count(), limit, 'Saturated requests do not grow the event table')
      await db.exec('delete from loyalty_verification_rate_events where id=(select min(id) from loyalty_verification_rate_events)')
      assert.deepEqual(await allow(), { ok: true }, `${dimension} accepts its last allowed attempt`)
      assert.equal(await count(), limit)
      assert.deepEqual(await allow(), denied, 'Exact retries consume budget and cannot bypass a saturated limit')
    }
    await db.exec('truncate loyalty_verification_rate_events')
    for (const [index, value] of [[0, null], [1, null], [2, null],
      ...[1, 2].flatMap(index => ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(64) + '\n'].map(value => [index, value]))]) {
      const args = [tenant, hash(1), hash(2)]
      args[index] = value
      assert.deepEqual(await allow(...args), denied, 'Malformed inputs are denied normally')
    }
    assert.equal(await count(), 0, 'Malformed input does not create events')
    for (const isolation of ['repeatable read', 'serializable']) {
      await db.exec(`begin isolation level ${isolation}`)
      try { assert.deepEqual(await allow(), denied, 'Snapshot isolation cannot bypass quota after lock waits') }
      finally { await db.exec('rollback') }
    }
    assert.equal(await count(), 0)
    // Hour/day windows stop counting old history without requiring destructive cleanup.
    await db.query(`insert into loyalty_verification_rate_events(tenant_id,phone_hash,ip_hash,created_at)
      select $1,$2,$3,clock_timestamp()-interval '25 hours' from generate_series(1,2000)`, [tenant, hash(1), hash(2)])
    assert.deepEqual(await allow(), { ok: true })
    assert.equal(await count(), 2001)
    await db.exec('truncate loyalty_verification_rate_events')
    // Same phone hash in another tenant does not consume this tenant-phone budget.
    await db.query(`insert into loyalty_verification_rate_events(tenant_id,phone_hash,ip_hash)
      select $1,$2,repeat(md5(i::text),2) from generate_series(1,10) i`, [foreign, hash(1)])
    assert.deepEqual(await allow(), { ok: true })
    const recorded = (await db.query('select * from loyalty_verification_rate_events where tenant_id=$1', [tenant])).rows[0]
    assert.deepEqual(Object.keys(recorded).sort(), ['created_at', 'id', 'ip_hash', 'phone_hash', 'tenant_id'])
    assert.equal(recorded.phone_hash, hash(1))
    assert.equal(recorded.ip_hash, hash(2))
    assert.ok(new Date(recorded.created_at).getTime() <= Date.now())
    // A separate transaction cannot roll back the earlier committed rate attempt.
    const beforeFailure = await count()
    await db.exec('begin')
    try { await assert.rejects(db.query('select 1/0'), /division by zero/) }
    finally { await db.exec('rollback') }
    assert.equal(await count(), beforeFailure)
    await db.exec(`create table tenants(id uuid primary key); insert into tenants values('${tenant}'); delete from tenants`)
    assert.equal(await count(), beforeFailure, 'Tenant deletion does not erase IP abuse history')
    const retryCount = await count()
    assert.deepEqual(await allow(), { ok: true })
    assert.equal(await count(), retryCount + 1, 'An exact retry is a new attempt, never idempotent')
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(allow(), /permission denied/)
      await assert.rejects(db.query('select * from loyalty_verification_rate_events'), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.deepEqual(await allow(), { ok: true })
    assert.ok(await count() > 0, 'Service role can inspect rate history')
    for (const sql of ['delete from loyalty_verification_rate_events',
      'update loyalty_verification_rate_events set created_at=now()',
      `insert into loyalty_verification_rate_events(tenant_id,phone_hash,ip_hash) values('${tenant}','${hash(1)}','${hash(2)}')`,
      'truncate loyalty_verification_rate_events']) await assert.rejects(db.exec(sql), /permission denied/)
    await db.exec('reset role')
    console.log('Loyalty verification limit SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
