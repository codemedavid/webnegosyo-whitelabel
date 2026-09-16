const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
async function main() {
 const db = new PGlite()
 const tenant = '11111111-1111-4111-8111-111111111111', actor = '22222222-2222-4222-8222-222222222222'
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
 create table auth.users(id uuid primary key); create table tenants(id uuid primary key);
 create table outlets(id uuid primary key, tenant_id uuid, name text, is_active boolean default true);
 create table customers(id uuid primary key);
 create table app_users(user_id uuid, tenant_id uuid, role text, is_owner boolean, permissions text[]);
 create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
 insert into tenants values('${tenant}'); insert into auth.users values('${actor}');
 insert into app_users values('${actor}','${tenant}','admin',true,null);`)
 await db.exec(readFileSync('supabase/migrations/20260905140000_loyalty_programs.sql','utf8'))
 if (!process.argv.includes('--baseline')) await db.exec(readFileSync('supabase/migrations/20260914161000_loyalty_program_management.sql','utf8'))

 await db.exec(readFileSync('supabase/migrations/20260914162000_loyalty_wallet.sql','utf8'))
 await db.exec(readFileSync('supabase/migrations/20260914164000_loyalty_cleanup.sql','utf8'))
 const p = (await db.query(`insert into loyalty_programs(tenant_id,name,earn_mode,status,activates_at) values($1,'Coffee','stamp','active',now()) returning id`,[tenant])).rows[0].id
 const rules = { earnMode:'stamp',threshold:10,reward:{type:'fixed',amount:100},isExclusive:true }
 const v = (await db.query('insert into loyalty_program_versions(tenant_id,program_id,version,rules) values($1,$2,1,$3) returning id',[tenant,p,rules])).rows[0].id
 await db.query('update loyalty_programs set current_version_id=$1 where id=$2',[v,p])
 await db.exec('update tenants set loyalty_enabled=true,loyalty_shadow=false')
 const phone='phone:+639171234567'
 await db.query('insert into loyalty_balances(tenant_id,program_id,customer_key,balance) values($1,$2,$3,3)',[tenant,p,phone])
 const terms={programId:p,programName:'Original coffee',versionNumber:1,reward:{type:'fixed',amount:50},isExclusive:true}
 await db.query("insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms,status) values($1,$2,$3,$4,'restored')",[tenant,p,phone,terms])
 const lookup=async(key=phone,ip='a'.repeat(64))=>(await db.query('select lookup_loyalty_wallet($1,$2,$3,$4) as result',[tenant,key,'b'.repeat(64),ip])).rows[0].result
 const wallet=await lookup()
 assert.equal(wallet.programs[0].balance,3)
 assert.equal(wallet.rewards[0].terms.reward.amount,50,'Issued reward terms survive a current-rule change')
 assert.equal(JSON.stringify(wallet).includes(phone),false)
 assert.deepEqual(Object.keys(wallet.programs[0]).sort(),['balance','branchName','id','name','rules','scope','status'])
 assert.equal((await lookup('phone:+639179999999')).rewards.length,0,'Other phones cannot discover these entitlements')
 for(let i=0;i<8;i++)assert.equal((await lookup()).ok,true)
 assert.deepEqual(await lookup(),{ok:false,error:'rate_limited'})
 await db.exec('update tenants set loyalty_shadow=true')
 assert.deepEqual(await lookup(phone,'c'.repeat(64)),{ok:true,programs:[],rewards:[]})
 await db.exec('set role authenticated')
 await assert.rejects(lookup(),/permission denied/)
 console.log('Loyalty wallet SQL regressions passed')
 } finally { await db.close() }
}
main().catch(e=>{ console.error(e.message);process.exitCode=1 })
