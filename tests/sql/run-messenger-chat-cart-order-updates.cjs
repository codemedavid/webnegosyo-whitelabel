// Messenger automations release 2 (20261110080757 + 20261111090100 + 090200) in
// PGlite over release 1 (20261110000421), as the role that really runs each
// query. Every write asserts affected rows or the SQLSTATE.
//
//   - the 'cart' rule action is accepted, unknown kinds still refused
//   - order_updates: managers read/write it, everyone else sees/changes nothing
//   - messenger_order_updates: service role only; (order, status) is the claim
//   - the orders trigger posts once per real status change of a chat order,
//     never for other orders, and a broken pg_net never fails the order write
//   - after 090200 the same PSID can exist on two stores
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, SEED, U, T_A, T_B, RULE, ruleId, save } = require('./run-messenger-automations.cjs')

const ORDER_CHAT = 'dddddddd-0000-4000-8000-000000000001'
const ORDER_WEB = 'dddddddd-0000-4000-8000-000000000002'

// public.orders (only the columns the trigger reads) and a pg_net stand-in that logs each call.
const ORDERS_AND_NET = `
  create table orders (
    id uuid primary key, tenant_id uuid not null references tenants(id),
    status text not null default 'pending', customer_data jsonb, created_at timestamptz not null default now()
  );
  create schema if not exists extensions;
  create schema if not exists net;
  create table net_calls (url text, body jsonb);
  create table net_broken (on_off boolean);
  create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language plpgsql as $$
  begin
    if exists (select 1 from public.net_broken where on_off) then raise exception 'queue down'; end if;
    insert into public.net_calls values (url, body);
    return 1;
  end $$;
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    return true
  }, message)
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows

async function checkCartAction(db) {
  await as(db, 'authenticated', U.owner)
  const cartRule = { ...RULE(ruleId(1)), action: { kind: 'cart' } }
  eq(await save(db, T_A, 0, [cartRule]), 1, "the owner saves a rule whose action is 'cart'")
  await refused(db.query('insert into messenger_rules (tenant_id, name, trigger, action) values ($1, $2, $3, $4)',
    [T_A, 'x', { kind: 'fallback' }, { kind: 'checkout_now' }]), '23514', 'an unknown action kind is still refused')
}

async function checkOrderUpdatesSetting(db) {
  const config = { enabled: true, statuses: ['ready'], texts: { ready: 'Ready!' } }
  for (const [uid, label] of [[U.owner, 'owner'], [U.settings, 'settings staff']]) {
    await as(db, 'authenticated', uid)
    eq((await rows(db, 'update messenger_settings set order_updates = $1 where tenant_id = $2 returning tenant_id', [config, T_A])).length, 1,
      `${label} saves the status-message settings`)
    eq((await rows(db, 'select order_updates from messenger_settings where tenant_id = $1', [T_A]))[0].order_updates, config, `${label} reads them back`)
  }
  for (const [uid, label] of [[U.ordersOnly, 'orders-only staff'], [U.branchSettings, 'branch-locked staff'], [U.ownerB, "another store's owner"]]) {
    await as(db, 'authenticated', uid)
    eq((await rows(db, "update messenger_settings set order_updates = '{}'::jsonb returning tenant_id")).length, 0, `${label} changes nothing`)
    eq(await rows(db, 'select order_updates from messenger_settings'), [], `${label} reads nothing`)
  }
  await as(db, 'authenticated', U.ownerB)
  eq((await rows(db, 'insert into messenger_settings (tenant_id, order_updates) values ($1, $2) returning tenant_id', [T_B, config])).length, 1,
    'an owner with no settings row yet inserts one with the status-message settings')
  await refused(db.query('insert into messenger_settings (tenant_id, order_updates) values ($1, $2)', [T_A, config]), '42501',
    "…but never another store's")
  await as(db, 'authenticated', U.owner)
  await refused(db.query("update messenger_settings set order_updates = to_jsonb(repeat('x', 5000))"), '23514', 'a non-object / oversized value fails the check')
  await asAnon(db)
  await refused(db.query('select order_updates from messenger_settings'), '42501', 'anon cannot read them')
}

// 20261111212438: the Studio's wording column rides the same grants and policies.
async function checkMessagesSetting(db) {
  const words = { lang: 'tl', 'cart.added': 'Nadagdag {item}!', 'cart.show_empty_cart': false }
  for (const [uid, label] of [[U.owner, 'owner'], [U.settings, 'settings staff']]) {
    await as(db, 'authenticated', uid)
    eq((await rows(db, 'update messenger_settings set messages = $1 where tenant_id = $2 returning tenant_id', [words, T_A])).length, 1,
      `${label} saves the bot's wording`)
    eq((await rows(db, 'select messages from messenger_settings where tenant_id = $1', [T_A]))[0].messages, words, `${label} reads it back`)
  }
  for (const [uid, label] of [[U.ordersOnly, 'orders-only staff'], [U.branchSettings, 'branch-locked staff'], [U.ownerB, "another store's owner"]]) {
    await as(db, 'authenticated', uid)
    eq((await rows(db, "update messenger_settings set messages = '{}'::jsonb where tenant_id = $1 returning tenant_id", [T_A])).length, 0,
      `${label} changes no wording`)
    eq(await rows(db, 'select messages from messenger_settings where tenant_id = $1', [T_A]), [], `${label} reads no wording`)
  }
  await as(db, 'authenticated', U.ownerB)
  await refused(db.query('insert into messenger_settings (tenant_id, messages) values ($1, $2)', [T_A, words]), '42501',
    "an owner never writes another store's wording")
  await as(db, 'authenticated', U.owner)
  await refused(db.query("update messenger_settings set messages = '[1]'::jsonb where tenant_id = $1", [T_A]), '23514', 'wording must be an object')
  await refused(db.query("update messenger_settings set messages = jsonb_build_object('x', repeat('y', 40000)) where tenant_id = $1", [T_A]), '23514',
    'oversized wording fails the check')
  await refused(db.query("update messenger_settings set tester_psid = 'x' where tenant_id = $1", [T_A]), '42501', 'the tester PSID stays service-role only')
  await asAnon(db)
  await refused(db.query('select messages from messenger_settings'), '42501', 'anon cannot read the wording')
}

