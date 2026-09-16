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
      create table outlets(id uuid primary key,tenant_id uuid,is_active boolean default true);
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
      '20260908120000_loyalty_verified_claims.sql',
      ...(process.argv.includes('--baseline') ? [] : ['20260914163000_loyalty_quote_issuance.sql','20260914164000_loyalty_cleanup.sql']),
    ]) {
      await db.exec(readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'))
    }
    await db.exec(`update tenants set loyalty_enabled=true,loyalty_shadow=false`)
    const program = (await db.query(`insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id`, [t])).rows[0].id

    const terms = {programId:program,programName:'Coffee',versionNumber:1,isExclusive:true,reward:{type:'fixed',amount:50}}
    const reward = (await db.query(`insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms) values($1,$2,'phone:+639171234567',$3) returning id`,[t,program,terms])).rows[0].id
    const challenge = (await db.query(`insert into loyalty_otp_challenges(tenant_id,phone_hash,code_hash,entitlement_id,expires_at,verified_at) values($1,$2,$2,$3,now()+interval '5 minutes',now()) returning id`,[t,'b'.repeat(64),reward])).rows[0].id
    const hash='a'.repeat(64)
    await db.query(`insert into loyalty_verified_claims(tenant_id,challenge_id,entitlement_id,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '2 minutes')`,[t,challenge,reward,hash])
    const quoteId='44444444-4444-4444-8444-444444444444'
    const snapshot={entitlementId:reward,paymentPolicy:{totalCentavos:5000,allowedMethods:[{id:'cash',kind:'cash',requiresReference:false}]},items:[]}
    const issue=async(who=actor,token=hash,id=quoteId)=> (await db.query('select issue_loyalty_pos_quote($1,$2,$3,$4,$5,$6,$7,$8) as result',[t,who,token,null,id,'platform_supabase',5000,snapshot])).rows[0].result
    const cancelled='66666666-6666-4666-8666-666666666666'
    assert.equal((await db.query('select release_loyalty_pos_quote($1,$2,$3) as applied',[t,actor,cancelled])).rows[0].applied,true)
    await assert.rejects(issue(actor,hash,cancelled),/cancelled/,'A delayed request cannot recreate a cancelled hold')
    const first=await issue()
    assert.equal(first.quoteId,quoteId)
    assert.deepEqual(await issue(),first,'Lost quote responses recover the same hold')
    await assert.rejects(issue(actor,hash,'55555555-5555-4555-8555-555555555555'),/already used/)
    assert.equal((await db.query('select status from loyalty_entitlements where id=$1',[reward])).rows[0].status,'reserved')
    await assert.rejects(issue(actor,'c'.repeat(64)),/claim/i)
    const release=async()=> (await db.query('select release_loyalty_pos_quote($1,$2,$3) as applied',[t,actor,quoteId])).rows[0].applied
    assert.equal(await release(),true)
    assert.equal(await release(),true)
    assert.equal((await db.query('select status from loyalty_entitlements where id=$1',[reward])).rows[0].status,'issued')
    await assert.rejects(issue(),/unavailable/)
    await db.query("update loyalty_reservations set status='held',expires_at=now()-interval '1 second' where token_hash=$1",[hash])
    await db.query("update loyalty_entitlements set status='reserved' where id=$1",[reward])
    assert.equal((await db.query('select expire_loyalty_reservations($1) as n',[t])).rows[0].n,1)
    assert.equal((await db.query('select status from loyalty_entitlements where id=$1',[reward])).rows[0].status,'issued')
    await db.exec('set role authenticated')
    await assert.rejects(issue(),/permission denied/)
    console.log('Loyalty quote and release SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
