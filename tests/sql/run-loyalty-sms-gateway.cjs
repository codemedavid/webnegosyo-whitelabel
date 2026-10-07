// Gateway heartbeat + server (Semaphore) fallback dispatch. PGlite is installed
// outside the repo: NODE_PATH=<dir>/node_modules node tests/sql/run-loyalty-sms-gateway.cjs
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
  '20260910140000_loyalty_sms_ack_authorization.sql']
const UNDER_TEST = '20261004120000_loyalty_sms_gateway.sql'

async function main() {
  const db = new PGlite()
  const tenant=randomUUID(), other=randomUUID(), actor=randomUUID(), device=randomUUID(), hash='a'.repeat(64)
  const denied={ok:false,error:'request_denied'}
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key); create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table tenant_secrets(tenant_id uuid primary key, lalamove_api_key text);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${tenant}'),('${other}'); insert into auth.users values('${actor}');
      insert into app_users values('${actor}','${tenant}','admin',true,null,null);`)
    const files=process.argv.includes('--baseline')?MIGRATIONS:[...MIGRATIONS,UNDER_TEST]
    for (const name of files) await db.exec(readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8'))
    await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
    await db.query('insert into loyalty_sms_devices(device_id,tenant_id,actor_id,credential_hash) values($1,$2,$3,$4)',[device,tenant,actor,hash])

    async function fixture(t=tenant) {
      const c=randomUUID()
      await db.query("insert into loyalty_otp_challenges(id,tenant_id,phone_hash,code_hash,expires_at) values($1,$2,$3,$3,clock_timestamp()+interval '5 minutes')",[c,t,hash])
      const job=(await db.query("insert into loyalty_sms_outbox(tenant_id,challenge_id,payload_encrypted) values($1,$2,'envelope') returning id",[t,c])).rows[0].id
      return { challenge:c, job }
    }
    const status=(t=tenant,w=60)=>rpc('loyalty_sms_sender_status',[t,w])
    const job=async id=>(await db.query('select * from loyalty_sms_outbox where id=$1',[id])).rows[0]

    // 1. Heartbeat: a claim marks the device online; nothing else does.
    assert.deepEqual(await status(),{ok:true,gatewayOnline:false,lastSeenAt:null},'Never-polled store is offline')
    await rpc('claim_loyalty_sms_job',[tenant,actor,device,hash])
    const online=await status()
    assert.equal(online.gatewayOnline,true,'A claim poll is a heartbeat')
    assert.ok(Number.isFinite(Date.parse(online.lastSeenAt)))
    assert.equal((await status(other)).gatewayOnline,false,'Heartbeats are tenant scoped')
    await rpc('claim_loyalty_sms_job',[tenant,actor,randomUUID(),hash])
    assert.equal(Number((await db.query('select count(*) n from loyalty_sms_device_heartbeats')).rows[0].n),1,'Denied claims never heartbeat')
    await db.query("update loyalty_sms_device_heartbeats set last_seen_at=clock_timestamp()-interval '61 seconds'")
    assert.equal((await status()).gatewayOnline,false,'Stale heartbeat reads offline')
    assert.equal((await status(tenant,120)).gatewayOnline,true,'Window is the caller\'s')
    await db.query("update loyalty_sms_device_heartbeats set last_seen_at=clock_timestamp()")
    await db.query('update loyalty_sms_devices set enabled=false where device_id=$1',[device])
    assert.equal((await status()).gatewayOnline,false,'A revoked phone is never online')
    await db.query('update loyalty_sms_devices set enabled=true where device_id=$1',[device])
    // Throttled: a second poll inside 10s must not rewrite the row.
    const before=(await db.query('select last_seen_at from loyalty_sms_device_heartbeats')).rows[0].last_seen_at
    await rpc('claim_loyalty_sms_job',[tenant,actor,device,hash])
    assert.deepEqual((await db.query('select last_seen_at from loyalty_sms_device_heartbeats')).rows[0].last_seen_at,before,'Heartbeat writes are throttled')

    // 2. Server dispatch takes a queued job exactly once.
    const begin=(t,c)=>rpc('begin_loyalty_sms_server_dispatch',[t,c])
    const finish=(t,j,o)=>rpc('finish_loyalty_sms_server_dispatch',[t,j,o])
    await db.exec("update loyalty_sms_outbox set status='failed' where status in ('queued','claimed')")
    const a=await fixture()
    const grant=await begin(tenant,a.challenge)
    assert.deepEqual(grant,{ok:true,jobId:a.job,payloadEncrypted:'envelope'})
    const started=await job(a.job)
    assert.equal(started.transport,'semaphore')
    assert.equal(started.status,'claimed')
    assert.ok(started.dispatch_started_at)
    assert.deepEqual(await begin(tenant,a.challenge),denied,'Payload is released once')
    assert.deepEqual(await rpc('claim_loyalty_sms_job',[tenant,actor,device,hash]),{ok:false,error:'no_job'},'A phone never claims a server job')
    assert.deepEqual(await finish(other,a.job,'sent'),denied,'Finish is tenant scoped')
    assert.deepEqual(await finish(tenant,a.job,'bogus'),denied)
    assert.deepEqual(await finish(tenant,a.job,'sent'),{ok:true})
    assert.equal((await job(a.job)).status,'sent')
    assert.ok((await job(a.job)).sent_at)
    assert.deepEqual(await finish(tenant,a.job,'sent'),{ok:true},'Exact finish retry is idempotent')
    assert.deepEqual(await finish(tenant,a.job,'failed'),denied,'Conflicting finish refused')

    // 3. A job a phone already holds cannot be taken by the server, and vice versa.
    const b=await fixture()
    const lease=await rpc('claim_loyalty_sms_job',[tenant,actor,device,hash])
    assert.equal(lease.jobId,b.job)
    assert.deepEqual(await begin(tenant,b.challenge),denied,'Phone-claimed job stays with the phone')
    assert.deepEqual(await finish(tenant,b.job,'sent'),denied,'Server cannot finish a phone job')

    // 4. Dead challenges and foreign tenants are refused.
    for (const mode of ['expired','verified','exhausted','foreign','missing']) {
      const c=await fixture()
      if (mode==='expired') await db.query("update loyalty_otp_challenges set expires_at=clock_timestamp()-interval '1 second' where id=$1",[c.challenge])
      if (mode==='verified') await db.query('update loyalty_otp_challenges set verified_at=clock_timestamp() where id=$1',[c.challenge])
      if (mode==='exhausted') await db.query('update loyalty_otp_challenges set attempts=max_attempts where id=$1',[c.challenge])
      const t=mode==='foreign'?other:tenant
      assert.deepEqual(await begin(t,mode==='missing'?randomUUID():c.challenge),denied,mode)
      assert.equal((await job(c.job)).status,'queued',`${mode} leaves the job untouched`)
    }

    // 5. Privileges: service role only, nothing for anon/authenticated.
    for (const fn of ['begin_loyalty_sms_server_dispatch(uuid,uuid)','finish_loyalty_sms_server_dispatch(uuid,uuid,text)','loyalty_sms_sender_status(uuid,integer)']) {
      for (const role of ['anon','authenticated']) {
        assert.equal((await db.query(`select has_function_privilege('${role}','public.${fn}','execute') ok`)).rows[0].ok,false,`${role} cannot run ${fn}`)
      }
      assert.equal((await db.query(`select has_function_privilege('service_role','public.${fn}','execute') ok`)).rows[0].ok,true)
    }
    for (const col of ['semaphore_api_key','semaphore_sender_name']) {
      assert.equal(Number((await db.query("select count(*) n from information_schema.columns where table_name='tenant_secrets' and column_name=$1",[col])).rows[0].n),1)
    }
    console.log('Loyalty SMS gateway SQL regressions passed')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exit(1) })