async function checkClaims(db) {
  await db.query(`insert into orders (id, tenant_id, customer_data) values ($1, $2, '{"messenger_psid":"24000000000000001"}'), ($3, $2, '{"name":"Ana"}')`,
    [ORDER_CHAT, T_A, ORDER_WEB])
  for (const [setRole, label] of [[(d) => asAnon(d), 'anon'], [(d) => as(d, 'authenticated', U.owner), 'the owner']]) {
    await setRole(db)
    await refused(db.query('select order_id from messenger_order_updates'), '42501', `${label} cannot read the claims`)
    await refused(db.query("insert into messenger_order_updates (order_id, status, tenant_id) values ($1, 'ready', $2)", [ORDER_CHAT, T_A]), '42501',
      `${label} cannot forge a claim (which would silence a status message)`)
  }
  await as(db, 'service_role', null)
  eq((await rows(db, "insert into messenger_order_updates (order_id, status, tenant_id) values ($1, 'ready', $2) on conflict do nothing returning order_id", [ORDER_CHAT, T_A])).length, 1,
    'the route claims (order, ready)')
  eq((await rows(db, "insert into messenger_order_updates (order_id, status, tenant_id) values ($1, 'ready', $2) on conflict do nothing returning order_id", [ORDER_CHAT, T_A])).length, 0,
    'a replay finds the claim taken')
  eq((await rows(db, "update messenger_order_updates set outcome = 'sent' where order_id = $1 and status = 'ready' returning outcome", [ORDER_CHAT])).length, 1, 'and records the outcome')
  await refused(db.query("update messenger_order_updates set outcome = 'delivered_by_pigeon'"), '23514', 'only known outcomes')
  await refused(db.query("insert into messenger_order_updates (order_id, status, tenant_id) values ($1, 'pending', $2)", [ORDER_WEB, T_A]), '23514', 'pending is not an update status')
  await db.query('delete from messenger_order_updates')
}

