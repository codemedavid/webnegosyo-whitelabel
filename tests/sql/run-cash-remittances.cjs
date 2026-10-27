// Remittances (20261027160000): creation on every close path and per mode,
// CAS transitions per role (accept / dispute / resolve / accept_remittance_as),
// pickups, RLS reads, list_cash_receivers. Real chain via lib/cash-chain.cjs
// (+ the live staff_approval_pins columns for has_pin). Every call asserts
// rows or the SQLSTATE: a colleague's attempt is 0 rows, 42501 or P0002.
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  manager2: '00000000-0000-4000-8000-000000000005',
  a1Mgr: '00000000-0000-4000-8000-000000000006',
  a2Mgr: '00000000-0000-4000-8000-000000000007',
  legacy: '00000000-0000-4000-8000-000000000008',
  ownerB: '00000000-0000-4000-8000-000000000009',
}

const PEOPLE = `
  -- The live columns of staff_approval_pins (Senior/PWD approver PINs).
  create table public.staff_approval_pins (user_id uuid, tenant_id uuid, pin_hash text, failed_attempts integer default 0,
    locked_until timestamptz, updated_at timestamptz default now(), lock_count integer default 0, primary key (user_id, tenant_id));
  insert into tenants (id) values ('${T}'), ('${T_B}');
  insert into outlets (id, tenant_id) values ('${A1}', '${T}'), ('${A2}', '${T}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name, email) values
    ('${U.owner}',    'admin', '${T}',   true,  '{}',                 null,    'Olivia', 'olivia@example.com'),
    ('${U.cashier}',  'admin', '${T}',   false, '{pos}',              '${A1}', 'Cara',   'cara@example.com'),
    ('${U.cashier2}', 'admin', '${T}',   false, '{pos}',              '${A1}', 'Cy',     null),
    ('${U.manager}',  'admin', '${T}',   false, '{cash_manage,pos}',  null,    'Mara',   null),
    ('${U.manager2}', 'admin', '${T}',   false, '{cash_manage}',      null,    null,     'manny@example.com'),
    ('${U.a1Mgr}',    'admin', '${T}',   false, '{cash_manage}',      '${A1}', 'Ana',    null),
    ('${U.a2Mgr}',    'admin', '${T}',   false, '{cash_manage}',      '${A2}', 'Bea',    null),
    ('${U.legacy}',   'admin', '${T}',   false, null,                 null,    'Lee',    null),
    ('${U.ownerB}',   'admin', '${T_B}', true,  '{}',                 null,    'Bo',     null);
  insert into staff_approval_pins (user_id, tenant_id, pin_hash) values ('${U.manager}', '${T}', 'x');
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
async function scalar(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
async function call(db, uid, sql, params) {
  if (uid === 'anon') await asAnon(db)
  else if (uid === 'service') await as(db, 'service_role', null)
  else await as(db, 'authenticated', uid)
  return (await db.query(sql, params)).rows[0]
}
const val = async (db, uid, sql, params) => Object.values(await call(db, uid, sql, params))[0]
async function shiftFor(db, uid, { outlet = A1, floatCents = 50000 } = {}) {
  return (await val(db, uid, 'select public.open_shift($1, $2, null, $3, null, null, null)', [T, outlet, floatCents])).shift.id
}
async function countAndClose(db, uid, shift, cents, { remitTo = null, safe = false, floatKept = null } = {}) {
  await val(db, uid, 'select public.count_shift($1, $2, null, $2)', [shift, cents])
  return val(db, uid, 'select public.close_shift($1, null, $2, null, $3, $4, $5, null)', [shift, 'not_sure', floatKept, remitTo, safe])
}
async function remittance(db, shift, kind = 'shift') {
  await reset(db)
  return (await db.query('select * from cash_remittances where shift_id = $1 and kind = $2', [shift, kind])).rows[0]
}
const ACCEPT = 'select * from public.accept_remittance($1, $2, $3)'

async function checkCreation(db) {
  const s = await shiftFor(db, U.cashier)
  const closed = await countAndClose(db, U.cashier, s, 120000, { remitTo: U.manager, floatKept: 50000 })
  const r = await remittance(db, s)
  eq([closed.remittanceId, closed.handedOverCents], [r.id, 70000], 'close_shift answers with the remittance and the hand-over')
  eq([r.kind, r.status, Number(r.handed_over_cents), r.remitted_to, r.remitted_to_name, r.to_safe, r.cashier_name, r.cashier_user_id],
    ['shift', 'pending', 70000, U.manager, 'Mara', false, 'Cara', U.cashier], 'a pending shift remittance: count − float kept, to the chosen person')

  const bad = await shiftFor(db, U.cashier2)
  await val(db, U.cashier2, 'select public.count_shift($1, 50000, null, 50000)', [bad])
  await refused(val(db, U.cashier2, 'select public.close_shift($1, null, null, null, null, $2, false, null)', [bad, U.cashier]), '22023', 'remit-to must be someone who handles cash at this branch', /remit_to_invalid/)
  await refused(val(db, U.cashier2, 'select public.close_shift($1, null, null, null, null, $2, false, null)', [bad, U.a2Mgr]), '22023', 'a manager locked to another branch cannot receive it', /remit_to_invalid/)
  await reset(db)
  eq(await scalar(db, 'select status from staff_shifts where id = $1', [bad]), 'open', 'a refused remit-to rolls the close back')
  await val(db, U.cashier2, 'select public.close_shift($1, null, null, null, null, null, true, null)', [bad])
  const safe = await remittance(db, bad)
  eq([safe.to_safe, safe.remitted_to, Number(safe.handed_over_cents)], [true, null, 0], 'to the store safe')

  // An old build's direct close files NO remittance (QA wave 3: old tablets
  // never leave pending hand-overs or "waiting" pushes).
  const legacy = await shiftFor(db, U.cashier2)
  await as(db, 'authenticated', U.cashier2)
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 800, closing_count = 800 where id = $1", [legacy])).affectedRows, 1, 'an old build still closes directly')
  eq(await remittance(db, legacy), undefined, 'but its close files no remittance')
  // A hand-over to nobody in particular, through close_shift (to dispute below).
  const disputable = await shiftFor(db, U.cashier2)
  await countAndClose(db, U.cashier2, disputable, 80000, { floatKept: 50000 })
  const l = await remittance(db, disputable)
  eq([l.status, Number(l.handed_over_cents), l.remitted_to], ['pending', 30000, null], 'close_shift with no receiver: pending, to any cash manager')

  const forced = await shiftFor(db, U.cashier2)
  await val(db, U.manager, 'select public.force_close_shift($1, $2)', [forced, 'Left early'])
  eq((await remittance(db, forced)).handed_over_cents, null, 'a forced close: nothing counted, nothing claimed handed over')

  await reset(db)
  await db.query("insert into tenant_cash_settings (tenant_id, remittance_mode) values ($1, 'off')", [T])
  const off = await shiftFor(db, U.cashier2)
  const offClose = await countAndClose(db, U.cashier2, off, 50000)
  eq([offClose.remittanceId, await remittance(db, off)], [null, undefined], "remittance mode 'off': no remittance")
  await reset(db)
  await db.query("update tenant_cash_settings set remittance_mode = 'optional' where tenant_id = $1", [T])
  return { main: r.id, safe: safe.id, legacy: l.id, forced: (await remittance(db, forced)).id }
}

async function checkReads(db) {
  const count = async (uid) => {
    await as(db, 'authenticated', uid)
    return Number(await scalar(db, 'select count(*) from cash_remittances'))
  }
  eq(await count(U.manager), 4, 'a store-wide cash manager reads every remittance (main, safe, legacy, forced)')
  eq(await count(U.cashier), 1, 'the cashier reads their own')
  eq(await count(U.a2Mgr), 0, 'a manager at another branch reads none')
  eq(await count(U.ownerB), 0, "another store's owner reads none")
  await as(db, 'authenticated', U.manager)
  eq((await db.query('select r.id, s.staff_name from cash_remittances r join staff_shifts s on s.id = r.shift_id')).rows.length, 4, 'and the shifts behind them (the inbox embed)')
  await as(db, 'authenticated', U.manager)
  await refused(db.query("update cash_remittances set status = 'accepted'"), '42501', 'no client writes remittances')
  await refused(db.query("insert into cash_remittances (tenant_id, kind, shift_id, business_day, cashier_name) values ($1, 'shift', gen_random_uuid(), current_date, 'x')", [T]), '42501', 'nor inserts one')
  await asAnon(db)
  await refused(db.query('select count(*) from cash_remittances'), '42501', 'anon reads nothing')
}

async function checkTransitions(db, ids) {
  await refused(call(db, U.cashier, ACCEPT, [ids.main, 70000, null]), '42501', 'a cashier cannot receive (no cash_manage)')
  await refused(call(db, U.a2Mgr, ACCEPT, [ids.main, 70000, null]), 'P0002', "another branch's manager cannot see it")
  await refused(call(db, U.manager, ACCEPT, [ids.main, 69000, null]), '22023', 'a different amount needs a note', /note_required/)
  const ok = await call(db, U.manager, ACCEPT, [ids.main, 69000, 'Short one ₱10 bill'])
  eq([ok.status, Number(ok.received_cents), ok.received_by, ok.received_by_name, ok.accept_method, ok.is_self_received, ok.receiver_note],
    ['accepted', 69000, U.manager, 'Mara', 'app', false, 'Short one ₱10 bill'], 'accepted with the difference noted (full row returned)')
  await refused(call(db, U.manager2, ACCEPT, [ids.main, 69000, 'again']), 'P0002', 'accepting twice: P0002 (CAS)', /remittance_not_pending/)
  await reset(db)
  eq((await db.query("select flags from store_activity where kind = 'cash.remittance_accepted' and subject_ref = $1", [ids.main])).rows[0].flags, ['remittance_discrepancy'], 'a different amount is flagged in activity')

  // Dispute → resolve.
  await refused(call(db, U.manager, 'select * from public.dispute_remittance($1, $2, $3)', [ids.legacy, ' ', null]), '22023', 'a dispute needs a reason', /reason_required/)
  const disputed = await call(db, U.manager, 'select * from public.dispute_remittance($1, $2, $3)', [ids.legacy, 'Envelope short', 25000])
  eq([disputed.status, disputed.dispute_reason, Number(disputed.received_cents)], ['disputed', 'Envelope short', 25000], 'disputed')
  await refused(call(db, U.manager, ACCEPT, [ids.legacy, 30000, null]), 'P0002', 'a disputed hand-over cannot be accepted')
  await refused(call(db, U.cashier2, 'select * from public.resolve_remittance($1, $2)', [ids.legacy, 'paid back']), '42501', 'the cashier cannot settle their own dispute')
  await refused(call(db, U.manager2, 'select * from public.resolve_remittance($1, $2)', [ids.legacy, '']), '22023', 'settling needs a note')
  await refused(call(db, U.manager, 'select * from public.resolve_remittance($1, $2)', [ids.legacy, 'sorted']), '42501', 'the manager who disputed it cannot settle it too')
  const resolved = await call(db, U.manager2, 'select * from public.resolve_remittance($1, $2)', [ids.legacy, 'Found ₱50 in the drawer'])
  eq([resolved.status, resolved.resolved_note, resolved.resolved_by_name], ['resolved', 'Found ₱50 in the drawer', 'manny'], 'another cash manager settles it (name from the email\'s local part, never the email)')
  await refused(call(db, U.owner, 'select * from public.resolve_remittance($1, $2)', [ids.legacy, 'again']), 'P0002', 'settling twice: P0002')

  // The PIN route: service role only.
  await refused(call(db, U.manager, 'select * from public.accept_remittance_as($1, $2, $3, null)', [ids.safe, U.manager, 0]), '42501', 'accept_remittance_as is not callable by clients')
  await refused(call(db, 'service', 'select * from public.accept_remittance_as($1, $2, $3, null)', [ids.safe, U.cashier, 0]), '42501', 'the PIN receiver must handle cash')
  const pin = await call(db, 'service', 'select * from public.accept_remittance_as($1, $2, $3, null, $4)', [ids.safe, U.a1Mgr, 0, U.cashier])
  eq([pin.status, pin.accept_method, pin.received_by, pin.received_by_name], ['accepted', 'pin', U.a1Mgr, 'Ana'], 'PIN here now: accepted by the receiver the PIN proved')
  await reset(db)
  eq((await db.query("select actor_user_id from store_activity where kind = 'cash.remittance_accepted' and subject_ref = $1", [ids.safe])).rows[0].actor_user_id, U.cashier, 'the activity names who typed the PIN at the counter')
  // The forced close: nothing was claimed, so any amount the receiver counts is accepted without a note.
  eq((await call(db, U.manager, ACCEPT, [ids.forced, 41000, null])).status, 'accepted', 'a forced close is accepted at what the receiver counted')

  // The owner may receive their own shift's cash (self-received).
  const own = await shiftFor(db, U.owner)
  await countAndClose(db, U.owner, own, 50000, { remitTo: U.owner, floatKept: 0 })
  const self = await call(db, U.owner, ACCEPT, [(await remittance(db, own)).id, 50000, null])
  eq([self.status, self.is_self_received], ['accepted', true], 'the owner receives their own hand-over (marked self-received)')
  const mgrShift = await shiftFor(db, U.manager)
  await countAndClose(db, U.manager, mgrShift, 50000, { floatKept: 0 })
  await refused(call(db, U.manager, ACCEPT, [(await remittance(db, mgrShift)).id, 50000, null]), '42501', 'a non-owner manager cannot receive their own hand-over')
}

async function checkPickups(db) {
  const s = await shiftFor(db, U.cashier)
  const PICK = 'select public.record_cash_pickup($1, $2, $3, $4, $5)'
  const self = await val(db, U.manager, PICK, [s, 300000, null, false, 'Midday pickup'])
  eq(self.status, 'accepted', 'a manager who takes it themselves has received it')
  await reset(db)
  const move = (await db.query('select kind, amount::text, taken_by, taken_by_name, to_safe, recorded_by from shift_cash_movements where id = $1', [self.movementId])).rows[0]
  eq(move, { kind: 'collect', amount: '3000.00', taken_by: U.manager, taken_by_name: 'Mara', to_safe: false, recorded_by: U.manager }, 'the pickup is a collect movement with who took it')
  const handed = await val(db, U.cashier, PICK, [s, 10000, U.a1Mgr, false, null])
  eq(handed.status, 'pending', 'a cashier handing cash to a manager: pending until they accept')
  await refused(val(db, U.cashier, PICK, [s, 10000, null, false, null]), '22023', 'say who took it, or the safe', /taken_by_required/)
  await refused(val(db, U.cashier, PICK, [s, 10000, U.cashier2, false, null]), '22023', 'a cashier cannot be the taker', /taken_by_invalid/)
  eq((await val(db, U.cashier, PICK, [s, 5000, null, true, 'Safe drop'])).status, 'pending', 'a safe drop')
  await refused(val(db, U.cashier2, PICK, [s, 100, U.manager, false, null]), '42501', "a colleague cannot record a pickup from another drawer")
  await refused(val(db, U.cashier, PICK, [s, 0, U.manager, false, null]), '22023', 'an empty pickup is refused')
  await reset(db)
  eq(Number(await scalar(db, "select (cash.shift_expected(s, now()) ->> 'collectedCents') from staff_shifts s where id = $1", [s])), 315000, 'pickups come out of the expected drawer')

  // A direct insert (old builds; the holder's insert policy): no forged taker,
  // and the cash becomes a pending hand-over with nobody named.
  const direct = await call(db, U.cashier,
    "insert into shift_cash_movements (tenant_id, shift_id, kind, amount, recorded_by_name, taken_by, taken_by_name, to_safe) values ($1, $2, 'collect', 25.50, 'Cara', $3, 'Mara', true) returning id, taken_by, taken_by_name, to_safe",
    [T, s, U.manager])
  eq([direct.taken_by, direct.taken_by_name, direct.to_safe], [null, null, false], 'a direct collect cannot name who took it or the safe')
  await reset(db)
  const filed = (await db.query('select kind, status, handed_over_cents::text, remitted_to, cashier_user_id from cash_remittances where movement_id = $1', [direct.id])).rows[0]
  eq(filed, { kind: 'pickup', status: 'pending', handed_over_cents: '2550', remitted_to: null, cashier_user_id: U.cashier }, 'a direct collect is filed as a pending pickup hand-over')
  eq(Number(await scalar(db, "select count(*) from store_activity where kind = 'cash.remitted' and subject_ref = (select id::text from cash_remittances where movement_id = $1)", [direct.id])), 1, 'and logged like any hand-over')
  const payIn = await call(db, U.cashier, "insert into shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name) values ($1, $2, 'pay_in', 10, 'Change', 'Cara') returning id", [T, s])
  await reset(db)
  eq(Number(await scalar(db, 'select count(*) from cash_remittances where movement_id = $1', [payIn.id])), 0, 'a pay in files no hand-over')

  await countAndClose(db, U.cashier, s, 50000, { floatKept: 50000 })
  await refused(val(db, U.manager, PICK, [s, 100, null, false, null]), '55000', 'no pickup from a closed shift')

  // The shift's own cashier never receives their own pickup — unless they are the owner (marked self-received).
  const mine = await shiftFor(db, U.manager)
  await refused(val(db, U.manager, PICK, [mine, 1000, null, false, null]), '22023', 'a cash manager cannot pick up from their own drawer into their own hands', /taken_by_invalid/)
  await refused(val(db, U.manager, PICK, [mine, 1000, U.manager, false, null]), '22023', 'nor by naming themselves', /taken_by_invalid/)
  eq((await val(db, U.manager, PICK, [mine, 1000, U.manager2, false, null])).status, 'pending', 'handing it to another manager is fine')
  await countAndClose(db, U.manager, mine, 50000, { floatKept: 50000 })
  const ownersShift = await shiftFor(db, U.owner)
  const ownerPick = await val(db, U.owner, PICK, [ownersShift, 1000, null, false, null])
  await reset(db)
  eq((await db.query('select status, is_self_received from cash_remittances where id = $1', [ownerPick.remittanceId])).rows[0], { status: 'accepted', is_self_received: true }, "the owner's own pickup is received and marked self-received")
  await countAndClose(db, U.owner, ownersShift, 50000, { floatKept: 50000 })
}

async function checkReceivers(db) {
  const list = async (uid, outlet) => (await call(db, uid, 'select json_agg(r) as rows from public.list_cash_receivers($1, $2) r', [T, outlet])).rows ?? []
  const a1 = await list(U.cashier, A1)
  eq(a1.map((r) => r.name), ['Olivia', 'Ana', 'Lee', 'manny', 'Mara'], 'A1: the owner first, then everyone who handles cash there (A2-locked manager excluded)')
  eq(Object.keys(a1[0]).sort(), ['has_pin', 'is_on_shift', 'is_owner', 'last_seen_at', 'name', 'outlet_id', 'user_id'], 'no email, no phone, no PIN hash')
  eq(a1.find((r) => r.name === 'Mara').has_pin, true, 'has_pin when a PIN is set for this store')
  eq(a1.find((r) => r.name === 'Ana').has_pin, false, 'has_pin false otherwise')
  eq(typeof a1.find((r) => r.name === 'Mara').last_seen_at, 'string', 'last seen from their shifts / activity')
  eq((await list(U.cashier, null)).map((r) => r.name), ['Olivia', 'Lee', 'manny', 'Mara'], 'store-wide: branch-locked managers excluded')
  eq((await list(U.cashier, A2)).map((r) => r.name).includes('Bea'), true, "A2: its own manager is there")
  eq((await list(U.cashier, A1)).find((r) => r.name === 'Lee').is_on_shift, false, 'not on shift')
  const live = await shiftFor(db, U.legacy)
  eq((await list(U.cashier, A1)).find((r) => r.name === 'Lee').is_on_shift, true, 'is_on_shift for an open shift')
  await countAndClose(db, U.legacy, live, 50000)
  await refused(call(db, 'anon', 'select * from public.list_cash_receivers($1, $2)', [T, A1]), '42501', 'anon cannot list receivers')
  await refused(call(db, U.ownerB, 'select * from public.list_cash_receivers($1, $2)', [T, A1]), '42501', "another store's owner cannot")
}

async function main() {
  const db = await buildCashDb({ through: '20261027160000_cash_remittances.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    const ids = await checkCreation(db)
    await checkReads(db)
    await checkTransitions(db, ids)
    await checkPickups(db)
    await checkReceivers(db)
    console.log(`Cash remittances: ${checks} checks passed (creation per close path + mode, reads per role, accept / dispute / resolve CAS, PIN path, self-receive, pickups, receivers).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
