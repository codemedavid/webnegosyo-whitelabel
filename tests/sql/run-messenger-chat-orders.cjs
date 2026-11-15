// Orders staff ring up for a Messenger customer (20261115013219) in PGlite over
// the chat log (20261111224021), as the role that really runs each query.
// Every read/write asserts rows or the SQLSTATE: RLS refusals are silent.
//
//   - messenger_chat_orders: service-role writes only; one row per order is
//     the once-only claim; only known states / outcomes
//   - readers = whoever may read the ORDER: store-wide order readers, a branch
//     account only its branch's orders; staff without an order key, other
//     stores and anon read nothing, and nobody but the service role writes
//   - the attach function puts the chat's PSID on the order only when the chat
//     belongs to the order's own store; staff and anon cannot call it
//   - the orders trigger posts once for a NEW order naming a chat, never for
//     other orders or later updates, and a broken pg_net never fails the insert
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, SEED, U, T_A, T_B } = require('./run-messenger-automations.cjs')
const { ORDERS, O, S, OUT_A1, BRANCH_ORDERS, chatLogMigration } = require('./run-messenger-chat-log.cjs')

const NEW_ORDER = 'dddddddd-0000-4000-8000-000000000101'
const FOREIGN_CHAT_ORDER = 'dddddddd-0000-4000-8000-000000000102'
const PLAIN_ORDER = 'dddddddd-0000-4000-8000-000000000103'
const JUNK_ORDER = 'dddddddd-0000-4000-8000-000000000104'
const QUIET_ORDER = 'dddddddd-0000-4000-8000-000000000105'

