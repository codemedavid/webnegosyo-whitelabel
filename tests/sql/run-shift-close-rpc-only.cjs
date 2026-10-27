// Shifts end only through close_shift / force_close_shift (20261027210000,
// held until no store closes the old way — RELEASE.md phase G). Applied on top
// of the cashier chain: an old build's direct close is refused for client
// roles; the RPC close and the service role are not.
const assert = require('node:assert/strict')
const { as, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  manager: '00000000-0000-4000-8000-000000000004',
}
const PEOPLE = `
  insert into tenants (id) values ('${T}');
  insert into outlets (id, tenant_id) values ('${A1}', '${T}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',   'admin', '${T}', true,  '{}',                null,    'Olivia'),
    ('${U.cashier}', 'admin', '${T}', false, '{pos}',             '${A1}', 'Cara'),
    ('${U.manager}', 'admin', '${T}', false, '{cash_manage,pos}', null,    'Mara');
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message, pattern) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    if (pattern) assert.match(error.message, pattern, `${message}: message`)
    return true
  }, message)
}
async function val(db, uid, sql, params) {
  await as(db, 'authenticated', uid)
  return Object.values((await db.query(sql, params)).rows[0])[0]
}
const open = async (db, uid) => (await val(db, uid, 'select public.open_shift($1, $2, null, 50000, null, null, null)', [T, A1])).shift.id
const DIRECT_CLOSE = "update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1"

async function main() {
  const db = await buildCashDb({ through: '20261027160000_cash_remittances.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    await reset(db)
    await db.exec(readMigration('20261027210000_shift_close_rpc_only.sql'))

    const s = await open(db, U.cashier)
    await as(db, 'authenticated', U.cashier)
    await refused(db.query(DIRECT_CLOSE, [s]), '42501', "an old build's direct close is refused", /update_required/)

    await val(db, U.cashier, 'select public.count_shift($1, 50000, null, 50000)', [s])
    const closed = await val(db, U.cashier, 'select public.close_shift($1, null, null, null, 50000, null, false, null)', [s])
    eq(typeof closed.closedAt, 'string', 'close_shift still ends the shift')

    const m = await open(db, U.manager)
    await as(db, 'authenticated', U.manager)
    await refused(db.query(DIRECT_CLOSE, [m]), '42501', 'a cash manager is refused the direct close too')

    await reset(db)
    eq((await db.query(DIRECT_CLOSE, [m])).affectedRows, 1, 'the service role (imports, support) is not affected')

    console.log(`Shift close RPC only: ${checks} checks passed (direct client close refused, close_shift works, service role untouched).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
