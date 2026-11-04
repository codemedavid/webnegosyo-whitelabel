// End shift v2 (20261027150000 + 150010): open_shift (join / stale / handover),
// preview_shift_close, count_shift (attempts, reveal after count),
// close_shift (last count, reason rule, CAS), force_close_shift, the blind
// legacy guard, the close_kind rule, shift_counts RLS and blind-aware activity.
// Real chain via lib/cash-chain.cjs plus the REAL staff-shift activity
// section of 20261012151100. Every call asserts rows or the SQLSTATE.
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const DRAWER = 'dddddddd-0000-4000-8000-000000000001'
const ZERO = 'dddddddd-0000-4000-8000-000000000002'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  branch2Mgr: '00000000-0000-4000-8000-000000000005',
  cashier3: '00000000-0000-4000-8000-000000000006',
}

const PEOPLE = `
  insert into tenants (id) values ('${T}');
  insert into outlets (id, tenant_id) values ('${A1}', '${T}'), ('${A2}', '${T}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',      'admin', '${T}', true,  '{}',                null,    'Olivia'),
    ('${U.cashier}',    'admin', '${T}', false, '{pos}',             '${A1}', 'Cara'),
    ('${U.cashier2}',   'admin', '${T}', false, '{pos}',             '${A1}', 'Cy'),
    ('${U.manager}',    'admin', '${T}', false, '{cash_manage,pos}', null,    'Mara'),
    ('${U.branch2Mgr}', 'admin', '${T}', false, '{cash_manage}',     '${A2}', 'Bea'),
    ('${U.cashier3}',   'admin', '${T}', false, '{pos}',             '${A1}', 'Cleo');
  insert into cash_drawers (id, tenant_id, outlet_id, name, starting_cash) values ('${DRAWER}', '${T}', '${A1}', 'Cashier 1', 500);
  insert into cash_drawers (id, tenant_id, outlet_id, name, is_zero_balance) values ('${ZERO}', '${T}', '${A1}', 'Zero till', true);
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
const rpc = async (db, uid, sql, params) => {
  if (uid === 'anon') await asAnon(db)
  else await as(db, 'authenticated', uid)
  return scalar(db, sql, params)
}
const OPEN = 'select public.open_shift($1, $2, $3, $4, $5, null, null)'
const open = (db, uid, { outlet = A1, drawer = null, floatCents = 50000, denoms = null } = {}) =>
  rpc(db, uid, OPEN, [T, outlet, drawer, floatCents, denoms === null ? null : JSON.stringify(denoms)])
const PREVIEW = 'select public.preview_shift_close($1)'
const COUNT = 'select public.count_shift($1, $2, $3, $4)'
const count = (db, uid, shift, cents, { denoms = null, device = null } = {}) =>
  rpc(db, uid, COUNT, [shift, cents, denoms === null ? null : JSON.stringify(denoms), device])
const CLOSE = 'select public.close_shift($1, $2, $3, $4, $5, $6, $7, $8)'
const close = (db, uid, shift, { nonCash = null, reason = null, note = null, floatKept = null } = {}) =>
  rpc(db, uid, CLOSE, [shift, nonCash === null ? null : JSON.stringify(nonCash), reason, note, floatKept, null, false, null])
async function cashSale(db, cashier, total, method = 'Cash') {
  await reset(db)
  await db.query(`insert into orders (tenant_id, outlet_id, total, status, source, payment_method_name, customer_data) values ($1, $2, $3, 'delivered', 'pos', $4, $5::jsonb)`,
    [T, A1, total, method, JSON.stringify({ pos: { cashierId: cashier } })])
}
async function row(db, shift) {
  await reset(db)
  return (await db.query('select * from staff_shifts where id = $1', [shift])).rows[0]
}

async function checkOpen(db) {
  const first = await open(db, U.cashier)
  eq([first.state, first.shift.staffName, first.shift.openingFloatCents, first.handover], ['opened', 'Cara', 50000, null], 'open_shift opens (name from the account, float in centavos)')
  eq(typeof first.shift.overdueAt, 'string', 'the shift says when it becomes overdue')
  const again = await open(db, U.cashier)
  eq([again.state, again.shift.id], ['joined', first.shift.id], 'opening again joins the running shift')

  // A shift forgotten from an earlier business day is never joined.
  await reset(db)
  await db.exec('set session_replication_role = replica')
  await db.query("update staff_shifts set opened_at = now() - interval '3 days', business_day = business_day - 3 where id = $1", [first.shift.id])
  await db.exec('set session_replication_role = origin')
  const stale = await open(db, U.cashier)
  eq([stale.state, stale.shift.id], ['stale', first.shift.id], 'a stale shift is refused (state stale), never joined')
  eq(Number(await scalar(db, 'select count(*) from staff_shifts where staff_user_id = $1', [U.cashier])), 1, 'and no second shift was opened')
  await refused(open(db, U.cashier, { floatCents: -1 }), '22023', 'a negative float is refused')
  await refused(open(db, 'anon'), '42501', 'anon cannot open a shift')
  return first.shift.id
}

async function checkPreviewAndCount(db, shift) {
  await cashSale(db, U.cashier, 300)
  await cashSale(db, U.cashier, 120, 'GCash')
  const preview = await rpc(db, U.cashier, PREVIEW, [shift])
  eq([preview.source, preview.hidden, preview.expectedCents, preview.floatCents, preview.countAttempts], ['server', false, 80000, 50000, 0], 'preview: the server figure (float ₱500 + ₱300 cash)')
  eq(preview.nonCashByMethod, [{ key: 'name:gcash', label: 'GCash', cents: 12000, count: 1 }], 'preview: non-cash by method for the tallies step')
  await refused(rpc(db, U.cashier2, PREVIEW, [shift]), '42501', 'a colleague cannot preview another drawer')
  await refused(rpc(db, U.branch2Mgr, PREVIEW, [shift]), '42501', 'a manager at another branch cannot either')
  eq((await rpc(db, U.manager, PREVIEW, [shift])).expectedCents, 80000, 'a cash manager can')
  await refused(rpc(db, 'anon', PREVIEW, [shift]), '42501', 'anon cannot preview')
  await refused(rpc(db, U.cashier, PREVIEW, ['5a000000-0000-4000-8000-0000000000ff']), 'P0002', 'unknown shift: P0002')

  await refused(count(db, U.cashier2, shift, 79000), '42501', 'a colleague cannot count another drawer')
  await refused(count(db, U.cashier, shift, 79000, { denoms: { b500: 1 } }), '22023', 'bills must add up to the count')
  await refused(count(db, U.cashier, shift, -1), '22023', 'a negative count is refused')
  const first = await count(db, U.cashier, shift, 77000)
  eq(first, { attempt: 1, countedCents: 77000, expectedCents: 80000, differenceCents: -3000, source: 'server', reasonRequired: true },
    'count 1: recorded, then revealed (₱30 short > ₱20 → reason required)')
  const second = await count(db, U.cashier, shift, 79500, { denoms: { b500: 1, b200: 1, b50: 1, b20: 2, c5: 1 }, device: 79500 })
  eq([second.attempt, second.expectedCents, second.source, second.reasonRequired], [2, 79500, 'device', false],
    'count 2 (recount): shadow mode judges against the register\'s figure when it sends one')
  await refused(count(db, U.cashier, shift, 80000), '22023', 'a third count is refused', /recount_limit/)
  eq((await rpc(db, U.cashier, PREVIEW, [shift])).countAttempts, 2, 'preview reports the attempts')
  // Counted: the drawer's cash is frozen until the shift ends (a later move would fake a variance).
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("insert into shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name) values ($1, $2, 'pay_out', 10, 'Ice', 'Cara')", [T, shift]), '55000', 'no pay out after the count', /drawer_counted/)
  await refused(db.query("insert into shift_cash_movements (tenant_id, shift_id, kind, amount, recorded_by_name) values ($1, $2, 'collect', 100, 'Cara')", [T, shift]), '55000', 'no pickup after the count', /drawer_counted/)
  await reset(db)
}

async function checkCountRls(db, shift) {
  await as(db, 'authenticated', U.cashier)
  eq(Number(await scalar(db, 'select count(*) from shift_counts where shift_id = $1', [shift])), 2, 'the holder reads their counts')
  await refused(db.query("insert into shift_counts (shift_id, tenant_id, attempt, counted_cents, expected_source) values ($1, $2, 1, 1, 'none')", [shift, T]), '42501', 'no client writes a count directly')
  await as(db, 'authenticated', U.cashier2)
  eq(Number(await scalar(db, 'select count(*) from shift_counts')), 0, "a colleague reads none")
  await as(db, 'authenticated', U.manager)
  eq(Number(await scalar(db, 'select count(*) from shift_counts where shift_id = $1', [shift])), 2, 'a cash manager reads them')
  await as(db, 'authenticated', U.branch2Mgr)
  eq(Number(await scalar(db, 'select count(*) from shift_counts')), 0, 'another branch\'s manager reads none')
  await asAnon(db)
  await refused(db.query('select count(*) from shift_counts'), '42501', 'anon reads nothing')
}

async function checkClose(db, shift) {
  await refused(close(db, U.cashier2, shift), '42501', 'a colleague cannot end another drawer')
  await refused(close(db, U.cashier, shift, { nonCash: [{ method: 'GCash', check: 'different' }] }), '22023', 'a "different" tally needs the declared amount')
  await refused(close(db, U.cashier, shift, { floatKept: 90000 }), '22023', 'cannot leave more in the drawer than was counted')
  const done = await close(db, U.cashier, shift, {
    nonCash: [{ key: 'name:gcash', method: 'GCash', expectedCents: 12000, slipCount: 1, check: 'matches', declaredCents: 12000, note: null }],
    floatKept: 50000,
  })
  eq([done.countedCents, done.expectedCents, done.differenceCents, done.remittanceId, done.handedOverCents], [79500, 79500, 0, null, 29500],
    'closed on the LAST count; hands over count − float kept')
  const r = await row(db, shift)
  eq([r.status, r.close_kind, r.closing_count, r.expected_cash, r.float_kept_cents, r.closing_denominations.b500, r.device_expected_cash],
    ['closed', 'counted', '795.00', '795.00', 50000, 1, '795.00'], 'the shift row carries the count, the figure it was judged on, and the float kept')
  await refused(close(db, U.cashier, shift), 'P0002', 'closing twice: P0002 (CAS)', /shift_not_open/)
  await refused(count(db, U.cashier, shift, 1), '55000', 'a closed shift cannot be counted')

  // Count required; reason required.
  const s2 = (await open(db, U.cashier2)).shift.id
  await refused(close(db, U.cashier2, s2), '22023', 'no count, no close', /count_required/)
  await cashSale(db, U.cashier2, 1000)
  await count(db, U.cashier2, s2, 140000)
  await refused(close(db, U.cashier2, s2), '22023', '₱100 short with no reason is refused', /variance_reason_required/)
  await refused(close(db, U.cashier2, s2, { reason: 'bad luck' }), '22023', 'an unknown reason key is refused by close_shift', /variance_reason_invalid/)
  eq((await close(db, U.cashier2, s2, { reason: 'wrong_change' })).differenceCents, -10000, 'with a reason chip it closes')
  eq((await row(db, s2)).variance_reason, 'wrong_change', 'the reason is kept')

  // Old builds in a non-blind store still close directly; the close kind is always "counted".
  const s3 = (await open(db, U.cashier3)).shift.id
  await as(db, 'authenticated', U.cashier3)
  await refused(db.query("update staff_shifts set status = 'closed', closed_at = now(), close_kind = 'forced', note = 'x' where id = $1", [s3]), '23514', 'a client cannot claim a forced close: it is rewritten to counted, and a count without a count is refused', /staff_shifts_close_kind_ck/)
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500, close_kind = 'forced', note = 'x' where id = $1", [s3])).affectedRows, 1, 'a legacy close still works in a non-blind store')
  eq((await row(db, s3)).close_kind, 'counted', 'and is recorded as counted, whatever it claimed')
}

async function checkZeroBalanceAndHandover(db) {
  const a = (await open(db, U.cashier, { drawer: DRAWER, floatCents: 50000, denoms: { b500: 1 } })).shift.id
  await count(db, U.cashier, a, 50000)
  await close(db, U.cashier, a, { floatKept: 30000 })
  const b = await open(db, U.cashier2, { drawer: DRAWER, floatCents: 30000 })
  eq([b.state, b.handover.previousShiftId, b.handover.leftCents, b.handover.staffName], ['opened', a, 30000, 'Cara'], 'the next shift on the drawer is told what was left in it')
  await count(db, U.cashier2, b.shift.id, 30000)
  await close(db, U.cashier2, b.shift.id)

  const z = (await open(db, U.cashier, { drawer: ZERO, floatCents: 0 })).shift.id
  await cashSale(db, U.cashier, 50)
  await count(db, U.cashier, z, 5000)
  await refused(close(db, U.cashier, z, { floatKept: 1000 }), '22023', 'a zero-balance drawer keeps nothing')
  eq((await close(db, U.cashier, z)).handedOverCents, 5000, 'a zero-balance drawer hands over everything')
}

async function checkForceClose(db) {
  const s = (await open(db, U.cashier2)).shift.id
  await refused(rpc(db, U.cashier, 'select public.force_close_shift($1, $2)', [s, 'gone home']), '42501', 'a cashier cannot force-close a colleague')
  await refused(rpc(db, U.manager, 'select public.force_close_shift($1, $2)', [s, '  ']), '22023', 'a forced close needs a note', /note_required/)
  const done = await rpc(db, U.manager, 'select public.force_close_shift($1, $2)', [s, 'Forgot to clock out'])
  eq([typeof done.closedAt, done.remittanceId], ['string', null], 'a cash manager force-closes it')
  const r = await row(db, s)
  eq([r.close_kind, r.closing_count, r.note, r.closed_by_name], ['forced', null, 'Forgot to clock out', 'Mara'], 'forced: no count invented')
  const own = (await open(db, U.manager)).shift.id
  await refused(rpc(db, U.manager, 'select public.force_close_shift($1, $2)', [own, 'x']), '42501', 'a manager cannot force-close their own shift')
  await count(db, U.manager, own, 50000)
  await close(db, U.manager, own)
  await reset(db)
  const activity = (await db.query("select flags, summary->>'title' as title from store_activity where source_id = $1 and kind = 'shift.closed'", [s])).rows[0]
  eq([activity.flags, activity.title], [['forced_close'], 'Shift force-closed by Mara · drawer not counted'], 'activity names who force-closed it')
}

// QA wave 2: a zero-row UPDATE must never read as closed; reason chips by
// direction; remittance 'required'; opening counts must equal the float.
async function checkQaFixes(db) {
  // Simulate the other device closing between close_shift's read and its
  // UPDATE: a test-only trigger cancels the row (0 rows, as under a race).
  await reset(db)
  await db.exec(`create function test_skip_close() returns trigger language plpgsql as $$
    begin if old.id::text = current_setting('test.skip_close', true) then return null; end if; return new; end $$;
    create trigger trg_zzzz_test_skip before update on staff_shifts for each row execute function test_skip_close();`)
  const raced = (await open(db, U.cashier)).shift.id
  await count(db, U.cashier, raced, 50000)
  await reset(db)
  await db.query("select set_config('test.skip_close', $1, false)", [raced])
  await refused(close(db, U.cashier, raced), 'P0002', 'close_shift: an UPDATE that changed no row is P0002, never a close with closedAt null', /shift_not_open/)
  const other = (await open(db, U.cashier2)).shift.id
  await reset(db)
  await db.query("select set_config('test.skip_close', $1, false)", [other])
  await refused(rpc(db, U.manager, 'select public.force_close_shift($1, $2)', [other, 'gone']), 'P0002', 'force_close_shift: the same', /shift_not_open/)
  await reset(db)
  await db.query("select set_config('test.skip_close', '', false)")
  await db.exec('drop trigger trg_zzzz_test_skip on staff_shifts; drop function test_skip_close()')
  eq(await scalar(db, "select count(*)::int from staff_shifts where id in ($1, $2) and status = 'open'", [raced, other]), 2, 'both shifts are still open')

  // Reason chips by direction (CONTRACTS §6). The raced shift is ₱0 off: any chip.
  await cashSale(db, U.cashier2, 500)
  await count(db, U.cashier2, other, 40000) // expected 1000 → ₱600 short
  await refused(close(db, U.cashier2, other, { reason: 'customer_left_extra' }), '22023', 'an "over" reason on a short drawer is refused', /variance_reason_invalid/)
  eq((await close(db, U.cashier2, other, { reason: 'customer_paid_less' })).differenceCents, -60000, 'a short reason on a short drawer closes')

  // remittance_mode 'required': nowhere to put the cash → refused.
  await reset(db)
  await db.query("insert into tenant_cash_settings (tenant_id, remittance_mode) values ($1, 'required') on conflict (tenant_id) do update set remittance_mode = 'required'", [T])
  await refused(close(db, U.cashier, raced), '22023', "remittance 'required': a receiver or the safe must be chosen", /remit_to_required/)
  eq(typeof (await rpc(db, U.cashier, CLOSE, [raced, null, null, null, null, null, true, null])).closedAt, 'string', 'to the safe, it closes')
  await reset(db)
  await db.query("update tenant_cash_settings set remittance_mode = 'optional' where tenant_id = $1", [T])

  // Opening counts must equal the float asked for.
  await refused(open(db, U.cashier3, { floatCents: 50000, denoms: { b100: 4 } }), '22023', 'an opening count that is not the float is refused')
  await refused(open(db, U.cashier3, { floatCents: 50000, denoms: { b100: '5' } }), '22023', 'an invalid opening count is refused')
  await refused(open(db, U.cashier3, { drawer: ZERO, floatCents: 10000, denoms: { b100: 1 } }), '22023', 'a zero-balance drawer counted at ₱100 is refused (its float is forced to ₱0)')
}

async function checkBlind(db) {
  await reset(db)
  await db.query('insert into tenant_cash_settings (tenant_id, blind_close) values ($1, true) on conflict (tenant_id) do update set blind_close = true', [T])
  await as(db, 'authenticated', U.cashier3)
  await refused(db.query("insert into staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values ($1, $2, $3, 'Cleo', 0)", [T, A1, U.cashier3]), '42501', 'an old build cannot open a shift in a blind store', /Update the app/)
  const s = (await open(db, U.cashier3, { floatCents: 0 })).shift
  eq(s.isBlind, true, 'open_shift opens it, blind')
  await cashSale(db, U.cashier3, 400)
  const hidden = await rpc(db, U.cashier3, PREVIEW, [s.id])
  eq([hidden.hidden, hidden.expectedCents, hidden.breakdown, hidden.nonCashByMethod], [true, null, null, null], 'blind: the cashier sees no expected figure before counting')
  eq((await rpc(db, U.manager, PREVIEW, [s.id])).expectedCents, 40000, 'the cash manager does')
  await as(db, 'authenticated', U.cashier3)
  await refused(db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 400, closing_count = 400 where id = $1", [s.id]), '42501', 'an old build cannot close a blind shift', /Update the app/)
  const counted = await count(db, U.cashier3, s.id, 38000, { device: 40000 })
  eq([counted.expectedCents, counted.differenceCents], [40000, -2000], 'after the count the result is shown (₱20 short: no reason needed)')
  eq((await rpc(db, U.cashier3, PREVIEW, [s.id])).hidden, false, 'and the preview opens')
  const done = await close(db, U.cashier3, s.id)
  eq(done.differenceCents, -2000, 'close_shift closes a blind shift')
  await as(db, 'authenticated', U.cashier3)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations where shift_id = $1', [s.id])), 1, 'once counted, the cashier may read the frozen expectation')
  await reset(db)
  const rows = (await db.query("select kind, actor_user_id, after, summary->>'title' as title, amount from store_activity where source_id = $1 and kind in ('shift.closed', 'shift.reconciled') order by kind", [s.id])).rows
  eq(rows.map((r) => r.kind), ['shift.closed', 'shift.reconciled'], 'a blind close files two rows')
  eq([rows[0].actor_user_id, rows[0].after, rows[0].title, rows[0].amount], [U.cashier3, { closingCount: 380 }, 'Shift closed · counted ₱380', null], "the cashier's own row: only what they counted")
  eq([rows[1].actor_user_id, rows[1].title, Number(rows[1].amount)], [null, "Cleo's drawer · short ₱20", -20], 'the result row has no actor (own-row visibility never shows it)')
  await reset(db)
  await db.query('update tenant_cash_settings set blind_close = false where tenant_id = $1', [T])
}

async function main() {
  const db = await buildCashDb({
    through: '20261027150010_cash_activity_validate.sql',
    beforeCashier: (d) => d.exec(PEOPLE),
    afterBase: async (d) => {
      const file = readMigration('20261012151100_store_activity_stock_cash_triggers.sql')
      const start = file.indexOf('-- staff_shifts (open / close)')
      const end = file.indexOf('-- shift_cash_movements', start)
      await d.exec(file.slice(start, end))
    },
  })
  try {
    const shift = await checkOpen(db)
    // The stale shift is still countable and closable (the "close it first" path).
    await checkPreviewAndCount(db, shift)
    await checkCountRls(db, shift)
    await checkClose(db, shift)
    await checkZeroBalanceAndHandover(db)
    await checkForceClose(db)
    await checkQaFixes(db)
    await checkBlind(db)
    console.log(`Shift close: ${checks} checks passed (open/join/stale/handover, preview, count attempts + reveal, close on last count + reason + CAS, force close, blind guard + hidden preview + activity, shift_counts RLS).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
