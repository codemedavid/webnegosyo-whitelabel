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

    // Terminal platform jobs sleep indefinitely; transactional lifecycle
    // triggers wake them when there is actually new work.
    await db.exec(`insert into orders(id,tenant_id,status,customer_contact) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','delivered','09171234567')`)
    const platform = (await claim())[0]
    assert.equal(platform.backend,'platform_supabase')
    assert.equal(await ack(platform,'credited'),true)
    assert.equal((await db.query('select isfinite(next_attempt_at) finite from loyalty_earning_jobs where id=$1',[platform.id])).rows[0].finite,false,'Completed platform orders must not consume daily worker capacity')
    await db.exec(`update orders set status='cancelled' where id='33333333-3333-4333-8333-333333333333'`)
    const requeued = (await claim())[0]
    assert.equal(requeued.id,platform.id)
    assert.equal(requeued.last_result,null,'A real lifecycle change receives fresh-work priority')
    assert.equal(await ack(requeued,'reversed'),true)

    // Older external terminal jobs have a finite polling window.
    await db.query("update loyalty_earning_jobs set created_at=now()-interval '31 days',next_attempt_at=now() where id=$1",[row.id])
    const historical = (await claim())[0]
    assert.equal(await ack(historical,'already_credited'),true)
    assert.equal((await db.query('select isfinite(next_attempt_at) finite from loyalty_earning_jobs where id=$1',[row.id])).rows[0].finite,false,'External historical polling is bounded')

    // Terminal historical work cannot occupy the whole batch ahead of a
    // newly captured order, even if it became due much earlier.
    await db.query("update loyalty_earning_jobs set next_attempt_at=now()-interval '1 day' where id=$1",[row.id])
    await db.exec(`insert into orders(id,tenant_id,status) values('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','delivered')`)
    const priority = (await db.query('select * from claim_loyalty_earning_jobs(1)')).rows[0]
    assert.equal(priority.external_order_id,'44444444-4444-4444-8444-444444444444','New work wins over a historical rescan')
    await db.exec('set role authenticated')
    await assert.rejects(claim(),/permission denied/)
    console.log('Loyalty recovery SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
