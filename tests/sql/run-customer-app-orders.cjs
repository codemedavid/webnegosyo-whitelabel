// Customer-app order index (Phase 4) over PGlite: the REAL migration
// 20261104120000_customer_app_orders.sql (after the real tenant_apps one) on
// stub tenants / customers shaped like the platform DB. Supabase's default
// grants are installed first, so the migration's REVOKE is what keeps
// anon/authenticated out.
//   node tests/sql/run-customer-app-orders.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER_STORE = '00000000-0000-4000-8000-000000000002'
const CUSTOMER = '00000000-0000-4000-8000-0000000000c1'
const OTHER_CUSTOMER = '00000000-0000-4000-8000-0000000000c2'
const STAFF = '00000000-0000-4000-8000-0000000000a1'
const SUMMARY = '{"lines":[],"totals":{"subtotal":0,"discount":0,"serviceCharge":0,"deliveryFee":0,"total":0}}'

const BASE = `
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create table public.tenants(id uuid primary key);
create table public.customers(id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade, phone_e164 text, created_source text);
create table public.orders(id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null);
-- What delete_customer_app_account touches besides the index (shapes as live).
create table public.customer_app_sessions(tenant_id uuid not null, customer_id uuid not null, phone_hash text);
create table public.customer_app_profiles(tenant_id uuid not null, customer_id uuid not null, display_name text);
create table public.loyalty_otp_challenges(tenant_id uuid not null, purpose text, verified_at timestamptz, phone_hash text);
create table public.loyalty_balances(customer_id uuid);
create table public.sms_sends(customer_id uuid);
insert into public.tenants(id) values ('${STORE}'), ('${OTHER_STORE}');
insert into public.customers(id, tenant_id, phone_e164) values
  ('${CUSTOMER}', '${STORE}', '+639170000001'), ('${OTHER_CUSTOMER}', '${STORE}', '+639170000002');
insert into auth.users(id) values ('${STAFF}');
`

const ROW = {
  tenant_id: STORE,
  app_id: STORE,
  customer_id: CUSTOMER,
  backend: 'platform',
  idempotency_key: 'key-00000001',
}

function insertRow(db, overrides = {}) {
  const row = { ...ROW, ...overrides }
  const columns = Object.keys(row)
  const values = columns.map((_, index) => `$${index + 1}`)
  return db.query(
    `insert into public.customer_app_orders (${columns.join(', ')}) values (${values.join(', ')}) returning id`,
    Object.values(row),
  )
}

async function refused(db, run, pattern, label) {
  await db.exec('savepoint s')
  await assert.rejects(run(), pattern, label)
  await db.exec('rollback to savepoint s')
}

async function clientRolesAreRefused(db) {
  for (const [label, enter] of [
    ['anon', () => asAnon(db)],
    ['authenticated', () => as(db, 'authenticated', STAFF)],
  ]) {
    await enter()
    await refused(db, () => db.query('select * from public.customer_app_orders'), /permission denied/, `${label} cannot read`)
    await refused(db, () => insertRow(db, { idempotency_key: `key-${label}-insert` }), /permission denied/, `${label} cannot insert`)
    await refused(db, () => db.query("update public.customer_app_orders set state = 'failed' returning id"), /permission denied/, `${label} cannot update`)
    await refused(db, () => db.query('delete from public.customer_app_orders returning id'), /permission denied/, `${label} cannot delete`)
  }
  await reset(db)
}