async function checkTrigger(db) {
  await as(db, 'service_role', null)
  await db.query('delete from net_calls')
  const calls = async () => rows(db, 'select url, body from net_calls')

  await db.query("update orders set status = 'preparing' where id = $1", [ORDER_CHAT])
  eq(await calls(), [{ url: 'https://www.webnegosyo.com/api/messenger/order-update', body: { order_id: ORDER_CHAT } }],
    'a chat order moving to preparing posts its id once')
  await db.query("update orders set status = 'preparing' where id = $1", [ORDER_CHAT])
  await db.query("update orders set customer_data = customer_data || '{\"note\":\"x\"}' where id = $1", [ORDER_CHAT])
  eq((await calls()).length, 1, 'the same status again, or another column, posts nothing')
  await db.query("update orders set status = 'ready' where id = $1", [ORDER_WEB])
  eq((await calls()).length, 1, 'an order that did not come from a chat posts nothing')
  await db.query("update orders set status = 'pending' where id = $1", [ORDER_CHAT])
  eq((await calls()).length, 1, 'moving back to pending posts nothing')

  await db.query('insert into net_broken values (true)')
  eq((await rows(db, "update orders set status = 'ready' where id = $1 returning status", [ORDER_CHAT])).length, 1,
    'a broken pg_net queue never fails the order write')
  await db.query('delete from net_broken')

  await as(db, 'authenticated', U.owner)
  await refused(db.query('select public.notify_messenger_order_update()'), '42501', 'staff cannot call the trigger function')
}

async function checkSessions(db) {
  await as(db, 'service_role', null)
  await db.query("insert into messenger_sessions (tenant_id, psid) values ($1, '24000000000000005')", [T_A])
  eq((await rows(db, "select cart_version from messenger_sessions where psid = '24000000000000005'")), [{ cart_version: 0 }], 'a new session starts at cart_version 0')
  eq((await rows(db, "update messenger_sessions set cart_data = '[]', cart_version = 1 where psid = '24000000000000005' and cart_version = 0 returning id")).length, 1,
    'a compare-and-set cart write lands once')
  eq((await rows(db, "update messenger_sessions set cart_data = '[]', cart_version = 1 where psid = '24000000000000005' and cart_version = 0 returning id")).length, 0,
    '…and the racing second one is refused (zero rows)')
  await refused(db.query("insert into messenger_sessions (tenant_id, psid) values ($1, '24000000000000005')", [T_B]), '23505',
    'before 090200 the old UNIQUE(psid) still holds')
  await reset(db)
  await db.exec(readMigration('20261111090200_messenger_sessions_drop_psid_unique.sql'))
  await db.exec(readMigration('20261111090200_messenger_sessions_drop_psid_unique.sql'))
  await as(db, 'service_role', null)
  eq((await rows(db, "insert into messenger_sessions (tenant_id, psid) values ($1, '24000000000000005') returning id", [T_B])).length, 1,
    'after 090200 the same PSID can belong to two stores')
  await refused(db.query("insert into messenger_sessions (tenant_id, psid) values ($1, '24000000000000005')", [T_B]), '23505', '(store, psid) is still unique')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(ORDERS_AND_NET)
    await db.exec(SEED)
    await db.exec(readMigration('20261110000421_messenger_automations.sql'))
    for (let pass = 0; pass < 2; pass += 1) {
      await db.exec(readMigration('20261110080757_messenger_chat_cart_order_updates.sql'))
      await db.exec(readMigration('20261111090100_orders_messenger_psid_idx.sql'))
      await db.exec(readMigration('20261111212438_messenger_settings_messages.sql'))
    }
    await reset(db)
    await checkCartAction(db)
    await checkOrderUpdatesSetting(db)
    await checkMessagesSetting(db)
    await checkClaims(db)
    await checkTrigger(db)
    await checkSessions(db)
    console.log(`Messenger chat cart + order updates + wording SQL: ${checks} checks passed (migrations applied twice: idempotent)`)
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
