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
 create table outlets(id uuid primary key, tenant_id uuid, is_active boolean default true);
 create table customers(id uuid primary key);
 create table app_users(user_id uuid, tenant_id uuid, role text, is_owner boolean, permissions text[]);
 create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
 insert into tenants values('${tenant}'); insert into auth.users values('${actor}');
 insert into app_users values('${actor}','${tenant}','admin',true,null);`)
 await db.exec(readFileSync('supabase/migrations/20260905140000_loyalty_programs.sql','utf8'))
 if (!process.argv.includes('--baseline')) await db.exec(readFileSync('supabase/migrations/20260914161000_loyalty_program_management.sql','utf8'))
 const rules = { earnMode:'stamp',threshold:10,reward:{type:'fixed',amount:50},isExclusive:true }
 const call = async (action, program=null, input={}, expected=null) => (await db.query('select manage_loyalty_program($1,$2,$3,$4,$5,$6) as result',[tenant,actor,action,program,input,expected])).rows[0].result
 const created = await call('create',null,{name:'Coffee',scope:'business',rules})
 assert.equal(created.version,1)
 assert.equal((await db.query('select current_version_id from loyalty_programs where id=$1',[created.programId])).rows[0].current_version_id,created.versionId)
 const revised = await call('revise',created.programId,{rules:{...rules,reward:{type:'fixed',amount:75}}},1)
 assert.equal(revised.version,2)
 await assert.rejects(call('revise',created.programId,{rules},1),/changed/)
 assert.equal((await db.query('select count(*)::int as n from loyalty_program_versions')).rows[0].n,2)
 await assert.rejects(call('create',null,{name:'Bad branch',scope:'branch',outletId:actor,rules}),/branch/i)
 await assert.rejects(call('create',null,{name:'No reward',rules:{earnMode:'stamp',threshold:10}}),/rules/i)
 await call('set_status',created.programId,{status:'active',expectedStatus:'draft'})
 await assert.rejects(call('set_status',created.programId,{status:'ended',expectedStatus:'draft'}),/changed/)
 await call('set_status',created.programId,{status:'ended',expectedStatus:'active'})
 await assert.rejects(call('revise',created.programId,{rules},2),/ended/)
 await db.exec(`create function fail_version() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$;
 create trigger fail_version before insert on loyalty_program_versions for each row execute function fail_version()`)
 await assert.rejects(call('create',null,{name:'Rollback',rules}),/simulated failure/)
 assert.equal((await db.query('select count(*)::int as n from loyalty_programs')).rows[0].n,1)
 await db.exec('set role authenticated')
 await assert.rejects(call('create',null,{name:'Forbidden',rules}),/permission denied/)
 console.log('Loyalty atomic management regressions passed')
 } finally { await db.close() }
}
main().catch(e=>{ console.error(e.message);process.exitCode=1 })
