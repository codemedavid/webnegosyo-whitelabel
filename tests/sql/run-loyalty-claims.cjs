// Isolated PostgreSQL integration tests; install PGlite outside the repository.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  const tenant = '11111111-1111-1111-1111-111111111111'
  const foreign = '22222222-2222-2222-2222-222222222222'
  const code = 'a'.repeat(64)
  let serial = 0
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table tenants(id uuid primary key); create table outlets(id uuid primary key);
      create table customers(id uuid primary key);
      create table app_users(user_id uuid,tenant_id uuid,role text,is_owner boolean,permissions text[],outlet_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      insert into tenants values('${tenant}'),('${foreign}');
    `)
    const root = path.resolve(__dirname, '../..')
    for (const name of [
      '20260905140000_loyalty_programs.sql', '20260905141000_loyalty_versions_cascade.sql',
      '20260906150000_loyalty_reversal_accounting.sql', '20260906160000_loyalty_access.sql',
      '20260906170000_loyalty_pos_settlement.sql', '20260907120000_loyalty_quote_immutability.sql',
      '20260908120000_loyalty_verified_claims.sql',
    ]) {
      const file = path.join(root, 'supabase/migrations', name)
      await db.exec(readFileSync(file, 'utf8'))
    }
    await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
    const program = (await db.query(`insert into loyalty_programs(tenant_id,name,earn_mode)
      values($1,'Coffee','stamp') returning id`, [tenant])).rows[0].id
    async function fixture() {
      const reward = (await db.query(`insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms)
        values($1,$2,'phone:+639171234567','{}') returning id`, [tenant,program])).rows[0].id
      const challenge = (await db.query(`insert into loyalty_otp_challenges
        (tenant_id,entitlement_id,phone_hash,code_hash,expires_at)
        values($1,$2,$3,$4,now()+interval '5 minutes') returning id`,[tenant,reward,'b'.repeat(64),code])).rows[0].id
      return {reward,challenge}
    }
    // Trusted server derives these two proof values from the same canonical phone.
    const verify = async (challenge, candidate=code, token=(++serial).toString(16).padStart(64,'0'), t=tenant,
      customerKey='phone:+639171234567', phoneHash='b'.repeat(64)) =>
      (await db.query('select verify_loyalty_claim($1,$2,$3,$4,$5,$6) as result',
        [t,challenge,candidate,token,customerKey,phoneHash])).rows[0].result
    const first = await fixture()
    const result = await verify(first.challenge)
    assert.equal(result.ok,true)
    assert.deepEqual(Object.keys(result).sort(),['claimId','expiresAt','ok'],'Response contains no identity or hashes')
    const claim = (await db.query('select * from loyalty_verified_claims where id=$1',[result.claimId])).rows[0]
    assert.equal('customer_key' in claim,false,'Claims do not duplicate plaintext phone identity')
    assert.equal((await db.query("select 1 from information_schema.columns where table_name='loyalty_otp_challenges' and column_name='customer_key'")).rows.length,0,'OTP records retain keyed hashes only')
    assert.equal(claim.entitlement_id,first.reward)
    assert.equal(claim.challenge_id,first.challenge)
    assert.equal(claim.used_at,null)
    assert.equal(new Date(claim.expires_at)-new Date(claim.created_at),120000)
    assert.equal((await db.query('select verified_at from loyalty_otp_challenges where id=$1',[first.challenge])).rows[0].verified_at !== null,true)
    const wrong = await fixture()
    assert.deepEqual(await verify(wrong.challenge,'c'.repeat(64)),{ok:false,error:'invalid_claim'})
    assert.equal((await db.query('select attempts from loyalty_otp_challenges where id=$1',[wrong.challenge])).rows[0].attempts,1,'Failed attempts commit')
    for (let i=1;i<5;i++) assert.deepEqual(await verify(wrong.challenge,'c'.repeat(64)),{ok:false,error:'invalid_claim'})
    assert.deepEqual(await verify(wrong.challenge),{ok:false,error:'invalid_claim'},'A correct code cannot bypass exhaustion')
    assert.equal((await db.query('select attempts from loyalty_otp_challenges where id=$1',[wrong.challenge])).rows[0].attempts,5)
    assert.deepEqual(await verify(first.challenge),{ok:false,error:'invalid_claim'},'Successful verification is single use')
    const expired = await fixture()
    await db.query("update loyalty_otp_challenges set expires_at=now()-interval '1 second' where id=$1",[expired.challenge])
    assert.deepEqual(await verify(expired.challenge),{ok:false,error:'invalid_claim'},'Expired challenges fail')
    const mismatch = await fixture()
    assert.deepEqual(await verify(mismatch.challenge,code,undefined,tenant,'phone:+639179999999'),{ok:false,error:'invalid_claim'},'Verified identity must own reward')
    assert.deepEqual(await verify(mismatch.challenge,code,undefined,tenant,undefined,'d'.repeat(64)),{ok:false,error:'invalid_claim'},'Phone proof must match challenge')
    const unavailable = await fixture()
    await db.query("update loyalty_entitlements set status='consumed' where id=$1",[unavailable.reward])
    assert.deepEqual(await verify(unavailable.challenge),{ok:false,error:'invalid_claim'},'Consumed rewards fail')
    const live = await fixture()
    await db.exec('update tenants set loyalty_shadow=true')
    assert.deepEqual(await verify(live.challenge),{ok:false,error:'invalid_claim'},'Shadow mode cannot verify claims')
    await db.exec('update tenants set loyalty_shadow=false')
    assert.deepEqual(await verify(live.challenge,code, 'A'.repeat(64)),{ok:false,error:'invalid_claim'},'Hashes must be lowercase hex64')
    await db.exec('set role authenticated')
    await assert.rejects(verify(live.challenge),/permission denied/,'Browser sessions cannot verify directly')
    await db.exec('reset role')
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(verify(live.challenge),/permission denied/)
      await assert.rejects(db.query('select * from loyalty_verified_claims'),/permission denied/)
      await assert.rejects(db.query('select * from loyalty_otp_challenges'),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal((await verify(live.challenge)).ok,true,'Service role can use the definer RPC')
    assert.equal((await db.query('select * from loyalty_verified_claims')).rows.length,2)
    await assert.rejects(db.exec('delete from loyalty_verified_claims'),/permission denied/)
    await assert.rejects(db.exec('update loyalty_verified_claims set used_at=now()'),/permission denied/)
    await db.exec('reset role')

    const invalid = {ok:false,error:'invalid_claim'}
    const isolated = await fixture()
    assert.deepEqual(await verify(isolated.challenge,code,undefined,foreign),invalid,'Cross-tenant challenges fail')
    assert.deepEqual(await verify(null),invalid)
    for (const value of [null,'','a'.repeat(63),'a'.repeat(65),'G'.repeat(64)]) {
      assert.deepEqual(await verify(isolated.challenge,value),invalid)
      assert.deepEqual(await verify(isolated.challenge,code,value),invalid)
      assert.deepEqual(await verify(isolated.challenge,code,undefined,tenant,undefined,value),invalid)
    }
    for (const key of [null,'','phone:+63917123456','phone:+6391712345678','phone:+628171234567','+639171234567'])
      assert.deepEqual(await verify(isolated.challenge,code,undefined,tenant,key),invalid,'Expected identity must be canonical PH mobile')
    await db.query('update loyalty_otp_challenges set tenant_id=$1 where id=$2',[foreign,isolated.challenge])
    assert.deepEqual(await verify(isolated.challenge,code,undefined,foreign),invalid,'Challenge cannot borrow another tenant reward')
    for (const patch of [
      "max_attempts=6", "max_attempts=0", "attempts=-1",
      "expires_at=created_at+interval '6 minutes'", "created_at=now()+interval '1 minute'",
    ]) {
      const item = await fixture()
      await db.query(`update loyalty_otp_challenges set ${patch} where id=$1`,[item.challenge])
      assert.deepEqual(await verify(item.challenge),invalid,patch)
    }
    for (const status of ['reserved','expired','voided']) {
      const item = await fixture()
      await db.query('update loyalty_entitlements set status=$1 where id=$2',[status,item.reward])
      assert.deepEqual(await verify(item.challenge),invalid,status)
    }
    const staleReward = await fixture()
    await db.query("update loyalty_entitlements set expires_at=now()-interval '1 second' where id=$1",[staleReward.reward])
    assert.deepEqual(await verify(staleReward.challenge),invalid)
    const restored = await fixture()
    await db.query("update loyalty_entitlements set status='restored' where id=$1",[restored.reward])
    assert.equal((await verify(restored.challenge)).ok,true)
    const disabled = await fixture()
    await db.exec('update tenants set loyalty_enabled=false')
    assert.deepEqual(await verify(disabled.challenge),invalid)
    await db.exec('update tenants set loyalty_enabled=true')
    const finalAttempt = await fixture()
    for (let i=0;i<4;i++) await verify(finalAttempt.challenge,'c'.repeat(64))
    assert.equal((await verify(finalAttempt.challenge)).ok,true,'Correct fifth attempt succeeds')

    // A failed claim insert must not consume the challenge: both writes are atomic.
    const rollback = await fixture()
    await db.exec(`create function fail_claim() returns trigger language plpgsql as $$ begin raise exception 'claim failure'; end $$;
      create trigger fail_claim before insert on loyalty_verified_claims for each row execute function fail_claim()`)
    await assert.rejects(verify(rollback.challenge),/claim failure/)
    assert.equal((await db.query('select verified_at from loyalty_otp_challenges where id=$1',[rollback.challenge])).rows[0].verified_at,null)
    await db.exec('drop trigger fail_claim on loyalty_verified_claims')
    assert.equal((await verify(rollback.challenge)).ok,true,'Challenge remains usable after transaction rollback')
    const collision = await fixture()
    await assert.rejects(verify(collision.challenge,code,claim.token_hash),/unique constraint/)
    assert.equal((await verify(collision.challenge)).ok,true,'Hash collision rolls verification back')
    assert.equal((await db.query('select * from loyalty_reservations')).rows.length,0,'Verification does not reserve rewards')
    console.log('Loyalty verified claim SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode=1 })
