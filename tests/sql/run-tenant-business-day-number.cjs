// A tenant's OWN Supabase order database (src/lib/supabase-order-schema.ts,
// bundle v4): the daily order number resets at the store's business-day
// cutoff, copied into business_day_cutoffs by the web app. No rows = Manila
// midnight. Runs the REAL bundle section the deploy applies.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const tenant = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

function bundleSection() {
  const schema = readFileSync('src/lib/supabase-order-schema.ts', 'utf8')
  const start = schema.indexOf('create table if not exists public.business_day_cutoffs')
  const end = schema.indexOf('\n-- ---------------------------------------------------------------------------\n-- order_items', start)
  assert.ok(start > 0 && end > start, 'bundle section not found')
  return schema.slice(start, end)
}

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create table orders(id uuid default gen_random_uuid(), tenant_id uuid, created_at timestamptz, daily_order_number integer);`)
    await db.exec(bundleSection())
    // Idempotent: the deploy re-runs the bundle on every version bump.
    await db.exec(bundleSection())
    const insert = async (id, at) =>
      (await db.query('insert into orders(tenant_id,created_at) values($1,$2) returning daily_order_number', [id, at])).rows[0].daily_order_number
    const dayOf = async (id, at) => (await db.query('select public.business_day_of($1,$2)::text as d', [id, at])).rows[0].d

    // No cutoff: Manila midnight (16:00 UTC).
    assert.equal(await dayOf(tenant, '2026-10-24T17:30:00Z'), '2026-10-25')
    assert.equal(await insert(other, '2026-10-24T15:59:00Z'), 1)
    assert.equal(await insert(other, '2026-10-24T16:00:00Z'), 1)

    // 4 AM from Oct 24: Fri 11 PM, Sat 1:30 AM continue Friday; Sat 4:00 AM starts at #1.
    await db.query('insert into business_day_cutoffs values ($1, $2, 240)', [tenant, '2026-10-24'])
    assert.equal(await dayOf(tenant, '2026-10-24T17:30:00Z'), '2026-10-24')
    assert.equal(await insert(tenant, '2026-10-24T15:00:00Z'), 1)
    assert.equal(await insert(tenant, '2026-10-24T17:30:00Z'), 2)
    assert.equal(await insert(tenant, '2026-10-24T19:59:59Z'), 3)
    assert.equal(await insert(tenant, '2026-10-24T20:00:00Z'), 1)
    // The other store keeps midnight.
    assert.equal(await dayOf(other, '2026-10-24T17:30:00Z'), '2026-10-25')

    // Bounds tile, and the transition day (midnight -> 4 AM) is 28 h long.
    const bounds = async (day) => (await db.query(
      "select to_char(start_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI') s, to_char(end_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI') e from public.business_day_bounds($1,$2)",
      [tenant, day])).rows[0]
    assert.deepEqual(await bounds('2026-10-23'), { s: '2026-10-22T16:00', e: '2026-10-23T20:00' })
    assert.deepEqual(await bounds('2026-10-24'), { s: '2026-10-23T20:00', e: '2026-10-24T20:00' })

    // A lost counter re-seeds from the business day's own window.
    await db.exec('delete from daily_order_counters')
    assert.equal(await insert(tenant, '2026-10-24T18:00:00Z'), 4)

    // Clients cannot read or call any of it.
    await db.exec('grant insert, select on orders to anon; set role anon')
    await assert.rejects(db.query('select * from business_day_cutoffs'), /permission denied/)
    await assert.rejects(db.query('select public.business_day_of($1, now())', [tenant]), /permission denied/)
    await db.exec('reset role')
    console.log('Tenant DB business day: midnight default, 4 AM reset, other store untouched, tiling bounds, re-seed, no client access passed')
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
