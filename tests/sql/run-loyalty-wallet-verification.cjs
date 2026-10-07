// "Verify your number before we show your rewards": wallet challenges, sessions
// and the store switch. PGlite is installed outside the repo:
// NODE_PATH=<dir>/node_modules node tests/sql/run-loyalty-wallet-verification.cjs
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
  '20260910140000_loyalty_sms_ack_authorization.sql','20261004120000_loyalty_sms_gateway.sql']
const UNDER_TEST = '20261004150000_loyalty_wallet_verification.sql'
const PAYLOAD = 'v1.AAAAAAAAAAAAAAAA.AAAA.AAAAAAAAAAAAAAAAAAAAAA'
const hex = c => c.repeat(64)

async function main() {
  const db = new PGlite()
  const tenant=randomUUID(), other=randomUUID(), actor=randomUUID(), device=randomUUID()
  const member='phone:+639171234567', stranger='phone:+639179999999'
  const denied={ok:false,error:'request_denied'}, invalid={ok:false,error:'invalid_code'}
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
    const program=(await db.query("insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id",[tenant])).rows[0].id
    await db.query('insert into loyalty_balances(tenant_id,program_id,customer_key,balance) values($1,$2,$3,3)',[tenant,program,member])
    await db.query("insert into loyalty_sms_devices(device_id,tenant_id,actor_id,credential_hash) values($1,$2,$3,$4)",[device,tenant,actor,hex('a')])

    let ip=0
    const nextIp=()=>(++ip).toString(16).padStart(64,'0')
    const issue=(o={})=>{
      const args={tenant,challenge:randomUUID(),key:member,phone:hex('b'),code:hex('c'),ip:nextIp(),payload:PAYLOAD,...o}
      return rpc('issue_loyalty_wallet_challenge',[args.tenant,args.challenge,args.key,args.phone,args.code,args.ip,args.payload]).then(r=>({r,args}))
    }
    const verify=(challenge,o={})=>{
      const a={tenant,code:hex('c'),token:randomUUID().replace(/-/g,'').padEnd(64,'0'),phone:hex('b'),...o}
      return rpc('verify_loyalty_wallet_challenge',[a.tenant,challenge,a.code,a.token,a.phone]).then(r=>({r,token:a.token}))
    }
    const valid=(token,o={})=>rpc('loyalty_wallet_session_valid',[o.tenant??tenant,token,o.phone??hex('b')])
    const clearRates=()=>db.exec('delete from loyalty_wallet_issuance_events')

    // 1. Store switch: off by default, one row per store.
    await db.query('insert into loyalty_store_settings(tenant_id) values($1)',[tenant])
    assert.equal((await db.query('select wallet_otp_required from loyalty_store_settings where tenant_id=$1',[tenant])).rows[0].wallet_otp_required,false)

    // 2. Issuance queues a phone job with no reward attached.
    const first=await issue()
    assert.equal(first.r.ok,true,JSON.stringify(first.r))
    const row=(await db.query('select purpose,entitlement_id from loyalty_otp_challenges where id=$1',[first.args.challenge])).rows[0]
    assert.deepEqual(row,{purpose:'wallet',entitlement_id:null})
    const outbox=(await db.query('select transport,status from loyalty_sms_outbox where challenge_id=$1',[first.args.challenge])).rows[0]
    assert.deepEqual(outbox,{transport:'android_sim',status:'queued'})
    // Exact retry recovers without a second job; a changed retry is refused.
    assert.equal((await rpc('issue_loyalty_wallet_challenge',[tenant,first.args.challenge,member,hex('b'),hex('c'),first.args.ip,PAYLOAD])).ok,true)
    assert.equal(Number((await db.query('select count(*) n from loyalty_sms_outbox where challenge_id=$1',[first.args.challenge])).rows[0].n),1)
    assert.deepEqual(await rpc('issue_loyalty_wallet_challenge',[tenant,first.args.challenge,member,hex('b'),hex('d'),first.args.ip,PAYLOAD]),denied)

    // 3. Cooldown per phone; never texts a number the store does not know.
    assert.deepEqual((await issue()).r,denied,'60-second cooldown')
    await clearRates()
    const unknown=await issue({key:stranger,phone:hex('e')})
    assert.deepEqual(unknown.r,denied,'Non-members are never texted')
    assert.equal(Number((await db.query('select count(*) n from loyalty_otp_challenges where id=$1',[unknown.args.challenge])).rows[0].n),0)
    assert.equal(Number((await db.query('select count(*) n from loyalty_wallet_issuance_events where phone_hash=$1',[hex('e')])).rows[0].n),1,'Probing still spends budget')
    assert.deepEqual((await issue({tenant:other})).r,denied,'Membership is per store')
    assert.deepEqual((await issue({payload:'v1.bad'})).r,denied)
    assert.deepEqual((await issue({key:'phone:+15551234567'})).r,denied)

    // 4. A new wallet code supersedes the old one.
    await clearRates()
    const second=await issue()
    assert.equal(second.r.ok,true)
    assert.equal((await db.query('select status,error from loyalty_sms_outbox where challenge_id=$1',[first.args.challenge])).rows[0].error,'superseded')
    assert.deepEqual((await verify(first.args.challenge)).r,invalid,'Superseded code is dead')

    // 5. Verification: wrong code counts, right code buys a session once.
    assert.deepEqual((await verify(second.args.challenge,{code:hex('d')})).r,invalid)
    assert.equal((await db.query('select attempts from loyalty_otp_challenges where id=$1',[second.args.challenge])).rows[0].attempts,1)
    assert.deepEqual((await verify(second.args.challenge,{phone:hex('e')})).r,invalid,'Bound to the requesting number')
    assert.deepEqual((await verify(second.args.challenge,{tenant:other})).r,invalid,'Bound to the store')
    const ok=await verify(second.args.challenge)
    assert.equal(ok.r.ok,true)
    assert.ok(Date.parse(ok.r.expiresAt)>Date.now()+29*60*1000)
    assert.deepEqual((await verify(second.args.challenge)).r,invalid,'A code is used once')
    assert.equal(await valid(ok.token),true)
    assert.equal(await valid(ok.token,{phone:hex('e')}),false,'Session is bound to its number')
    assert.equal(await valid(ok.token,{tenant:other}),false,'Session is bound to its store')
    assert.equal(await valid(hex('f')),false)
    await db.query("update loyalty_wallet_sessions set created_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 minute' where token_hash=$1",[ok.token])
    assert.equal(await valid(ok.token),false,'Sessions expire')

    // 6. Exhausted and expired codes are refused.
    await clearRates()
    const third=await issue()
    await db.query('update loyalty_otp_challenges set attempts=max_attempts where id=$1',[third.args.challenge])
    assert.deepEqual((await verify(third.args.challenge)).r,invalid,'Exhausted')
    await clearRates()
    const fourth=await issue()
    await db.query("update loyalty_otp_challenges set expires_at=clock_timestamp()-interval '1 second' where id=$1",[fourth.args.challenge])
    assert.deepEqual((await verify(fourth.args.challenge)).r,invalid,'Expired')

    // 7. A wallet code never becomes a reward claim, and delivery treats it like any code.
    await clearRates()
    const fifth=await issue()
    const claim=await rpc('verify_loyalty_claim',[tenant,fifth.args.challenge,hex('c'),hex('9'),member,hex('b')])
    assert.equal(claim.ok,false,'Wallet challenge is not a reward claim')
    const lease=await rpc('claim_loyalty_sms_job',[tenant,actor,device,hex('a')])
    assert.equal(lease.challengeId,fifth.args.challenge,'Gateway phone sends wallet codes')
    await db.query("update loyalty_sms_outbox set status='failed' where challenge_id=$1",[fifth.args.challenge])
    await clearRates()
    const sixth=await issue()
    assert.equal((await rpc('begin_loyalty_sms_server_dispatch',[tenant,sixth.args.challenge])).ok,true,'Semaphore can send wallet codes')
    const reward=(await db.query("insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms) values($1,$2,$3,'{}') returning id",[tenant,program,member])).rows[0].id
    await assert.rejects(db.query("insert into loyalty_otp_challenges(tenant_id,purpose,entitlement_id,phone_hash,code_hash,expires_at) values($1,'wallet',$2,'x','x',now())",[tenant,reward]),/wallet_has_no_reward/)

    // 8. Privileges: service role only.
    for (const fn of ['issue_loyalty_wallet_challenge(uuid,uuid,text,text,text,text,text)','verify_loyalty_wallet_challenge(uuid,uuid,text,text,text)','loyalty_wallet_session_valid(uuid,text,text)']) {
      for (const role of ['anon','authenticated']) {
        assert.equal((await db.query(`select has_function_privilege('${role}','public.${fn}','execute') ok`)).rows[0].ok,false,`${role} cannot run ${fn}`)
      }
      assert.equal((await db.query(`select has_function_privilege('service_role','public.${fn}','execute') ok`)).rows[0].ok,true)
    }
    for (const table of ['loyalty_store_settings','loyalty_wallet_sessions','loyalty_wallet_issuance_events']) {
      for (const role of ['anon','authenticated']) {
        assert.equal((await db.query(`select has_table_privilege('${role}','public.${table}','select') ok`)).rows[0].ok,false,`${role} cannot read ${table}`)
      }
    }
    console.log('Loyalty wallet verification SQL regressions passed')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exit(1) })
