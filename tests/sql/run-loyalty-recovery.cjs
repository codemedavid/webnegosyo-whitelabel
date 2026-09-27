const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
async function main() {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table tenants(id uuid primary key,loyalty_enabled boolean,loyalty_shadow boolean);
      create table orders(id uuid primary key,tenant_id uuid,status text,payment_status text,customer_contact text,customer_data jsonb,created_at timestamptz default now());
      create table customer_external_orders(id uuid primary key default gen_random_uuid(),tenant_id uuid,backend text,external_order_id text,customer_id uuid,status text,payment_status text,created_at timestamptz default now());
      insert into tenants values('11111111-1111-4111-8111-111111111111',true,false);`)
    await db.exec(readFileSync('supabase/migrations/20260926151000_loyalty_earning_recovery.sql','utf8'))
    await db.exec(`insert into customer_external_orders(tenant_id,backend,external_order_id,customer_id,status) values('11111111-1111-4111-8111-111111111111','convex','order-1','22222222-2222-4222-8222-222222222222','ready')`)
    const claim = async () => (await db.query('select * from claim_loyalty_earning_jobs(5)')).rows
    const first = await claim()
    assert.equal(first.length,1)
    assert.equal((await claim()).length,0,'Active leases cannot be claimed twice')
    await db.exec(`update customer_external_orders set status='delivered' where external_order_id='order-1'`)
    const ack = async (job,result) => (await db.query('select finish_loyalty_earning_job($1,$2,$3,$4) ok',[job.id,job.lease_token,job.revision,result])).rows[0].ok
    assert.equal(await ack(first[0],'credited'),false,'An older worker must not acknowledge a newer lifecycle event')
    const second = await claim()
    assert.equal(second.length,1)
    assert.equal(await ack(second[0],'credited'),true)
    assert.equal((await claim()).length,0,'Finished checks are scheduled, not hot-looped')
    const row=(await db.query('select * from loyalty_earning_jobs')).rows[0]
    assert.equal(row.last_result,'credited')
    assert.ok(row.last_checked_at)
    await db.exec('set role authenticated')
    await assert.rejects(claim(),/permission denied/)
    console.log('Loyalty recovery SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
