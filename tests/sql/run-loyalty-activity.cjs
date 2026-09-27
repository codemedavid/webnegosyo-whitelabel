const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  const tenant = '11111111-1111-4111-8111-111111111111'
  const actor = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table auth.users(id uuid primary key); create table tenants(id uuid primary key);
      create table outlets(id uuid primary key); create table customers(id uuid primary key);
      create table app_users(user_id uuid,tenant_id uuid,role text);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
      insert into tenants values('${tenant}'); insert into auth.users values('${actor}');`)
    await db.exec(readFileSync('supabase/migrations/20260905140000_loyalty_programs.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20260906150000_loyalty_reversal_accounting.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20260922120000_loyalty_member_management.sql', 'utf8'))
    await db.exec('create table orders(id uuid,tenant_id uuid,outlet_id uuid); create table customer_external_orders(tenant_id uuid,backend text,external_order_id text,outlet_id uuid)')
    await db.exec(readFileSync('supabase/migrations/20260926150000_loyalty_activity.sql', 'utf8'))
    const program = (await db.query(`insert into loyalty_programs(tenant_id,name,earn_mode) values($1,'Coffee','stamp') returning id`, [tenant])).rows[0].id
    const ledger = (await db.query(`insert into loyalty_ledger(tenant_id,program_id,customer_key,kind,delta,actor,note) values($1,$2,'phone:+639171234567','correction',1,$3,'Missing visit') returning id`, [tenant, program, actor])).rows[0].id
    const reward = (await db.query(`insert into loyalty_entitlements(tenant_id,program_id,customer_key,terms) values($1,$2,'phone:+639171234567',$3) returning id`, [tenant, program, { programName: 'Coffee', reward: { type: 'fixed', amount: 100 } }])).rows[0].id
    await db.query(`update loyalty_entitlements set status='consumed',resolved_by=$2,resolution_note='Receipt 42',consumed_order_id='order-42',consumed_order_backend='convex' where id=$1`, [reward, actor])
    await db.query(`update loyalty_entitlements set updated_at=now() where id=$1`, [reward])
    const rows = (await db.query('select * from loyalty_activity order by occurred_at,id')).rows
    assert.equal(rows.length, 3, 'Only actual transitions produce activity')
    assert.equal(rows.find(r => r.kind === 'correction').source_id, ledger)
    const used = rows.find(r => r.kind === 'reward_consumed')
    assert.equal(used.actor_id, actor)
    assert.equal(used.note, 'Receipt 42')
    assert.equal(used.external_order_id, 'order-42')
    assert.equal(used.previous_status, 'issued')
    assert.equal(used.status, 'consumed')
    assert.equal(used.reward_terms.reward.amount, 100)
    await db.query(`insert into customer_external_orders values($1,'convex','branch-order',$2)`, [tenant,actor])
    await db.query(`insert into loyalty_ledger(tenant_id,program_id,customer_key,kind,delta,order_backend,external_order_id) values($1,$2,'phone:+639171234567','earn',1,'convex','branch-order')`, [tenant,program])
    assert.equal((await db.query("select outlet_id from loyalty_activity where external_order_id='branch-order'")).rows[0].outlet_id,actor,'Business-wide earning retains the actual order branch')
    await assert.rejects(db.query(`update loyalty_activity set note='changed' where id=$1`, [used.id]), /immutable/)
    await db.exec('begin')
    await db.query(`update loyalty_entitlements set status='restored',resolved_by=null,resolution_note=null where id=$1`, [reward])
    await db.exec('rollback')
    assert.equal((await db.query('select count(*)::int n from loyalty_activity')).rows[0].n, 4, 'Audit rolls back with the business operation')
    const member = 'phone:+639179999999'
    const terms = { programName: 'Coffee', reward: { type: 'fixed', amount: 100 } }
    const earn = async number => (await db.query(`select apply_loyalty_earning(p_tenant_id=>$1,p_program_id=>$2,p_version_id=>null,p_customer_key=>$3,p_customer_id=>null,p_kind=>'earn',p_delta=>1,p_order_backend=>'convex',p_external_order_id=>$4,p_threshold=>10,p_reward_terms=>$5,p_reward_expires_at=>null,p_shadow=>false) result`, [tenant,program,member,`repeat-order-${number}`,terms])).rows[0].result
    for (let n=1;n<=10;n++) await earn(n)
    const balance = async () => Number((await db.query('select balance from loyalty_balances where program_id=$1 and customer_key=$2',[program,member])).rows[0].balance)
    assert.equal(await balance(),0,'Threshold crossing starts a new card')
    const unlocked = (await db.query('select id from loyalty_entitlements where customer_key=$1',[member])).rows[0].id
    await earn(11)
    assert.equal(await balance(),1,'Next order earns while a reward remains available')
    await db.query("select resolve_loyalty_entitlement($1,$2,'consume',$3,'Honoured at counter')",[tenant,unlocked,actor])
    assert.equal(await balance(),1,'Using the earlier reward does not reset the next card')
    await earn(12)
    await earn(12)
    assert.equal(await balance(),2,'Repeat orders after redemption credit once even on retry')
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from loyalty_activity'), /permission denied/)
    console.log('Loyalty activity SQL regressions passed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
