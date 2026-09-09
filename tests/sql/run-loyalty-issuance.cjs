// Real isolated PostgreSQL behavior tests. PGlite is installed outside the repo.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const assert = require('node:assert/strict')
async function main() {
  const db = new PGlite()
  const tenant = randomUUID(), foreign = randomUUID()
  const hash = n => n.toString(16).padStart(64,'0')
  const denied = {ok:false,error:'request_denied'}
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key); create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${tenant}'),('${foreign}');`)
    for (const name of ['20260905140000_loyalty_programs.sql','20260905141000_loyalty_versions_cascade.sql',
      '20260906150000_loyalty_reversal_accounting.sql','20260906160000_loyalty_access.sql',
      '20260906170000_loyalty_pos_settlement.sql','20260907120000_loyalty_quote_immutability.sql',
      '20260908120000_loyalty_verified_claims.sql','20260908130000_loyalty_challenge_issuance.sql']) {
      await db.exec(readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8'))
    }
    await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
    const programs = {}
    for (const t of [tenant,foreign]) programs[t]=(await db.query("insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id",[t])).rows[0].id
    let serial=0
    async function fixture(t=tenant) {
      const n=++serial
      const key=`phone:+639${String(n).padStart(9,'0')}`
      const reward=(await db.query("insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms) values($1,$2,$3,'{}') returning id",[t,programs[t],key])).rows[0].id
      return [t,randomUUID(),reward,key,hash(n),hash(10000+n),hash(20000+n),`v1.${'A'.repeat(16)}.YQ.${'A'.repeat(22)}`]
    }
    const issue=async args=>(await db.query('select issue_loyalty_challenge($1,$2,$3,$4,$5,$6,$7,$8) as result',args)).rows[0].result
    const count=async table=>Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n)
    const first=await fixture()
    const result=await issue(first)
    assert.equal(result.ok,true)
    assert.deepEqual(Object.keys(result).sort(),['challengeId','expiresAt','ok'])
    assert.equal(result.challengeId,first[1])
    const challenge=(await db.query('select * from loyalty_otp_challenges where id=$1',[first[1]])).rows[0]
    assert.equal(new Date(challenge.expires_at)-new Date(challenge.created_at),300000)
    assert.equal(challenge.max_attempts,5)
    const job=(await db.query('select * from loyalty_sms_outbox where challenge_id=$1',[first[1]])).rows[0]
    assert.equal(job.transport,'android_sim')
    assert.equal(job.payload_encrypted,first[7])
    assert.equal(job.status,'queued')
    assert.equal((await db.query('select verify_loyalty_claim($1,$2,$3,$4,$5,$6) as result',[tenant,first[1],first[5],hash(9999),first[3],first[4]])).rows[0].result.ok,true)
    assert.deepEqual(await issue(first),result,'Exact retry returns original metadata after verification')
    assert.equal(await count('loyalty_sms_outbox'),1)
    for (const index of [2,3,4,5,6,7]) {
      const retry=[...first]
      retry[index]=index===2?randomUUID():index===3?'phone:+639999999999':index===7?first[7].replace('.YQ.','.Yg.'):hash(999)
      assert.deepEqual(await issue(retry),denied,'Challenge IDs cannot be reused with different parameters')
    }
    const stale=await fixture()
    const original=await issue(stale)
    await db.query("update loyalty_otp_challenges set expires_at=now()-interval '1 second' where id=$1",[stale[1]])
    assert.equal((await issue(stale)).challengeId,original.challengeId)
    assert.deepEqual(await issue(stale),original,'Retry returns original metadata even when the challenge has expired')
    const resend=await fixture()
    await issue(resend)
    const next=[...resend]; next[1]=randomUUID(); next[5]=hash(98989)
    assert.deepEqual(await issue(next),denied,'Phone resends have a 60 second cooldown')
    await db.query("update loyalty_issuance_rate_events set created_at=now()-interval '61 seconds' where tenant_id=$1 and phone_hash=$2",[tenant,resend[4]])
    assert.equal((await issue(next)).ok,true)
    assert.deepEqual((await db.query('select verify_loyalty_claim($1,$2,$3,$4,$5,$6) as result',[tenant,resend[1],resend[5],hash(9998),resend[3],resend[4]])).rows[0].result,{ok:false,error:'invalid_claim'},'Resend invalidates old code')
    assert.equal((await db.query('select status from loyalty_sms_outbox where challenge_id=$1',[resend[1]])).rows[0].status,'failed')
    for (const payload of [`v1.${'A'.repeat(16)}.A.${'A'.repeat(22)}`,`v1.${'A'.repeat(16)}.YR.${'A'.repeat(22)}`,`v1.${'A'.repeat(16)}.YQ.${'A'.repeat(21)}B`]) {
      const bad=await fixture(); bad[7]=payload
      assert.deepEqual(await issue(bad),denied,'Envelope must contain canonical base64url')
    }
    // Seed time windows rather than sleep. Assert the precise boundary for each
    // independent policy; unrelated phone/IP dimensions have distinct hashes.
    for (const [dimension,limit,age] of [
      ['phone',3,'2 minutes'],['phone',10,'2 hours'],['ip',30,'2 minutes'],
      ['ip',100,'2 hours'],['tenant',60,'10 seconds'],['tenant',1000,'2 minutes'],
    ]) {
      await db.exec('truncate loyalty_issuance_rate_events')
      const args=await fixture()
      await db.query(`insert into loyalty_issuance_rate_events(tenant_id,phone_hash,ip_hash,created_at)
        select $1,case when $2='phone' then $3 else repeat(md5(i::text),2) end,
        case when $2='ip' then $4 else repeat(md5(('ip'||i)::text),2) end,
        clock_timestamp()-$5::interval from generate_series(1,$6::int) i`,
        [dimension==='ip'?foreign:tenant,dimension,args[4],args[6],age,limit])
      const before=await count('loyalty_issuance_rate_events')
      assert.deepEqual(await issue(args),denied,`${dimension} ${limit} / ${age} limit`)
      assert.equal(await count('loyalty_issuance_rate_events'),before,'Saturated requests need not add events')
      await db.exec('delete from loyalty_issuance_rate_events where id=(select min(id) from loyalty_issuance_rate_events)')
      assert.equal((await issue(args)).ok,true,`${dimension} accepts the last allowed request`)
      assert.equal(await count('loyalty_issuance_rate_events'),limit)
      const rowsBefore=await count('loyalty_sms_outbox')
      const retry=await issue(args)
      assert.equal(retry.ok,true,'An exact retry bypasses quota without a new SMS or event')
      assert.equal(await count('loyalty_sms_outbox'),rowsBefore)
      assert.equal(await count('loyalty_issuance_rate_events'),limit)
    }
    await db.exec('truncate loyalty_issuance_rate_events')
    for (const mode of ['wrong-key','foreign-reward','missing-reward','reserved','consumed','expired','voided','stale','shadow','disabled','missing-tenant']) {
      const args=await fixture()
      if (mode==='wrong-key') args[3]='phone:+639999999999'
      if (mode==='foreign-reward') args[2]=(await fixture(foreign))[2]
      if (mode==='missing-reward') args[2]=randomUUID()
      if (mode==='missing-tenant') args[0]=randomUUID()
      if (['reserved','consumed','expired','voided'].includes(mode)) await db.query('update loyalty_entitlements set status=$1 where id=$2',[mode,args[2]])
      if (mode==='stale') await db.query("update loyalty_entitlements set expires_at=now()-interval '1 second' where id=$1",[args[2]])
      if (mode==='shadow') await db.query('update tenants set loyalty_shadow=true where id=$1',[tenant])
      if (mode==='disabled') await db.query('update tenants set loyalty_enabled=false where id=$1',[tenant])
      const events=await count('loyalty_issuance_rate_events'),jobs=await count('loyalty_sms_outbox')
      assert.deepEqual(await issue(args),denied,mode)
      assert.equal(await count('loyalty_issuance_rate_events'),events+1,`${mode} consumes abuse budget`)
      assert.equal(await count('loyalty_sms_outbox'),jobs)
      await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
    }
    const restored=await fixture()
    await db.query("update loyalty_entitlements set status='restored' where id=$1",[restored[2]])
    assert.equal((await issue(restored)).ok,true)
    const malformed=await fixture()
    const badCases=[]
    for (let i=0;i<8;i++) badCases.push([i,null])
    for (const i of [4,5,6]) for (const value of ['', 'a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64)]) badCases.push([i,value])
    for (const value of ['','phone:+63912345678','phone:+6391234567890','phone:+628171234567','+639171234567']) badCases.push([3,value])
    for (const value of ['','raw phone and code','v2.'+malformed[7].slice(3),malformed[7]+'\n',`v1.${'A'.repeat(16)}.${'A'.repeat(4096)}.${'A'.repeat(22)}`]) badCases.push([7,value])
    const beforeMalformed=await count('loyalty_issuance_rate_events')
    for (const [index,value] of badCases) {
      const args=[...malformed];args[index]=value
      assert.deepEqual(await issue(args),denied,`Malformed parameter ${index}`)
    }
    assert.equal(await count('loyalty_issuance_rate_events'),beforeMalformed,'Malformed data is not persisted')
    await db.exec('truncate loyalty_issuance_rate_events')
    const conflict=[...first];conflict[3]='phone:+639999999999'
    assert.deepEqual(await issue(conflict),denied)
    assert.equal(await count('loyalty_issuance_rate_events'),1,'Mismatched ID reuse consumes budget when not already saturated')
    const crossRetry=[...first];crossRetry[0]=foreign
    assert.deepEqual(await issue(crossRetry),denied,'Challenge ID cannot be retried in another tenant')
    const privateColumns=(await db.query("select table_name,column_name from information_schema.columns where table_name in ('loyalty_otp_challenges','loyalty_issuance_rate_events')")).rows
    assert.equal(privateColumns.some(row=>['customer_key','phone','code','ip_address'].includes(row.column_name)),false,'New OTP and abuse records contain no raw identity or code')

    await db.exec('truncate loyalty_issuance_rate_events')
    const leased=await fixture(); await issue(leased)
    await db.query("update loyalty_sms_outbox set status='claimed',claimed_by_device='test-device',claimed_at=now() where challenge_id=$1",[leased[1]])
    await db.exec('truncate loyalty_issuance_rate_events')
    const leasedNext=[...leased];leasedNext[1]=randomUUID();leasedNext[5]=hash(788)
    assert.equal((await issue(leasedNext)).ok,true)
    assert.equal((await db.query('select status from loyalty_sms_outbox where challenge_id=$1',[leased[1]])).rows[0].status,'claimed','Leased SMS cannot be unsent')
    assert.equal((await db.query('select expires_at<=clock_timestamp() as expired from loyalty_otp_challenges where id=$1',[leased[1]])).rows[0].expired,true)
    const verifiedBefore=(await db.query('select verified_at,expires_at from loyalty_otp_challenges where id=$1',[first[1]])).rows[0]
    const afterVerified=[...first];afterVerified[1]=randomUUID();afterVerified[5]=hash(787)
    assert.equal((await issue(afterVerified)).ok,true)
    assert.deepEqual((await db.query('select verified_at,expires_at from loyalty_otp_challenges where id=$1',[first[1]])).rows[0],verifiedBefore,'Resends preserve verified claims')

    await db.exec('truncate loyalty_issuance_rate_events')
    const rollback=await fixture();await issue(rollback)
    await db.exec('truncate loyalty_issuance_rate_events')
    const beforeRollback={challenges:await count('loyalty_otp_challenges'),jobs:await count('loyalty_sms_outbox'),events:await count('loyalty_issuance_rate_events')}
    const old=(await db.query('select expires_at from loyalty_otp_challenges where id=$1',[rollback[1]])).rows[0]
    await db.exec(`create function fail_issue_job() returns trigger language plpgsql as $$ begin raise exception 'outbox failure'; end $$;
      create trigger fail_issue_job before insert on loyalty_sms_outbox for each row execute function fail_issue_job()`)
    const failed=[...rollback];failed[1]=randomUUID();failed[5]=hash(786)
    await assert.rejects(issue(failed),/outbox failure/)
    assert.deepEqual({challenges:await count('loyalty_otp_challenges'),jobs:await count('loyalty_sms_outbox'),events:await count('loyalty_issuance_rate_events')},beforeRollback,'Last-write failure rolls back challenge, job and event')
    assert.deepEqual((await db.query('select expires_at from loyalty_otp_challenges where id=$1',[rollback[1]])).rows[0],old,'Supersession also rolls back')
    assert.equal((await db.query('select status from loyalty_sms_outbox where challenge_id=$1',[rollback[1]])).rows[0].status,'queued')
    await db.exec('drop trigger fail_issue_job on loyalty_sms_outbox')
    assert.equal((await issue(failed)).ok,true)
    const eventTime=(await db.query('select created_at from loyalty_issuance_rate_events where phone_hash=$1',[failed[4]])).rows[0].created_at
    assert.equal(new Date(eventTime).getTime(),new Date((await db.query('select created_at from loyalty_otp_challenges where id=$1',[failed[1]])).rows[0].created_at).getTime(),'Successful event starts at actual issuance time')
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(issue(failed),/permission denied/)
      for (const table of ['loyalty_issuance_rate_events','loyalty_otp_challenges','loyalty_sms_outbox']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal((await issue(failed)).ok,true)
    assert.equal((await db.query('select count(*) from loyalty_issuance_rate_events')).rows.length,1)
    for (const sql of ['delete from loyalty_issuance_rate_events','update loyalty_issuance_rate_events set created_at=now()',`insert into loyalty_issuance_rate_events(tenant_id,phone_hash,ip_hash) values('${tenant}','${hash(1)}','${hash(2)}')`]) await assert.rejects(db.exec(sql),/permission denied/)
    await db.exec('reset role')
    assert.equal(await count('loyalty_reservations'),0)
    assert.equal(await count('loyalty_verified_claims'),1)
    const snapshot=await fixture()
    await db.exec('begin isolation level repeatable read')
    try { assert.deepEqual(await issue(snapshot),denied,'Snapshot isolation cannot bypass budgets after an advisory lock wait') }
    finally { await db.exec('rollback') }
    console.log('Loyalty issuance SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