async function constraintsHold(db) {
  await as(db, 'service_role', null)
  const duplicate = /duplicate key/
  const check = /violates check constraint/
  await refused(db, () => insertRow(db), duplicate, 'one row per (store, idempotency key)')
  await refused(db, () => insertRow(db, { customer_id: OTHER_CUSTOMER }), duplicate, 'another customer cannot reuse a key')
  assert.equal((await insertRow(db, { tenant_id: OTHER_STORE, app_id: OTHER_STORE })).rows.length, 1, 'the same key at another store is fine')

  await refused(db, () => insertRow(db, { idempotency_key: 'short' }), check, 'key ≥ 8 chars')
  await refused(db, () => insertRow(db, { idempotency_key: 'k'.repeat(101) }), check, 'key ≤ 100 chars')
  await refused(db, () => insertRow(db, { idempotency_key: 'has a space' }), check, 'key is printable ASCII without spaces')
  await refused(db, () => insertRow(db, { idempotency_key: 'key-backend', backend: 'firebase' }), check, 'backend is one of three')
  await refused(db, () => insertRow(db, { idempotency_key: 'key-app-mismatch', app_id: OTHER_STORE }), check, 'app is the store’s own')
  await refused(db, () => insertRow(db, { idempotency_key: 'key-state', state: 'done' }), check, 'state is placing/placed/failed')
  await refused(db, () => insertRow(db, { idempotency_key: 'key-summary', summary: '[]' }), check, 'summary is an object')

  // placed ⇒ order id, placed_at and a summary.
  await refused(db, () => db.query("update public.customer_app_orders set state = 'placed', placed_at = now(), summary = $1 where idempotency_key = $2", [SUMMARY, ROW.idempotency_key]), check, 'placed needs an order id')
  await refused(db, () => db.query("update public.customer_app_orders set state = 'placed', order_id = 'o-1', summary = $1 where idempotency_key = $2", [SUMMARY, ROW.idempotency_key]), check, 'placed needs placed_at')
  await refused(db, () => db.query("update public.customer_app_orders set state = 'placed', order_id = 'o-1', placed_at = now() where idempotency_key = $1", [ROW.idempotency_key]), check, 'placed needs a summary')

  const placed = await db.query(
    "update public.customer_app_orders set state = 'placed', order_id = 'o-1', placed_at = now(), summary = $1 where idempotency_key = $2 and tenant_id = $3 and state = 'placing' returning id",
    [SUMMARY, ROW.idempotency_key, STORE],
  )
  assert.equal(placed.rows.length, 1, 'service role marks the claim placed')

  // now() is the transaction's clock here, so start from a stamp in the past.
  const stale = await insertRow(db, { idempotency_key: 'key-updated-at', updated_at: '2000-01-01T00:00:00Z' })
  const touched = await db.query("update public.customer_app_orders set last_status = 'ready' where id = $1 returning updated_at", [stale.rows[0].id])
  assert.ok(touched.rows[0].updated_at > new Date('2000-01-02T00:00:00Z'), 'updated_at moves on update')

  // One index row per backend order.
  await insertRow(db, { idempotency_key: 'key-00000002' })
  await refused(db, () => db.query("update public.customer_app_orders set state = 'placed', order_id = 'o-1', placed_at = now(), summary = $1 where idempotency_key = 'key-00000002'", [SUMMARY]), duplicate, 'an order is indexed once')
  await reset(db)
}

async function deletionsBehave(db) {
  await reset(db)
  await db.query('insert into public.orders(id, customer_id) values ($1, $2)', ['00000000-0000-4000-8000-0000000000d1', CUSTOMER])
  await insertRow(db, { customer_id: OTHER_CUSTOMER, idempotency_key: 'key-other-customer' })

  await refused(db, () => db.query('delete from public.tenant_apps where tenant_id = $1', [STORE]), /violates foreign key/, 'removing the app does not erase its customers’ history')

  await db.query('delete from public.customers where id = $1', [CUSTOMER])
  const left = (await db.query('select customer_id from public.customer_app_orders where tenant_id = $1', [STORE])).rows
  assert.deepEqual(left.map((row) => row.customer_id), [OTHER_CUSTOMER], 'deleting the customer drops only their app index')
  assert.equal((await db.query('select count(*)::int as n from public.orders where customer_id is null')).rows[0].n, 1, 'the store keeps the order')

  await db.query('delete from public.tenants where id = $1', [STORE])
  assert.equal((await db.query('select count(*)::int as n from public.customer_app_orders where tenant_id = $1', [STORE])).rows[0].n, 0, 'deleting the store cascades app + index together')
}

