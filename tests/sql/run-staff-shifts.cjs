const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  const tenant = '11111111-1111-4111-8111-111111111111'
  const otherTenant = '22222222-2222-4222-8222-222222222222'
  const actor = '33333333-3333-4333-8333-333333333333'
  const colleague = '44444444-4444-4444-8444-444444444444'
  const outlet = '55555555-5555-4555-8555-555555555555'
  const otherOutlet = '66666666-6666-4666-8666-666666666666'
  try {
    await db.exec(`create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
      create table tenants(id uuid primary key);
      create table outlets(id uuid primary key,tenant_id uuid);
      create table app_users(user_id uuid,tenant_id uuid,outlet_id uuid,is_owner boolean,permissions text[]);
      create function app_user_may_reach_branch(tenant uuid,branch uuid) returns boolean language sql stable as $$
        select exists(select 1 from app_users where user_id=auth.uid() and tenant_id=tenant and (is_owner or outlet_id is null or outlet_id=branch))
      $$;
      grant usage on schema auth to authenticated;
      grant select on app_users,outlets to authenticated;`)
    await db.exec(readFileSync('supabase/migrations/20260823120000_staff_shifts.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20260916150000_staff_shift_custody.sql', 'utf8'))
    // Supabase's public-schema default privileges are explicit in this fixture.
    await db.exec('grant select,insert,update,delete on staff_shifts to authenticated')
    await db.query('insert into tenants values($1),($2)', [tenant, otherTenant])
    await db.query('insert into auth.users values($1),($2)', [actor, colleague])
    await db.query('insert into outlets values($1,$2),($3,$4)', [outlet, tenant, otherOutlet, otherTenant])
    await db.query("insert into app_users values($1,$2,$3,false,ARRAY['pos']),($4,$2,$3,false,ARRAY['pos'])", [actor, tenant, outlet, colleague])
    await db.query("select set_config('test.uid',$1,false)", [actor])
    await db.exec('set role authenticated')
    const open = (staff = actor, branch = outlet) => db.query("insert into staff_shifts(tenant_id,outlet_id,staff_user_id,staff_name,opening_float) values($1,$2,$3,'Cashier',100) returning id", [tenant, branch, staff])
    await assert.rejects(open(colleague), /row-level security/)
    await assert.rejects(open(actor, otherOutlet), /different store/)
    const id = (await open()).rows[0].id
    await assert.rejects(open(), /duplicate key/)
    await assert.rejects(db.query("update staff_shifts set opening_float=200,status='closed',closed_at=now(),expected_cash=100,closing_count=100 where id=$1", [id]), /custody/)
    await assert.rejects(db.query("update staff_shifts set status='closed',closed_at=now() where id=$1", [id]), /expected cash/)
    await db.query("select set_config('test.uid',$1,false)", [colleague])
    assert.equal((await db.query("update staff_shifts set status='closed',closed_at=now(),expected_cash=100,closing_count=100 where id=$1 returning id", [id])).rows.length, 0, 'a colleague cannot close another drawer')
    await db.query("select set_config('test.uid',$1,false)", [actor])
    await db.query("update staff_shifts set status='closed',closed_at=now(),expected_cash=150,closing_count=145 where id=$1", [id])
    assert.equal((await db.query('update staff_shifts set closing_count=150 where id=$1 returning id', [id])).rows.length, 0, 'closed evidence is immutable')
    assert.equal((await db.query('delete from staff_shifts where id=$1 returning id', [id])).rows.length, 0, 'staff cannot erase drawer history')
    await db.exec('reset role')
    await db.query('delete from auth.users where id=$1', [actor])
    const retained = (await db.query('select staff_user_id,staff_name,expected_cash,closing_count from staff_shifts where id=$1', [id])).rows[0]
    assert.deepEqual(retained, { staff_user_id: null, staff_name: 'Cashier', expected_cash: '150.00', closing_count: '145.00' })
    console.log('PASS: shift ownership, branch scope, duplicate opens, immutable custody/closing evidence, user deletion')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
