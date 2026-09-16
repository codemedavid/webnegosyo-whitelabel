const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const tenant = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
async function main() {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table tenants(id uuid primary key);
      create table orders(id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants,
        created_at timestamptz default now());
      insert into tenants values ('${tenant}'),('${other}');`)
    await db.exec(readFileSync('supabase/migrations/20260916123000_daily_order_number.sql', 'utf8'))
    const insert = async (id, time, supplied = null) => (await db.query(
      'insert into orders(tenant_id,created_at,daily_number) values($1,$2,$3) returning daily_number,order_date', [id,time,supplied])).rows[0]
    assert.equal((await insert(tenant,'2026-09-15T15:59:00Z',999)).daily_number,1)
    assert.equal((await insert(tenant,'2026-09-15T15:59:30Z')).daily_number,2)
    assert.equal((await insert(other,'2026-09-15T15:59:30Z')).daily_number,1)
    assert.equal((await insert(tenant,'2026-09-15T16:00:00Z')).daily_number,1)
    // Late settlement belongs to its original business day.
    assert.equal((await insert(tenant,'2026-09-15T15:59:45Z')).daily_number,3)
    await db.exec('delete from daily_order_counters')
    assert.equal((await insert(tenant,'2026-09-15T15:59:50Z')).daily_number,4)
    const batch = await Promise.all(Array.from({length:100}, () => insert(tenant,'2026-09-15T17:00:00Z')))
    assert.equal(new Set(batch.map(row=>row.daily_number)).size,100)
    assert.equal(Math.max(...batch.map(row=>row.daily_number)),101)
    await db.exec('grant insert on orders to anon; set role anon')
    await assert.rejects(db.query('select next_daily_order_number($1,$2)',[tenant,'2026-09-15']), /permission denied/)
    await db.exec('reset role')
    // The trigger can allocate for anon without granting access to the counter.
    await db.exec(`set role anon; insert into orders(tenant_id,created_at) values('${tenant}','2026-09-15T15:59:55Z'); reset role;`)
    assert.equal((await db.query("select max(daily_number) as n from orders where order_date='2026-09-15' and tenant_id=$1",[tenant])).rows[0].n,5)
    console.log('Platform daily numbering: reset, tenant scope, replay seed, private allocation, 100 queued inserts passed')
  } finally { await db.close() }
  const own = new PGlite()
  try {
    await own.exec(`create role anon; create role authenticated;
      create table orders(id uuid default gen_random_uuid(),tenant_id uuid,created_at timestamptz,daily_order_number integer);
      insert into orders(tenant_id,created_at,daily_order_number) values('${tenant}','2026-09-15T15:00:00Z',42);`)
    const schema = readFileSync('src/lib/supabase-order-schema.ts','utf8')
    const start = schema.indexOf('create table if not exists public.daily_order_counters')
    const end = schema.indexOf('\n-- ---------------------------------------------------------------------------\n-- order_items',start)
    await own.exec(schema.slice(start,end))
    const row = (await own.query('insert into orders(tenant_id,created_at,daily_order_number) values($1,$2,999) returning daily_order_number',[tenant,'2026-09-15T15:59:00Z'])).rows[0]
    assert.equal(row.daily_order_number,43)
    const next = (await own.query('insert into orders(tenant_id,created_at) values($1,$2) returning daily_order_number',[tenant,'2026-09-15T16:00:00Z'])).rows[0]
    assert.equal(next.daily_order_number,1)
    console.log('Tenant upgrade: preserves existing sequence and resets on Manila date passed')
  } finally { await own.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
