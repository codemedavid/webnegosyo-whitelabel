// Replying from the merchant app (20261115073959) in PGlite over the chat log
// (20261111224021), as the role that really runs each query. Every read/write
// asserts rows or the SQLSTATE: RLS refusals are silent.
//
//   - the send route (service role) names the staff account on a line
//     (`sent_by`) and the webhook marks / clears "Needs a reply"
//   - readers see both under the chat's existing rule (orders rule): store-wide
//     accounts with an order key, branch accounts only their branch's chats,
//     nobody else; staff never write either column
//   - messenger_chats returns needs_reply_since, still as the caller (RLS)
//   - the migration runs twice (idempotent)
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, SEED, U, T_A, T_B } = require('./run-messenger-automations.cjs')
const { ORDERS, S, BRANCH_ORDERS, chatLogMigration } = require('./run-messenger-chat-log.cjs')

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

const MARKED = '2026-11-15T06:00:00.000Z'

async function seed(db) {
  await as(db, 'service_role', null)
  for (const [id, tenant, psid, minutesAgo] of [[S.a1, T_A, 'pA1', 5], [S.a2, T_A, 'pA2', 10], [S.a3, T_A, 'pA3', 15], [S.b1, T_B, 'pB1', 20]]) {
    await db.query(`insert into messenger_sessions (id, tenant_id, psid, first_name, last_message_at, last_message_preview)
      values ($1, $2, $3, 'Juan', now() - ($4 || ' minutes')::interval, 'pa order po')`, [id, tenant, psid, String(minutesAgo)])
  }
  eq((await rows(db, `insert into messenger_messages (tenant_id, session_id, direction, kind, body, mid, sent_at, sent_by)
      values ($1, $2, 'staff', 'text', 'Ready na po!', 'm.app.1', now(), $3) returning sent_by`, [T_A, S.a1, U.ordersOnly])),
    [{ sent_by: U.ordersOnly }], 'the send route names the staff account on its line')
  eq((await rows(db, `update messenger_sessions set needs_reply_since = $2 where id = any($1) and needs_reply_since is null returning psid`,
    [[S.a1, S.a2, S.b1], MARKED])).map((row) => row.psid).sort(), ['pA1', 'pA2', 'pB1'], 'the webhook marks chats Needs a reply')
  eq((await rows(db, 'update messenger_sessions set needs_reply_since = now() where id = $1 and needs_reply_since is null returning id', [S.a1])),
    [], '…and a second mark keeps the first time (oldest wait first)')
}

async function checkReaders(db) {
  const cases = [
    [U.owner, 'owner', [['pA1', MARKED], ['pA2', MARKED], ['pA3', null]]],
    [U.ordersOnly, 'staff with orders/pos', [['pA1', MARKED], ['pA2', MARKED], ['pA3', null]]],
    [BRANCH_ORDERS, 'branch A1 account', [['pA1', MARKED]]],
    [U.settings, 'staff without an order key', []],
    [U.ownerB, "another store's owner", [['pB1', MARKED]]],
  ]
  for (const [uid, label, expected] of cases) {
    await as(db, 'authenticated', uid)
    const seen = await rows(db, 'select psid, needs_reply_since from messenger_sessions order by psid')
    eq(seen.map((row) => [row.psid, row.needs_reply_since ? new Date(row.needs_reply_since).toISOString() : null]), expected,
      `${label} reads Needs a reply only on the chats the orders rule allows`)
  }

  await as(db, 'authenticated', U.owner)
  eq(await rows(db, "select body, sent_by from messenger_messages where mid = 'm.app.1'"), [{ body: 'Ready na po!', sent_by: U.ordersOnly }],
    'the owner sees who sent a reply from the app')
  await as(db, 'authenticated', U.settings)
  eq(await rows(db, "select sent_by from messenger_messages where mid = 'm.app.1'"), [], 'staff without an order key see no line, so no name')

  await as(db, 'authenticated', U.owner)
  await refused(db.query('update messenger_sessions set needs_reply_since = null where id = $1', [S.a1]), '42501', 'staff never clear Needs a reply directly')
  await refused(db.query('update messenger_messages set sent_by = $1', [U.owner]), '42501', '…nor change who sent a line')
  await refused(db.query('select cart_data from messenger_sessions'), '42501', 'the chat cart is still service-only')
  await refused(db.query('select * from messenger_sessions'), '42501', '…so select * is still refused')

  await asAnon(db)
  await refused(db.query('select needs_reply_since from messenger_sessions'), '42501', 'anon reads nothing')
  await refused(db.query('select * from public.messenger_chats($1)', [T_A]), '42501', 'anon cannot call messenger_chats')
}

async function checkChatList(db) {
  await as(db, 'authenticated', U.owner)
  const list = await rows(db, 'select session_id, needs_reply_since from public.messenger_chats($1)', [T_A])
  eq(list.map((row) => [row.session_id, row.needs_reply_since ? new Date(row.needs_reply_since).toISOString() : null]),
    [[S.a1, MARKED], [S.a2, MARKED], [S.a3, null]], 'the chats list carries Needs a reply, newest chat first')
  await as(db, 'authenticated', BRANCH_ORDERS)
  eq((await rows(db, 'select session_id from public.messenger_chats($1)', [T_A])).map((row) => row.session_id), [S.a1],
    'a branch account still lists only its branch chats')
  await as(db, 'authenticated', U.ownerB)
  eq(await rows(db, 'select session_id from public.messenger_chats($1)', [T_A]), [], "another store's owner lists nothing")

  await as(db, 'service_role', null)
  eq((await rows(db, 'update messenger_sessions set needs_reply_since = null where id = $1 and needs_reply_since is not null returning id', [S.a1])),
    [{ id: S.a1 }], 'a person answering clears it (service role, one row)')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(SEED)
    await db.exec(ORDERS)
    await db.exec(readMigration('20261110000421_messenger_automations.sql'))
    await db.exec(chatLogMigration())
    for (let pass = 0; pass < 2; pass += 1) await db.exec(readMigration('20261115073959_messenger_messages_sent_by.sql'))
    await reset(db)
    await seed(db)
    await checkReaders(db)
    await checkChatList(db)
    console.log(`Messenger reply-from-app SQL: ${checks} checks passed (migration applied twice: idempotent)`)
  } finally {
    await db.close()
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1 })