const NET = `
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
  grant insert on orders to authenticated;
  create policy orders_insert_own_store on orders for insert to authenticated
    with check (tenant_id = (select app_user_admin_tenant_id()));
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

async function seedSessions(db) {
  await as(db, 'service_role', null)
  for (const [id, tenant, psid] of [[S.a1, T_A, '24000000000000001'], [S.b1, T_B, '24000000000000002']]) {
    await db.query('insert into messenger_sessions (id, tenant_id, psid, last_inbound_at) values ($1, $2, $3, now())', [id, tenant, psid])
  }
}

async function checkTrigger(db) {
  const calls = async () => rows(db, 'select url, body from net_calls')

  // The register inserts as the signed-in cashier.
  await as(db, 'authenticated', U.owner)
  await db.query(`insert into orders (id, tenant_id, outlet_id, status, customer_data) values ($1, $2, $3, 'pending', $4)`,
    [NEW_ORDER, T_A, OUT_A1, { name: 'Ana', messenger_session_id: S.a1 }])
  eq(await calls(), [{ url: 'https://www.webnegosyo.com/api/messenger/chat-order', body: { order_id: NEW_ORDER } }],
    'a new order naming a chat posts its id once')
  await db.query(`insert into orders (id, tenant_id, outlet_id, customer_data) values ($1, $2, $3, '{"name":"Walk-in"}')`, [PLAIN_ORDER, T_A, OUT_A1])
  eq((await calls()).length, 1, 'an ordinary register sale posts nothing')

  await as(db, 'service_role', null)
  await db.query("update orders set status = 'confirmed' where id = $1", [NEW_ORDER])
  await db.query(`update orders set customer_data = customer_data || '{"note":"x"}' where id = $1`, [NEW_ORDER])
  eq((await calls()).length, 1, 'later changes to the order post nothing (the summary goes out once)')

  await db.query('insert into net_broken values (true)')
  await as(db, 'authenticated', U.owner)
  eq((await rows(db, `insert into orders (id, tenant_id, outlet_id, customer_data) values ($1, $2, $3, $4) returning id`,
    [QUIET_ORDER, T_A, OUT_A1, { messenger_session_id: S.a1 }])).length, 1, 'a broken pg_net queue never fails the sale')
  await as(db, 'service_role', null)
  await db.query('delete from net_broken')

  await as(db, 'authenticated', U.owner)
  await refused(db.query('select public.notify_messenger_chat_order()'), '42501', 'staff cannot call the trigger function')
}

async function checkAttach(db) {
  await as(db, 'service_role', null)
  // A register naming ANOTHER store's chat, and one naming nonsense.
  await db.query('insert into orders (id, tenant_id, outlet_id, customer_data) values ($1, $2, $3, $4), ($5, $2, $3, $6)',
    [FOREIGN_CHAT_ORDER, T_A, OUT_A1, { messenger_session_id: S.b1 }, JUNK_ORDER, { messenger_session_id: "x' or 1=1 --" }])

  eq(await rows(db, 'select public.messenger_attach_chat_order_customer($1) as ok', [NEW_ORDER]), [{ ok: true }],
    "the chat's customer goes on the order")
  eq((await rows(db, 'select customer_data from orders where id = $1', [NEW_ORDER]))[0].customer_data.messenger_psid, '24000000000000001',
    '…with the PSID read from the session row')
  eq((await rows(db, 'select customer_data from orders where id = $1', [NEW_ORDER]))[0].customer_data.name, 'Ana',
    '…and nothing else on the order is lost')
  eq(await rows(db, 'select public.messenger_attach_chat_order_customer($1) as ok', [FOREIGN_CHAT_ORDER]), [{ ok: false }],
    "another store's chat is never attached")
  eq((await rows(db, "select customer_data ? 'messenger_psid' as has from orders where id = $1", [FOREIGN_CHAT_ORDER]))[0].has, false,
    '…the order carries no customer')
  eq(await rows(db, 'select public.messenger_attach_chat_order_customer($1) as ok', [JUNK_ORDER]), [{ ok: false }], 'a made-up chat id attaches nothing')
  eq(await rows(db, 'select public.messenger_attach_chat_order_customer($1) as ok', [PLAIN_ORDER]), [{ ok: false }], 'an ordinary sale attaches nothing')

  for (const [setRole, label] of [[(d) => asAnon(d), 'anon'], [(d) => as(d, 'authenticated', U.owner), 'the owner']]) {
    await setRole(db)
    await refused(db.query('select public.messenger_attach_chat_order_customer($1)', [NEW_ORDER]), '42501', `${label} cannot call the attach function`)
  }
}

async function checkClaimsAndReaders(db) {
  await as(db, 'service_role', null)
  const claim = 'insert into messenger_chat_orders (order_id, tenant_id, session_id) values ($1, $2, $3) on conflict (order_id) do nothing returning order_id'
  eq((await rows(db, claim, [NEW_ORDER, T_A, S.a1])).length, 1, 'the route claims the order')
  eq((await rows(db, claim, [NEW_ORDER, T_A, S.a1])).length, 0, 'a replay finds the claim taken')
  eq((await rows(db, "update messenger_chat_orders set state = 'waiting', outcome = 'sent', summary_sent_at = now() where order_id = $1 returning state", [NEW_ORDER])).length, 1,
    'and records that the summary went out')
  await refused(db.query("update messenger_chat_orders set outcome = 'carrier_pigeon'"), '23514', 'only known outcomes')
  await refused(db.query("update messenger_chat_orders set state = 'maybe'"), '23514', 'only known states')
  // An order of the OTHER branch (A2) of the same store, to test the branch rule.
  eq((await rows(db, claim, [O.a2, T_A, null])).length, 1, 'a claim for an order of branch A2')

  for (const [uid, label, expected] of [
    [U.owner, 'the owner', [NEW_ORDER, O.a2].sort()],
    [U.ordersOnly, 'orders-only staff', [NEW_ORDER, O.a2].sort()],
    [BRANCH_ORDERS, 'a branch A1 account', [NEW_ORDER]],
    [U.settings, 'staff without an order key', []],
    [U.ownerB, "another store's owner", []],
  ]) {
    await as(db, 'authenticated', uid)
    eq((await rows(db, 'select order_id from messenger_chat_orders order by order_id')).map((row) => row.order_id), expected,
      `${label} reads ${expected.length} row(s)`)
    await refused(db.query("update messenger_chat_orders set state = 'confirmed'"), '42501', `${label} cannot change a row`)
    await refused(db.query('insert into messenger_chat_orders (order_id, tenant_id) values ($1, $2)', [PLAIN_ORDER, T_A]), '42501',
      `${label} cannot forge a claim (which would silence a summary)`)
    await refused(db.query('delete from messenger_chat_orders'), '42501', `${label} cannot delete a row`)
  }
  await asAnon(db)
  await refused(db.query('select order_id from messenger_chat_orders'), '42501', 'anon cannot read the rows')

  // The customer's Confirm tap: one conditional update, harmless when repeated.
  await as(db, 'service_role', null)
  await db.query("update orders set status = 'pending' where id = $1", [NEW_ORDER])
  const confirm = "update orders set status = 'confirmed' where id = $1 and tenant_id = $2 and status = 'pending' returning id"
  eq((await rows(db, confirm, [NEW_ORDER, T_A])).length, 1, 'Confirm moves a waiting order to confirmed')
  eq((await rows(db, confirm, [NEW_ORDER, T_A])).length, 0, 'a second tap changes nothing')
  eq((await rows(db, confirm, [NEW_ORDER, T_B])).length, 0, "a tap on another store's Page never reaches the order")

  await db.query('delete from orders where id = $1', [NEW_ORDER])
  eq(await rows(db, 'select order_id from messenger_chat_orders where order_id = $1', [NEW_ORDER]), [], 'deleting the order removes its row')
  await db.query('delete from messenger_sessions where id = $1', [S.a1])
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(SEED)
    await db.exec(ORDERS)
    await db.exec(NET)
    await db.exec(readMigration('20261110000421_messenger_automations.sql'))
    await db.exec(chatLogMigration())
    for (let pass = 0; pass < 2; pass += 1) await db.exec(readMigration('20261115013219_messenger_chat_orders.sql'))
    await reset(db)
    await seedSessions(db)
    await checkTrigger(db)
    await checkAttach(db)
    await checkClaimsAndReaders(db)
    console.log(`Messenger chat orders SQL: ${checks} checks passed (migration applied twice: idempotent)`)
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
