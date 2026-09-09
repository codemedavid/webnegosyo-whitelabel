const { PGlite } = require('@electric-sql/pglite')
const { readFileSync, existsSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const assert = require('node:assert/strict')
async function main() {
  const db=new PGlite(), tenant=randomUUID(), actor=randomUUID(), device=randomUUID(), hash='a'.repeat(64)
  const denied={ok:false,error:'request_denied'}, deviceDenied={ok:false,error:'device_denied'}, ok={ok:true}
  const rpc=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result
  const enroll=(d=device,a=actor,t=tenant,h=hash)=>rpc('enroll_loyalty_sms_device',[t,a,d,h])
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key); create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${tenant}'); insert into auth.users values('${actor}');
      insert into app_users values('${actor}','${tenant}','admin',true,'{}',null);`)
    for(const name of ['20260905140000_loyalty_programs.sql','20260905141000_loyalty_versions_cascade.sql',
      '20260906150000_loyalty_reversal_accounting.sql','20260906160000_loyalty_access.sql',
      '20260906170000_loyalty_pos_settlement.sql','20260907120000_loyalty_quote_immutability.sql',
      '20260908120000_loyalty_verified_claims.sql','20260908130000_loyalty_challenge_issuance.sql',
      '20260909120000_loyalty_sms_delivery.sql','20260909130000_loyalty_sms_device_management.sql',
      '20260910140000_loyalty_sms_ack_authorization.sql']) {
      const file=path.resolve(__dirname,'../../supabase/migrations',name)
      if(existsSync(file)) await db.exec(readFileSync(file,'utf8'))
    }
    await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false; set role service_role')
    assert.deepEqual(await enroll(),ok,'Owner with no permissions can enroll their device')
    const revoke=(d=device,a=actor,t=tenant)=>rpc('revoke_loyalty_sms_device',[t,a,d])
    const audit=async()=>(await db.query('select * from loyalty_sms_device_audit')).rows
    assert.deepEqual(await enroll(),ok)
    assert.equal((await audit()).length,1,'Enrollment retry audits once')
    assert.deepEqual(await enroll(device,actor,tenant,'b'.repeat(64)),denied)
    for(const h of [null,'x','A'.repeat(64)]) assert.deepEqual(await enroll(randomUUID(),actor,tenant,h),denied)
    await db.exec('reset role')
    for(const change of ["is_owner=false,permissions=null","permissions=array['loyalty_manage']","role='staff',is_owner=true","role='admin',is_owner=true,tenant_id=null"]) {
      await db.exec(`update app_users set ${change}; set role service_role`)
      assert.deepEqual(await enroll(randomUUID()),denied,change)
      await db.exec('reset role')
    }
    await db.query("update app_users set role='admin',tenant_id=$1,is_owner=true,permissions='{}'",[tenant])
    await db.exec('set role service_role')
    const devices=[device]
    for(let i=0;i<4;i++) { const d=randomUUID(); devices.push(d); assert.deepEqual(await enroll(d),ok) }
    assert.deepEqual(await enroll(randomUUID()),denied,'Five enabled devices maximum')
    assert.deepEqual(await enroll(),ok,'Exact retry still works at cap')
    assert.equal((await audit()).length,5)
    assert.deepEqual(await revoke(),ok)
    assert.deepEqual(await revoke(),ok,'Revoke retry is idempotent')
    assert.equal((await audit()).length,6)
    assert.deepEqual(await enroll(),denied,'Revoked ID cannot be revived')
    assert.deepEqual(await enroll(randomUUID()),ok,'Revocation frees an enrollment slot')
    const live=devices[1], auth=[tenant,actor,live,hash]
    const claim=(a=auth)=>rpc('claim_loyalty_sms_job',a)
    const authorize=l=>rpc('authorize_loyalty_sms_dispatch',[...auth,l.jobId,l.leaseToken])
    const abandon=(j,d=live,a=actor,t=tenant)=>rpc('abandon_loyalty_sms_dispatch',[t,a,d,j])
    async function fixture() {
      await db.exec('reset role')
      const c=randomUUID()
      await db.query("insert into loyalty_otp_challenges(id,tenant_id,phone_hash,code_hash,expires_at) values($1,$2,$3,$3,clock_timestamp()+interval '5 minutes')",[c,tenant,hash])
      const j=(await db.query("insert into loyalty_sms_outbox(tenant_id,challenge_id,payload_encrypted) values($1,$2,'encrypted-test-envelope') returning id",[tenant,c])).rows[0].id
      await db.exec('set role service_role')
      return j
    }
    async function expire(l) {
      await db.exec('reset role')
      await db.query("update loyalty_otp_challenges set expires_at=clock_timestamp()-interval '1 second' where id=$1",[l.challengeId])
      await db.exec('set role service_role')
    }
    const job=await fixture(), lease=await claim()
    assert.equal(lease.jobId,job,'Enrolled device can claim real delivery work')
    assert.deepEqual(await claim([tenant,actor,device,hash]),denied,'Revoked device cannot deliver')
    assert.equal((await authorize(lease)).ok,true)
    assert.deepEqual(await abandon(job),denied,'Live OTP cannot be abandoned')
    await expire(lease)
    assert.deepEqual(await abandon(job,devices[2]),denied,'Wrong device cannot reconcile')
    assert.deepEqual(await abandon(job,live,randomUUID()),denied)
    assert.deepEqual(await abandon(job,live,actor,randomUUID()),denied)
    const auditBefore=(await audit()).length
    assert.deepEqual(await abandon(job),ok)
    assert.deepEqual(await abandon(job),ok)
    assert.equal((await audit()).length,auditBefore+1)
    assert.equal((await audit()).at(-1).reason,'unknown_outcome')
    assert.equal((await audit()).at(-1).job_id,job)
    assert.deepEqual(await authorize(lease),denied,'Abandoned job cannot release payload again')
    const nextJob=await fixture(), nextLease=await claim()
    assert.equal(nextLease.jobId,nextJob,'Abandonment frees device for a new job, without replay')
    await expire(nextLease)
    assert.deepEqual(await abandon(nextJob),denied,'Never-dispatched job cannot be abandoned')
    await db.exec('reset role; delete from loyalty_sms_outbox where dispatch_started_at is null; set role service_role')
    await fixture(); const sent=await claim()
    assert.equal((await authorize(sent)).ok,true)
    assert.deepEqual(await rpc('finish_loyalty_sms_job',[...auth,sent.jobId,sent.leaseToken,'sent']),ok)
    await expire(sent)
    assert.deepEqual(await abandon(sent.jobId),denied,'Sent outcome cannot be overwritten')
    const tenant2=randomUUID(), owner2=randomUUID(), foreignDevice=randomUUID()
    await db.exec('reset role')
    await db.query('insert into tenants(id,loyalty_enabled,loyalty_shadow) values($1,true,false)',[tenant2])
    await db.query('insert into auth.users values($1)',[owner2])
    await db.query("insert into app_users values($1,$2,'admin',true,'{}',null)",[owner2,tenant2])
    await db.exec('set role service_role')
    assert.deepEqual(await enroll(foreignDevice,owner2,tenant2),ok)
    assert.deepEqual(await enroll(foreignDevice),denied,'Cross-tenant device collision cannot overwrite')
    assert.deepEqual(await revoke(foreignDevice),denied)
    assert.deepEqual(await abandon(job,foreignDevice,owner2,tenant2),denied)
    await db.exec('reset role')
    await db.query("update app_users set role='superadmin',tenant_id=null where user_id=$1",[owner2])
    await db.exec('set role service_role')
    assert.deepEqual(await revoke(devices[2],owner2),ok,'Superadmin can revoke another owner device')
    const superDevice=randomUUID()
    assert.deepEqual(await enroll(superDevice,owner2),ok,'Superadmin enrolls itself across tenants')
    assert.deepEqual(await enroll(superDevice),denied,'Existing device cannot change actor')
    await db.exec('reset role')
    await db.query('update tenants set loyalty_enabled=false,loyalty_shadow=true where id=$1',[tenant])
    await db.exec('set role service_role')
    assert.deepEqual(await enroll(randomUUID()),denied,'Disabled/shadow tenant cannot enroll')
    assert.deepEqual(await revoke(live),ok,'Incident revocation works on disabled tenant')
    assert.deepEqual(await abandon(job),ok,'Reconcile retry works after revocation and tenant disable')
    await db.exec('reset role')
    await db.query('update tenants set loyalty_enabled=true,loyalty_shadow=false where id=$1',[tenant])
    await db.exec('set role service_role')
    assert.deepEqual(await authorize(sent),denied)
    assert.deepEqual(await rpc('finish_loyalty_sms_job',[...auth,sent.jobId,sent.leaseToken,'sent']),deviceDenied)
    // A failed audit insert must roll back its associated mutation atomically.
    await db.exec(`reset role;
      create function fail_device_audit() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end $$;
      create trigger fail_device_audit before insert on loyalty_sms_device_audit for each row execute function fail_device_audit();
      set role service_role`)
    const rollbackDevice=randomUUID()
    await assert.rejects(enroll(rollbackDevice),/forced audit failure/)
    assert.equal((await db.query('select * from loyalty_sms_devices where device_id=$1',[rollbackDevice])).rows.length,0)
    await assert.rejects(revoke(devices[3]),/forced audit failure/)
    assert.equal((await db.query('select enabled from loyalty_sms_devices where device_id=$1',[devices[3]])).rows[0].enabled,true)
    await fixture()
    const rollbackAuth=[tenant,actor,devices[3],hash], rollbackLease=await claim(rollbackAuth)
    assert.equal((await rpc('authorize_loyalty_sms_dispatch',[...rollbackAuth,rollbackLease.jobId,rollbackLease.leaseToken])).ok,true)
    await expire(rollbackLease)
    await assert.rejects(abandon(rollbackLease.jobId,devices[3]),/forced audit failure/)
    await db.exec('reset role')
    assert.equal((await db.query('select status from loyalty_sms_outbox where id=$1',[rollbackLease.jobId])).rows[0].status,'claimed')
    await db.exec('reset role; drop trigger fail_device_audit on loyalty_sms_device_audit; set role service_role')
    await db.exec('reset role')
    await db.query('update tenants set loyalty_enabled=false,loyalty_shadow=true where id=$1',[tenant])
    await db.exec('set role service_role')
    assert.deepEqual(await abandon(rollbackLease.jobId,devices[3]),ok)
    assert.deepEqual(await revoke(devices[3],owner2),ok)
    assert.deepEqual(await abandon(rollbackLease.jobId,devices[3]),ok)
    await db.exec('reset role')
    await db.query('update tenants set loyalty_enabled=true,loyalty_shadow=false where id=$1',[tenant])
    await db.exec('set role service_role')
    for(const change of ["is_owner=false,permissions=null","permissions=array['loyalty_manage']","role='staff',is_owner=true"]) {
      await db.exec('reset role')
      await db.query(`update app_users set ${change} where user_id=$1`,[actor])
      await db.exec('set role service_role')
      assert.deepEqual(await revoke(devices[3]),denied)
      assert.deepEqual(await abandon(rollbackLease.jobId,devices[3]),denied)
    }
    await db.exec('reset role')
    await db.query("update app_users set role='admin',is_owner=true,permissions='{}' where user_id=$1",[actor])
    for(const role of ['anon','authenticated','service_role']) {
      await db.exec(`set role ${role}`)
      for(const table of ['loyalty_sms_devices','loyalty_sms_device_audit']) {
        await assert.rejects(db.exec(`delete from ${table}`),/permission denied/)
        await assert.rejects(db.exec(`update ${table} set device_id=device_id`),/permission denied/)
      }
      await assert.rejects(db.query('insert into loyalty_sms_devices(device_id,tenant_id,actor_id,credential_hash) values($1,$2,$3,$4)',[randomUUID(),tenant,actor,hash]),/permission denied/)
      await assert.rejects(db.query("insert into loyalty_sms_device_audit(tenant_id,actor_id,device_id,action) values($1,$2,$3,'enrolled')",[tenant,actor,device]),/permission denied/)
      if(role!=='service_role') {
        await assert.rejects(enroll(),/permission denied/)
        await assert.rejects(revoke(),/permission denied/)
        await assert.rejects(abandon(job),/permission denied/)
        await assert.rejects(audit(),/permission denied/)
      }
      await db.exec('reset role')
    }
    for(const isolation of ['repeatable read','serializable']) {
      await db.exec(`begin isolation level ${isolation}; set local role service_role`)
      assert.deepEqual(await enroll(randomUUID()),denied)
      assert.deepEqual(await revoke(),denied)
      assert.deepEqual(await abandon(job),denied)
      await db.exec('rollback')
    }
    // Durable failed intent can be acknowledged when dispatch never started.
    await db.exec('reset role; delete from loyalty_sms_outbox; set role service_role')
    const recoveryDevice=randomUUID()
    assert.deepEqual(await enroll(recoveryDevice),ok)
    const recoveryAuth=[tenant,actor,recoveryDevice,hash]
    const recover=(l,outcome='failed',a=recoveryAuth)=>rpc('recover_loyalty_sms_ack',[...a,l.jobId,l.leaseToken,outcome])
    await fixture(); const noDispatch=await claim(recoveryAuth)
    assert.deepEqual(await recover(noDispatch),denied,'Live predispatch lease must wait')
    await db.exec('reset role')
    await db.query("update loyalty_sms_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[noDispatch.jobId])
    await db.exec('set role service_role')
    assert.deepEqual(await recover(noDispatch),ok,'Expired predispatch intent closes without sending')
    assert.deepEqual(await recover(noDispatch),ok,'Recovery acknowledgement is idempotent')
    assert.deepEqual(await recover(noDispatch,'sent'),denied)
    await db.exec('reset role')
    assert.deepEqual((await db.query('select status,error,dispatch_started_at from loyalty_sms_outbox where id=$1',[noDispatch.jobId])).rows[0],
      {status:'failed',error:'delivery_not_started',dispatch_started_at:null})
    await db.exec('set role service_role')
    await fixture(); const oldLease=await claim(recoveryAuth)
    await db.exec('reset role')
    await db.query("update loyalty_sms_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[oldLease.jobId])
    await db.exec('set role service_role')
    const reassignedAuth=[tenant,owner2,superDevice,hash], reassigned=await claim(reassignedAuth)
    assert.equal(reassigned.jobId,oldLease.jobId)
    assert.notEqual(reassigned.leaseToken,oldLease.leaseToken)
    await db.exec('reset role')
    const beforeRecovery=(await db.query('select * from loyalty_sms_outbox where id=$1',[oldLease.jobId])).rows[0]
    await db.exec('set role service_role')
    assert.deepEqual(await recover(oldLease),ok,'Failed stale intent can be forgotten after reassignment')
    assert.deepEqual(await recover(oldLease,'sent'),denied,'Stale sent outcome denied')
    assert.deepEqual(await recover(reassigned),denied,'Exact token from another device denied')
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from loyalty_sms_outbox where id=$1',[oldLease.jobId])).rows[0],beforeRecovery,'Stale ACK never mutates reassigned job')
    await db.exec('set role service_role')
    assert.equal((await rpc('authorize_loyalty_sms_dispatch',[...reassignedAuth,reassigned.jobId,reassigned.leaseToken])).ok,true)
    await db.exec('reset role')
    const dispatchedBeforeRecovery=(await db.query('select * from loyalty_sms_outbox where id=$1',[oldLease.jobId])).rows[0]
    await db.exec('set role service_role')
    assert.deepEqual(await recover(oldLease),ok,'Stale failed ACK also leaves a current dispatched lease alone')
    await db.exec('reset role')
    assert.deepEqual((await db.query('select * from loyalty_sms_outbox where id=$1',[oldLease.jobId])).rows[0],dispatchedBeforeRecovery)
    await db.exec('set role service_role')
    assert.deepEqual(await recover(reassigned,'sent',reassignedAuth),ok,'Dispatched recovery delegates normal completion')
    assert.deepEqual(await recover(reassigned,'sent',reassignedAuth),ok)
    assert.deepEqual(await recover(reassigned,'failed',reassignedAuth),denied,'Terminal sent cannot become failed')
    await fixture(); const abandonedRecovery=await claim(recoveryAuth)
    assert.equal((await rpc('authorize_loyalty_sms_dispatch',[...recoveryAuth,abandonedRecovery.jobId,abandonedRecovery.leaseToken])).ok,true)
    await expire(abandonedRecovery)
    assert.deepEqual(await abandon(abandonedRecovery.jobId,recoveryDevice),ok)
    assert.deepEqual(await recover(abandonedRecovery),ok,'Owner-abandoned exact failed intent can be acknowledged')
    assert.deepEqual(await recover(abandonedRecovery,'sent'),denied)
    for(const a of [[tenant,actor,recoveryDevice,'b'.repeat(64)],[tenant,actor,device,hash],
      [tenant2,actor,recoveryDevice,hash],[tenant,randomUUID(),recoveryDevice,hash]]) {
      assert.deepEqual(await recover(oldLease,'failed',a),deviceDenied,'Authorization precedes stale-token ACK')
    }
    assert.deepEqual(await recover({...oldLease,jobId:randomUUID()}),denied)
    assert.deepEqual(await recover({...oldLease,leaseToken:null}),denied)
    assert.deepEqual(await recover(oldLease,'invalid'),denied)
    await db.exec('reset role')
    await db.query('update tenants set loyalty_enabled=false where id=$1',[tenant])
    await db.exec('set role service_role')
    assert.deepEqual(await recover(oldLease),deviceDenied,'Disabled tenant requires manual intervention')
    await db.exec('reset role')
    await db.query('update tenants set loyalty_enabled=true where id=$1',[tenant])
    await db.query("update app_users set is_owner=false,permissions='{}' where user_id=$1",[actor])
    await db.exec('set role service_role')
    assert.deepEqual(await recover(oldLease),deviceDenied,'Current delivery permission required')
    await db.exec('reset role')
    await db.query('update app_users set is_owner=true where user_id=$1',[actor])
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(recover(oldLease),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('begin isolation level repeatable read; set local role service_role')
    assert.deepEqual(await recover(oldLease),deviceDenied)
    await db.exec('rollback')
    // Registry cascade must not erase the permanent retirement of a device ID.
    await db.exec('reset role')
    for(const deletedEntity of ['actor','tenant']) {
      const originalActor=randomUUID(), originalTenant=randomUUID(), retiredDevice=randomUUID()
      await db.query('insert into tenants(id,loyalty_enabled,loyalty_shadow) values($1,true,false)',[originalTenant])
      await db.query('insert into auth.users values($1)',[originalActor])
      await db.query("insert into app_users values($1,$2,'admin',true,'{}',null)",[originalActor,originalTenant])
      await db.exec('set role service_role')
      assert.deepEqual(await enroll(retiredDevice,originalActor,originalTenant),ok)
      assert.deepEqual(await revoke(retiredDevice,originalActor,originalTenant),ok)
      await db.exec('reset role')
      if(deletedEntity==='actor') await db.query('delete from auth.users where id=$1',[originalActor])
      else await db.query('delete from tenants where id=$1',[originalTenant])
      assert.equal((await db.query('select * from loyalty_sms_devices where device_id=$1',[retiredDevice])).rows.length,0)
      await db.exec('set role service_role')
      assert.deepEqual(await enroll(retiredDevice,owner2,tenant2),denied,`Retired ID survives ${deletedEntity} deletion`)
      await db.exec('reset role')
    }
    console.log('Loyalty device management SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
