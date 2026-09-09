// Isolated PostgreSQL integration test; use an external PGlite via NODE_PATH.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  const t = '11111111-1111-1111-1111-111111111111'
  const actor = '22222222-2222-2222-2222-222222222222'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key);
      create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${t}'); insert into auth.users values('${actor}');
      insert into app_users values('${actor}','${t}','admin',false,array['pos','loyalty_redeem'],null);
    `)
    const root = path.resolve(__dirname, '../..')
    for (const name of [
      '20260905140000_loyalty_programs.sql',
      '20260905141000_loyalty_versions_cascade.sql',
      '20260906150000_loyalty_reversal_accounting.sql',
      '20260906160000_loyalty_access.sql',
      '20260906170000_loyalty_pos_settlement.sql',
      '20260907120000_loyalty_quote_immutability.sql',
    ]) {
      await db.exec(readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'))
    }
    await db.exec(`update tenants set loyalty_enabled=true,loyalty_shadow=false`)
    const program = (await db.query(`insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id`, [t])).rows[0].id
    async function quote(isExpired = false) {
      const e = (await db.query(`insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms,status)
        values($1,$2,'phone:+639171234567','{}','reserved') returning id`, [t, program])).rows[0].id
      const r = (await db.query(`insert into loyalty_reservations(tenant_id,entitlement_id,token_hash,reserved_by,expires_at)
        values($1,$2,gen_random_uuid()::text,$3,now()+interval '2 minutes') returning id`, [t, e, actor])).rows[0].id
      const q = (await db.query(`insert into loyalty_pos_quotes(tenant_id,reservation_id,customer_key,created_by,order_backend,total_centavos,order_snapshot,expires_at)
        values($1,$2,'phone:+639171234567',$3,'convex',9000,'{"items":[{"id":"coffee","quantity":1}]}',$4) returning id`,
      [t,r,actor,new Date(Date.now() + (isExpired ? -60000 : 120000)).toISOString()])).rows[0].id
      return { e, r, q }
    }
    async function settle(q, key = 'sale-1', payment = { methodId: 'cash' }, tenant = t, who = actor) {
      return (await db.query('select settle_loyalty_pos_sale($1,$2,$3,$4,$5::jsonb) as result', [tenant,q,key,who,JSON.stringify(payment)])).rows[0].result
    }
    const first = await quote()
    const result = await settle(first.q)
    assert.equal(result.totalCentavos,9000)
    assert.equal((await db.query('select status from loyalty_entitlements where id=$1',[first.e])).rows[0].status,'consumed')
    assert.equal((await db.query('select * from loyalty_pos_projection_jobs')).rows.length,1)
    assert.deepEqual(await settle(first.q),result,'Exact retries return the original receipt')
    await assert.rejects(settle(first.q,'sale-1',{methodId:'other'}),/different request/)
    await assert.rejects(settle(null),/Invalid settlement request/)
    await assert.rejects(settle(first.q,'another-sale'),/already settled/)
    const expired = await quote(true)
    await assert.rejects(settle(expired.q,'expired'),/expired/)
    const held = await quote()
    await db.exec("update tenants set loyalty_shadow=true")
    await assert.rejects(settle(held.q,'shadow'),/not enabled/)
    await db.exec("update tenants set loyalty_shadow=false; update app_users set outlet_id='33333333-3333-3333-3333-333333333333'")
    await assert.rejects(settle(held.q,'branch'),/Forbidden branch/)
    await db.exec('update app_users set outlet_id=null')
    await assert.rejects(settle(held.q,'foreign',{},'33333333-3333-3333-3333-333333333333'),/Forbidden/)
    await db.exec("update app_users set permissions=array['pos']")
    await assert.rejects(settle(held.q,'no-permission'),/Forbidden/)
    await db.exec("update app_users set permissions=array['pos','loyalty_redeem']")
    // Force the final write to fail: reward and receipt must roll back together.
    await db.exec(`create function fail_projection() returns trigger language plpgsql as $$ begin raise exception 'projection failure'; end $$;
      create trigger fail_projection before insert on loyalty_pos_projection_jobs for each row execute function fail_projection()`)
    await assert.rejects(settle(held.q,'rollback'),/projection failure/)
    assert.equal((await db.query('select status from loyalty_entitlements where id=$1',[held.e])).rows[0].status,'reserved')
    assert.equal((await db.query('select * from loyalty_pos_settlements')).rows.length,1)
    await db.exec('drop trigger fail_projection on loyalty_pos_projection_jobs')
    const job = (await db.query('select * from claim_loyalty_pos_projections(1)')).rows[0]
    assert.equal(job.settlement_id,result.settlementId)
    assert.equal((await db.query('select * from claim_loyalty_pos_projections(1)')).rows.length,0,'A live lease cannot be claimed twice')
    const finish = async (token,external,error=null) => (await db.query(
      'select finish_loyalty_pos_projection($1,$2,$3,$4) as applied',[job.id,token,external,error])).rows[0].applied
    assert.equal(await finish('33333333-3333-3333-3333-333333333333','external'),false,'Wrong lease cannot acknowledge another worker')
    await db.query("update loyalty_pos_projection_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[job.id])
    const retry = (await db.query('select * from claim_loyalty_pos_projections(1)')).rows[0]
    assert.notEqual(retry.lease_token,job.lease_token)
    assert.equal(await finish(job.lease_token,'external'),false,'An old worker cannot acknowledge a renewed lease')
    assert.equal(await finish(retry.lease_token,null,'Backend unavailable'),true)
    assert.equal((await db.query('select * from claim_loyalty_pos_projections(1)')).rows.length,0,'Failed projection waits before retrying')
    await db.query("update loyalty_pos_projection_jobs set available_at=now()-interval '1 second' where id=$1",[job.id])
    const recovered = (await db.query('select * from claim_loyalty_pos_projections(1)')).rows[0]
    assert.equal(await finish(recovered.lease_token,'external-1'),true)
    assert.equal((await db.query('select * from claim_loyalty_pos_projections(1)')).rows.length,0)
    // A quote cannot change between HTTP tender validation and SQL locking.
    await assert.rejects(db.query('update loyalty_pos_quotes set total_centavos=1 where id=$1',[held.q]),/immutable/)
    await assert.rejects(db.query("update loyalty_pos_quotes set order_snapshot='{}' where id=$1",[held.q]),/immutable/)
    await assert.rejects(db.query('delete from loyalty_pos_quotes where id=$1',[held.q]),/immutable/)
    await assert.rejects(db.exec('truncate loyalty_pos_quotes cascade'),/immutable/)
    assert.deepEqual(await settle(first.q),result,'Immutable quotes retain exact receipt recovery')
    await db.exec('set role authenticated')
    await assert.rejects(settle(held.q,'direct'),/permission denied/)
    console.log('Loyalty settlement SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