// 20261104120100: deleting the app account drops ONLY that customer's index
// rows at that store; the customer record (kept: it has an order), other
// customers' rows and the order itself stay.
async function accountDeletionDropsIndex(db) {
  await reset(db)
  await db.query('insert into public.orders(id, customer_id) values ($1, $2)', ['00000000-0000-4000-8000-0000000000d2', CUSTOMER])
  await db.query('insert into public.customer_app_profiles(tenant_id, customer_id) values ($1, $2)', [STORE, CUSTOMER])
  await insertRow(db, { idempotency_key: 'key-deleted-1' })
  await insertRow(db, { idempotency_key: 'key-deleted-2', state: 'failed' })
  await insertRow(db, { customer_id: OTHER_CUSTOMER, idempotency_key: 'key-survivor' })
  const before = (await db.query('select count(*)::int as n from public.customer_app_orders')).rows[0].n
  const mineBefore = (await db.query('select count(*)::int as n from public.customer_app_orders where customer_id = $1 and tenant_id = $2', [CUSTOMER, STORE])).rows[0].n
  const elsewhereBefore = (await db.query('select count(*)::int as n from public.customer_app_orders where customer_id = $1 and tenant_id = $2', [CUSTOMER, OTHER_STORE])).rows[0].n
  assert.equal(elsewhereBefore, 1, 'fixture: the same customer id holds a row at another store')
  assert.ok(mineBefore >= 2, 'the customer has app history to delete')

  for (const [label, enter] of [['anon', () => asAnon(db)], ['authenticated', () => as(db, 'authenticated', STAFF)]]) {
    await enter()
    await refused(db, () => db.query('select public.delete_customer_app_account($1, $2)', [STORE, CUSTOMER]), /permission denied/, `${label} cannot delete an app account`)
  }

  await as(db, 'service_role', null)
  const result = (await db.query('select public.delete_customer_app_account($1, $2) as r', [STORE, CUSTOMER])).rows[0].r
  assert.deepEqual(result, { ok: true, removedProfile: 1, removedCustomer: 0 }, 'the account goes, the customer record stays')
  await reset(db)
  const mine = (await db.query('select count(*)::int as n from public.customer_app_orders where customer_id = $1 and tenant_id = $2', [CUSTOMER, STORE])).rows[0].n
  assert.equal(mine, 0, 'every app-order index row of the deleted account is gone')
  const elsewhere = (await db.query('select count(*)::int as n from public.customer_app_orders where customer_id = $1 and tenant_id = $2', [CUSTOMER, OTHER_STORE])).rows[0].n
  assert.equal(elsewhere, 1, 'another store’s rows are not this account’s')
  const after = (await db.query('select count(*)::int as n from public.customer_app_orders')).rows[0].n
  assert.equal(before - after, mineBefore, 'only that customer’s rows went')
  const survivor = (await db.query("select count(*)::int as n from public.customer_app_orders where idempotency_key = 'key-survivor'")).rows[0].n
  assert.equal(survivor, 1, 'another customer’s app history is untouched')
  assert.equal((await db.query('select count(*)::int as n from public.customers where id = $1', [CUSTOMER])).rows[0].n, 1, 'the store keeps its customer record')
  assert.equal((await db.query('select count(*)::int as n from public.orders where id = $1', ['00000000-0000-4000-8000-0000000000d2'])).rows[0].n, 1, 'the store keeps the order')

  const grants = (await db.query("select prosecdef, proconfig from pg_proc where proname = 'delete_customer_app_account'")).rows[0]
  assert.equal(grants.prosecdef, true, 'still SECURITY DEFINER')
  assert.deepEqual(grants.proconfig, ['search_path=public'], 'still pinned to public')

  // Leave the fixture as deletionsBehave expects it.
  await db.query("delete from public.customer_app_orders where idempotency_key = 'key-survivor'")
  await db.query('delete from public.orders where id = $1', ['00000000-0000-4000-8000-0000000000d2'])
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(BASE)
    await db.exec(readMigration('20261026150000_tenant_apps.sql'))
    await db.exec(`insert into public.tenant_apps(tenant_id, display_name, bundle_id, android_package) values
      ('${STORE}', 'Kape', 'com.webnegosyo.kape', 'com.webnegosyo.kape'),
      ('${OTHER_STORE}', 'Other', 'com.webnegosyo.other', 'com.webnegosyo.other')`)
    await db.exec(readMigration('20261104120000_customer_app_orders.sql'))
    await db.exec(readMigration('20261104120100_customer_app_account_delete_orders.sql'))

    const rls = (await db.query("select relrowsecurity from pg_class where oid = 'public.customer_app_orders'::regclass")).rows[0]
    assert.equal(rls.relrowsecurity, true, 'RLS is on')
    const policies = (await db.query("select count(*)::int as n from pg_policies where tablename = 'customer_app_orders'")).rows[0].n
    assert.equal(policies, 0, 'no policies: service role only')

    await db.exec('begin')
    await as(db, 'service_role', null)
    const claimed = await insertRow(db)
    assert.equal(claimed.rows.length, 1, 'service role claims a key')
    const read = (await db.query('select state, order_id, summary from public.customer_app_orders where id = $1', [claimed.rows[0].id])).rows[0]
    assert.deepEqual(read, { state: 'placing', order_id: null, summary: null }, 'a claim starts placing')
    const ignored = await db.query(
      `insert into public.customer_app_orders (tenant_id, app_id, customer_id, backend, idempotency_key)
       values ($1, $1, $2, 'platform', $3) on conflict (tenant_id, idempotency_key) do nothing returning id`,
      [STORE, OTHER_CUSTOMER, ROW.idempotency_key],
    )
    assert.equal(ignored.rows.length, 0, 'a second claim of the key inserts nothing')

    await clientRolesAreRefused(db)
    await constraintsHold(db)
    await accountDeletionDropsIndex(db)
    await deletionsBehave(db)

    await db.exec('rollback')
    console.log('customer_app_orders SQL checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
