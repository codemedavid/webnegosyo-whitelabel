const { PGlite } = require('@electric-sql/pglite')
const { readFileSync, existsSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const assert = require('node:assert/strict')
async function main() {
  const db = new PGlite()
  const tenant=randomUUID(), actor=randomUUID(), device=randomUUID(), device2=randomUUID(), hash='a'.repeat(64)
  const denied={ok:false,error:'request_denied'}, deviceDenied={ok:false,error:'device_denied'}
  const auth=[tenant,actor,device,hash]
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result
  const claim=(credentials=auth)=>rpc('claim_loyalty_sms_job',credentials)
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key); create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${tenant}'); insert into auth.users values('${actor}');
      insert into app_users values('${actor}','${tenant}','admin',false,array['loyalty_manage'],null);`)
    for(const name of ['20260905140000_loyalty_programs.sql','20260905141000_loyalty_versions_cascade.sql',
      '20260906150000_loyalty_reversal_accounting.sql','20260906160000_loyalty_access.sql',
      '20260906170000_loyalty_pos_settlement.sql','20260907120000_loyalty_quote_immutability.sql',
      '20260908120000_loyalty_verified_claims.sql','20260908130000_loyalty_challenge_issuance.sql',
      '20260909120000_loyalty_sms_delivery.sql','20260909130000_loyalty_sms_device_management.sql',
      '20260910140000_loyalty_sms_ack_authorization.sql']) {
      const file=path.resolve(__dirname,'../../supabase/migrations',name)
      if(existsSync(file)) await db.exec(readFileSync(file,'utf8'))
    }
    assert.deepEqual(await claim(),denied,'Unregistered devices cannot claim')
    await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
    for(const d of [device,device2]) await db.query('insert into loyalty_sms_devices(device_id,tenant_id,actor_id,credential_hash) values($1,$2,$3,$4)',[d,tenant,actor,hash])
    async function fixture() {
      const c=randomUUID()
      await db.query("insert into loyalty_otp_challenges(id,tenant_id,phone_hash,code_hash,expires_at) values($1,$2,$3,$3,clock_timestamp()+interval '5 minutes')",[c,tenant,hash])
      return (await db.query("insert into loyalty_sms_outbox(tenant_id,challenge_id,payload_encrypted) values($1,$2,'encrypted-test-envelope') returning id",[tenant,c])).rows[0].id
    }
    const first=await fixture(), second=await fixture()
    const lease=await claim()
    assert.equal(lease.ok,true)
    assert.ok([first,second].includes(lease.jobId))
    assert.deepEqual(Object.keys(lease).sort(),['challengeId','expiresAt','jobId','leaseExpiresAt','leaseToken','ok'])
    assert.deepEqual(await claim(),lease,'Polling retry retains one current lease')
    assert.notEqual((await claim([tenant,actor,device2,hash])).jobId,lease.jobId)
    const authorize=(l=lease,a=auth)=>rpc('authorize_loyalty_sms_dispatch',[...a,l.jobId,l.leaseToken])
    const dispatch=await authorize()
    assert.equal(dispatch.ok,true)
    assert.equal(dispatch.payloadEncrypted,'encrypted-test-envelope')
    assert.deepEqual(await authorize(),denied,'Dispatch authorization releases payload only once')
    const finish=(l=lease,outcome='sent',a=auth)=>rpc('finish_loyalty_sms_job',[...a,l.jobId,l.leaseToken,outcome])
    await db.query("update loyalty_sms_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[lease.jobId])
    assert.deepEqual(await finish(),{ok:true},'Started dispatch can be acknowledged after lease expires')
    assert.deepEqual(await finish(),{ok:true},'Exact acknowledgement retry is idempotent')
    assert.deepEqual(await finish(lease,'failed'),denied,'Conflicting acknowledgement denied')
    for(const a of [[randomUUID(),actor,device,hash],[tenant,randomUUID(),device,hash],
      [tenant,actor,randomUUID(),hash],[tenant,actor,device,'b'.repeat(64)],[tenant,actor,device,null]]) {
      assert.deepEqual(await claim(a),denied)
      assert.deepEqual(await authorize(lease,a),denied)
      assert.deepEqual(await finish(lease,'sent',a),deviceDenied)
    }
    for(const change of ["update app_users set permissions='{}'","update app_users set role='customer'",
      'update loyalty_sms_devices set enabled=false','update tenants set loyalty_shadow=true','update tenants set loyalty_enabled=false',
      `update app_users set tenant_id='${randomUUID()}'`]) {
      await db.exec(change)
      assert.deepEqual(await claim(),denied,change)
      assert.deepEqual(await authorize(),denied,change)
      assert.deepEqual(await finish(),deviceDenied,change)
      await db.query("update app_users set role='admin',permissions=array['loyalty_manage'],tenant_id=$1",[tenant])
      await db.exec('update loyalty_sms_devices set enabled=true; update tenants set loyalty_enabled=true,loyalty_shadow=false')
    }
    await db.exec('delete from loyalty_sms_outbox')
    for(const change of ['is_owner=true,permissions=\'{}\'','permissions=null',"role='superadmin',permissions='{}',tenant_id=null"]) {
      await fixture(); await db.exec(`update app_users set ${change}`)
      assert.equal((await claim()).ok,true,change)
      await db.query("update app_users set role='admin',is_owner=false,permissions=array['loyalty_manage'],tenant_id=$1",[tenant])
      await db.exec('delete from loyalty_sms_outbox')
    }
    for(const invalid of ["expires_at=clock_timestamp()-interval '1 second'",'verified_at=clock_timestamp()','attempts=max_attempts']) {
      const id=await fixture()
      await db.query(`update loyalty_otp_challenges set ${invalid} where id=(select challenge_id from loyalty_sms_outbox where id=$1)`,[id])
      assert.deepEqual(await claim(),{ok:false,error:'no_job'},invalid)
      await db.exec('delete from loyalty_sms_outbox')
      await fixture(); const l=await claim()
      await db.query(`update loyalty_otp_challenges set ${invalid} where id=$1`,[l.challengeId])
      assert.deepEqual(await authorize(l),denied,`Invalidated between claim/dispatch: ${invalid}`)
      await db.exec('delete from loyalty_sms_outbox')
    }
    await fixture(); const stale=await claim()
    await db.query("update loyalty_sms_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[stale.jobId])
    const other=[tenant,actor,device2,hash], reclaimed=await claim(other)
    assert.equal(reclaimed.jobId,stale.jobId)
    assert.notEqual(reclaimed.leaseToken,stale.leaseToken)
    assert.deepEqual(await authorize(stale),denied)
    assert.deepEqual(await finish(reclaimed,'sent',other),denied,'Cannot finish before dispatch')
    assert.deepEqual(await authorize({...reclaimed,leaseToken:randomUUID()},other),denied)
    assert.equal((await authorize(reclaimed,other)).ok,true)
    await db.query("update loyalty_sms_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[reclaimed.jobId])
    assert.deepEqual(await claim(),{ok:false,error:'no_job'},'Started SMS is never reclaimed after expiry')
    assert.deepEqual(await authorize(reclaimed,other),denied)
    assert.deepEqual(await finish(reclaimed,'raw phone error',other),denied)
    assert.deepEqual(await finish(reclaimed,'failed',other),{ok:true})
    assert.deepEqual(await finish(reclaimed,'failed',other),{ok:true})
    assert.equal((await db.query('select error from loyalty_sms_outbox where id=$1',[reclaimed.jobId])).rows[0].error,'delivery_failed')
    await db.exec('delete from loyalty_sms_outbox')
    await fixture(); const capped=await claim()
    assert.ok(new Date(capped.leaseExpiresAt)<=new Date(capped.expiresAt))
    assert.ok(new Date(capped.leaseExpiresAt)-Date.now()<=30000)
    await db.exec('delete from loyalty_sms_outbox')
    const short=await fixture()
    await db.query("update loyalty_otp_challenges set expires_at=clock_timestamp()+interval '10 seconds' where id=(select challenge_id from loyalty_sms_outbox where id=$1)",[short])
    const shortLease=await claim()
    assert.equal(shortLease.leaseExpiresAt,shortLease.expiresAt,'Lease is capped by OTP expiry')
    await db.exec('delete from loyalty_sms_outbox')
    // Forced write errors must not leave a lease, dispatch marker, or completion.
    await fixture()
    await db.exec(`create function fail_delivery_write() returns trigger language plpgsql as $$ begin raise exception 'forced delivery write failure'; end $$;
      create trigger fail_delivery_write before update on loyalty_sms_outbox for each row execute function fail_delivery_write()`)
    await assert.rejects(claim(),/forced delivery write failure/)
    assert.equal((await db.query('select lease_token from loyalty_sms_outbox')).rows[0].lease_token,null)
    await db.exec('alter table loyalty_sms_outbox disable trigger fail_delivery_write')
    const rollback=await claim()
    await db.exec('alter table loyalty_sms_outbox enable trigger fail_delivery_write')
    await assert.rejects(authorize(rollback),/forced delivery write failure/)
    assert.equal((await db.query('select dispatch_started_at from loyalty_sms_outbox')).rows[0].dispatch_started_at,null)
    await db.exec('alter table loyalty_sms_outbox disable trigger fail_delivery_write')
    assert.equal((await authorize(rollback)).ok,true)
    await db.exec('alter table loyalty_sms_outbox enable trigger fail_delivery_write')
    await assert.rejects(finish(rollback),/forced delivery write failure/)
    assert.equal((await db.query('select status from loyalty_sms_outbox')).rows[0].status,'claimed')
    await db.exec('drop trigger fail_delivery_write on loyalty_sms_outbox')
    assert.deepEqual(await finish(rollback),{ok:true})
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(claim(),/permission denied/)
      await assert.rejects(authorize(rollback),/permission denied/)
      await assert.rejects(finish(rollback),/permission denied/)
      for(const table of ['loyalty_sms_devices','loyalty_sms_outbox']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('delete from loyalty_sms_outbox'); await fixture()
    await db.exec('set role service_role')
    const serviceLease=await claim()
    assert.equal(serviceLease.ok,true)
    assert.equal((await authorize(serviceLease)).ok,true)
    assert.deepEqual(await finish(serviceLease),{ok:true})
    assert.equal((await db.query('select * from loyalty_sms_devices')).rows.length,2)
    await assert.rejects(db.exec('update loyalty_sms_devices set enabled=false'),/permission denied/)
    await db.exec('reset role')
    await db.exec('delete from loyalty_sms_outbox')
    const program=(await db.query("insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id",[tenant])).rows[0].id
    const reward=(await db.query("insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms) values($1,$2,'phone:+639171234567','{}') returning id",[tenant,program])).rows[0].id
    const issuance=[tenant,randomUUID(),reward,'phone:+639171234567',hash,'b'.repeat(64),'c'.repeat(64),`v1.${'A'.repeat(16)}.YQ.${'A'.repeat(22)}`]
    assert.equal((await rpc('issue_loyalty_challenge',issuance)).ok,true)
    const superseded=await claim()
    await db.exec('truncate loyalty_issuance_rate_events')
    const resend=[...issuance]; resend[1]=randomUUID(); resend[5]='d'.repeat(64)
    assert.equal((await rpc('issue_loyalty_challenge',resend)).ok,true)
    assert.deepEqual(await authorize(superseded),denied,'Issuance supersession between claim and dispatch prevents sending old OTP')
    await db.exec('delete from loyalty_sms_outbox')
    for(let i=0;i<30;i++) {
      const staleId=await fixture()
      await db.query("update loyalty_sms_outbox set created_at=clock_timestamp()-interval '1 hour' where id=$1",[staleId])
      await db.query("update loyalty_otp_challenges set expires_at=clock_timestamp()-interval '1 second' where id=(select challenge_id from loyalty_sms_outbox where id=$1)",[staleId])
    }
    const liveAfterStale=await fixture()
    assert.equal((await claim()).jobId,liveAfterStale,'Stale queued history must not consume the live candidate limit')
    console.log('Loyalty SMS delivery SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
