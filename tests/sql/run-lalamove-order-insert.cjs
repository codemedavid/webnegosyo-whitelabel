// Isolated PostgreSQL RLS regression: no external database or credentials.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync, existsSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table tenants(id text primary key, lalamove_enabled boolean);
      create table order_types(id text primary key, tenant_id text, type text);
      create table orders(id serial, tenant_id text, order_type_id text, lalamove_quotation_id text);
      alter table orders enable row level security;
      grant select on tenants,order_types to anon;
      grant insert on orders to anon,authenticated,service_role;
      grant usage on sequence orders_id_seq to anon,authenticated,service_role;
      create policy existing_customer_insert on orders for insert to anon with check(true);
      create policy existing_merchant_insert on orders for insert to authenticated with check(true);
      insert into tenants values ('lala',true),('other',false);
      insert into order_types values ('courier','lala','delivery'),('pickup','lala','pickup'),('other-pickup','other','pickup');
    `)
    const migration = 'supabase/migrations/20260927150000_lalamove_customer_order_guard.sql'
    if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'))
    await db.exec('set role anon')
    await assert.rejects(db.exec("insert into orders(tenant_id,order_type_id) values ('lala','courier')"), /row-level security/,
      'Anonymous direct delivery writes must not bypass server quote validation')
    await assert.rejects(db.exec("insert into orders(tenant_id,order_type_id,lalamove_quotation_id) values ('lala','courier','forged-quote')"), /row-level security/)
    await assert.rejects(db.exec("insert into orders(tenant_id) values ('lala')"), /row-level security/)
    await assert.rejects(db.exec("insert into orders(tenant_id,order_type_id) values ('lala','other-pickup')"), /row-level security/)
    await db.exec("insert into orders(tenant_id,order_type_id) values ('lala','pickup')")
    await db.exec("insert into orders(tenant_id) values ('other')")
    await db.exec('reset role; set role authenticated')
    await db.exec("insert into orders(tenant_id,order_type_id) values ('lala','courier')")
    await db.exec('reset role; set role service_role')
    await db.exec("insert into orders(tenant_id,order_type_id,lalamove_quotation_id) values ('lala','courier','verified-quote')")
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as count from orders')).rows[0].count, 4)
    console.log('Lalamove order RLS: 8 checks passed (anonymous bypasses denied, pickup/merchant/server writes preserved).')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
