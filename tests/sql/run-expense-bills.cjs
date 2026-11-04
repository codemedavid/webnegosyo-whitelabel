// Bills to pay (docs/plans/expenses/bills-contract.md §2), pinned in an
// isolated PostgreSQL (PGlite) as the role that really runs each query.
//
// Loads the same REAL migrations as run-expenses.cjs (staff shifts, the
// permission keys, store activity and every 20261022* expenses migration up to
// the opt-in key), then 20261022140000_expense_bills.sql and its fixes
// 20261022150000_expense_bills_fixes.sql, over the same stub
// of the live platform schema (provenance in run-expenses.cjs: helper bodies
// copied verbatim from the live platform DB on 2026-10-21).
//
// Every write asserts the AFFECTED ROWS or the SQLSTATE: RLS refusals are
// silent (0 rows), so "no error" is never taken as success.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const SHIFT = 'cccccccc-0000-4000-8000-000000000001'
const PAYOUT = 'dddddddd-0000-4000-8000-000000000001'

/** Manila business date, from the same clock the database reads. */
function manilaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)
}
const TODAY = manilaDate()
const LATER = manilaDate(40)

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  book: '00000000-0000-4000-8000-000000000003',
  cashier: '00000000-0000-4000-8000-000000000004',
  branchBook: '00000000-0000-4000-8000-000000000006',
  menu: '00000000-0000-4000-8000-000000000007',
  ownerB: '00000000-0000-4000-8000-000000000009',
}

const STUB_SCHEMA = `
  create table tenants (
    id uuid primary key, operating_hours jsonb, timezone text, enforce_operating_hours boolean default false
  );
  create table outlets (
    id uuid primary key, tenant_id uuid not null references tenants(id) on delete cascade,
    operating_hours jsonb, timezone text
  );
  create table app_users (
    user_id uuid primary key, role text not null, tenant_id uuid,
    is_owner boolean not null default false, permissions text[], outlet_id uuid,
    display_name text, email text
  );
  alter table app_users enable row level security;
  create policy app_users_select_self on app_users for select to authenticated using (user_id = auth.uid());
  create table orders (id uuid primary key default gen_random_uuid(), tenant_id uuid);
  create table order_status_events (id uuid primary key default gen_random_uuid());
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );

  -- Copied from live on 2026-10-21 (pg_get_functiondef), as in run-expenses.cjs.
  CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1
        FROM app_users au
       WHERE au.user_id = auth.uid()
         AND au.tenant_id = target_tenant_id
         AND au.role = ANY (ARRAY['admin','superadmin'])
         AND (
           au.outlet_id IS NULL
           OR COALESCE(au.is_owner, false)
           OR au.outlet_id = target_outlet_id
         )
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_belongs_to_store(p_tenant_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.app_users au
       WHERE au.user_id = auth.uid()
         AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = p_tenant_id))
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.stamp_client_actor()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  begin
    if current_user in ('anon', 'authenticated') then
      new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid(), 'created_at', now()));
    end if;
    return new;
  end;
  $function$;
  revoke all on function public.stamp_client_actor() from public, anon, authenticated;
`

const SEED = `
  insert into tenants (id) values ('${T_A}'), ('${T_B}');
  insert into outlets (id, tenant_id) values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}'), ('${OUT_B1}', '${T_B}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',         null,        'Olivia Owner'),
    ('${U.legacy}',     'admin', '${T_A}', false, null,         null,        'Lee Legacy'),
    ('${U.book}',       'admin', '${T_A}', false, '{expenses}', null,        'Bea Books'),
    ('${U.cashier}',    'admin', '${T_A}', false, '{pos}',      '${OUT_A1}', 'Cara Cashier'),
    ('${U.branchBook}', 'admin', '${T_A}', false, '{expenses}', '${OUT_A1}', 'Bran Books'),
    ('${U.menu}',       'admin', '${T_A}', false, '{menu}',     null,        'Mo Menu'),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',         null,        'Bo Owner');
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
async function rows(db, sql, params) {
  return (await db.query(sql, params)).rows
}
async function affected(db, sql, params) {
  return (await db.query(sql, params)).affectedRows
}
async function admin(db, sql, params) {
  await reset(db)
  return rows(db, sql, params)
}
const count = async (db, sql, params) => Number(await scalar(db, sql, params))

const cat = {}
async function seedCategories(db) {
  await as(db, 'service_role', null)
  await db.query('select public.ensure_expense_categories($1)', [T_A])
  await db.query('select public.ensure_expense_categories($1)', [T_B])
  for (const row of await admin(db, 'select system_key, id from expense_categories where tenant_id = $1', [T_A])) {
    cat[row.system_key] = row.id
  }
  cat.bRent = (await admin(db, "select id from expense_categories where tenant_id = $1 and system_key = 'rent'", [T_B]))[0].id
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

const INSERT_BILL = `insert into expense_bills (
    tenant_id, outlet_id, name, category_id, supplier_id, paid_from, amount_cents, repeat_kind, repeat_every,
    repeat_days, repeat_weekday, starts_on, ends_on, remind_days_before, status, paused_until, created_by
  ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::smallint[], $11, $12, $13, $14, $15, $16, $17)
  returning id, name, created_by, created_by_name`

/** `days` is an array, null, or a raw array literal (to test odd bounds). */
function daysLiteral(days) {
  if (days === null) return null
  return typeof days === 'string' ? days : `{${days.join(',')}}`
}

function insertBill(db, overrides = {}) {
  const b = {
    tenant: T_A, outlet: null, name: 'Rent', category: cat.rent, supplier: null, paidFrom: 'cash', cents: 1500000,
    kind: 'monthly', every: 1, days: [5], weekday: null, startsOn: '2026-10-01', endsOn: null, remind: 3,
    status: 'active', pausedUntil: null, createdBy: null,
    ...overrides,
  }
  return db.query(INSERT_BILL, [
    b.tenant, b.outlet, b.name, b.category, b.supplier, b.paidFrom, b.cents, b.kind, b.every,
    daysLiteral(b.days), b.weekday, b.startsOn, b.endsOn, b.remind, b.status, b.pausedUntil, b.createdBy,
  ])
}

const INSERT_EXPENSE = `insert into expenses (tenant_id, outlet_id, category_id, amount_cents, paid_from, created_by_name, bill_id, bill_due_on)
  values ($1, $2, $3, $4, 'cash', 'Someone', $5, $6) returning id`
function insertExpense(db, { tenant = T_A, outlet = null, category = cat.rent, cents = 1500000, billId = null, dueOn = null } = {}) {
  return db.query(INSERT_EXPENSE, [tenant, outlet, category, cents, billId, dueOn])
}

const INSERT_MARK = 'insert into expense_bill_marks (tenant_id, bill_id, due_on, kind, snoozed_until, created_by) values ($1, $2, $3, $4, $5, $6) returning id, created_by'
function insertMark(db, { tenant = T_A, billId, dueOn, kind = 'skipped', snoozedUntil = null, createdBy = null }) {
  return db.query(INSERT_MARK, [tenant, billId, dueOn, kind, snoozedUntil, createdBy])
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkAnon(db) {
  await asAnon(db)
  for (const table of ['expense_bills', 'expense_bill_marks']) {
    await refused(db.query(`select count(*) from ${table}`), '42501', `anon cannot read ${table}`)
  }
  await refused(insertBill(db), '42501', 'anon cannot add a bill')
  await refused(db.query("insert into expense_bill_marks (tenant_id, bill_id, due_on, kind) values ($1, gen_random_uuid(), '2026-10-05', 'skipped')", [T_A]), '42501', 'anon cannot mark a bill')
}

/** Every kind's good shape lands; every bad shape is a CHECK refusal (23514). */
async function checkShapes(db) {
  await as(db, 'authenticated', U.owner)
  const good = [
    { kind: 'monthly', every: 1, days: [5] },
    { kind: 'monthly', every: 1, days: [0], name: 'Last-day rent' },
    { kind: 'twice_monthly', every: 1, days: [15, 0], name: 'Sahod', category: cat.wages },
    { kind: 'weekly', every: 1, days: null, weekday: 2, name: 'Yelo', category: cat.ice },
    { kind: 'weekly', every: 2, days: null, weekday: 6, name: 'Cleaning', category: cat.cleaning },
    { kind: 'months', every: 3, days: [10], name: 'Permit', category: cat.permits },
    { kind: 'months', every: 12, days: [15], name: 'Business permit', category: cat.permits },
    { kind: 'after_days', every: 10, days: null, name: 'LPG', category: cat.lpg, cents: null },
  ]
  for (const shape of good) {
    eq((await insertBill(db, shape)).rows.length, 1, `a ${shape.kind} bill (every ${shape.every}) lands`)
  }

  const bad = [
    [{ kind: 'monthly', days: [5, 20] }, 'monthly takes exactly one day'],
    [{ kind: 'monthly', days: null }, 'monthly needs a day'],
    [{ kind: 'monthly', days: '{}' }, 'monthly needs a day (empty list)'],
    [{ kind: 'monthly', every: 2 }, 'monthly is every 1'],
    [{ kind: 'monthly', weekday: 1 }, 'monthly takes no weekday'],
    [{ kind: 'twice_monthly', days: [15] }, 'twice a month needs two days'],
    [{ kind: 'twice_monthly', days: [15, 15] }, 'twice a month needs two DIFFERENT days'],
    [{ kind: 'twice_monthly', days: [1, 15, 28] }, 'twice a month is not three times'],
    [{ kind: 'weekly', every: 3, days: null, weekday: 1 }, 'weekly is every 1 or 2 weeks'],
    [{ kind: 'weekly', days: null, weekday: null }, 'weekly needs a weekday'],
    [{ kind: 'weekly', days: [5], weekday: 1 }, 'weekly takes no days of the month'],
    [{ kind: 'months', every: 5, days: [10] }, 'months is every 2, 3, 4, 6 or 12'],
    [{ kind: 'months', every: 1, days: [10] }, 'every 1 month is "monthly"'],
    [{ kind: 'months', every: 3, days: [10, 20] }, 'months takes exactly one day'],
    [{ kind: 'after_days', every: 0, days: null }, 'after_days is at least 1 day'],
    [{ kind: 'after_days', every: 91, days: null }, 'after_days is at most 90 days'],
    [{ kind: 'after_days', every: 10, days: [5] }, 'after_days takes no day of the month'],
    [{ kind: 'after_days', every: 10, days: null, weekday: 3 }, 'after_days takes no weekday'],
    [{ kind: 'yearly' }, 'unknown repeat kind'],
    [{ days: [32] }, 'day 32 does not exist'],
    [{ days: [-1] }, 'negative days do not exist'],
    [{ kind: 'weekly', days: null, weekday: 7 }, 'weekday is 0..6'],
    [{ kind: 'twice_monthly', days: '{15,NULL}' }, 'no NULL day in the list'],
    [{ kind: 'twice_monthly', days: '[0:1]={1,15}' }, 'the list is 1-based'],
    [{ cents: 0 }, 'an amount is above zero (NULL = it varies)'],
    [{ cents: 1000000001 }, 'an amount is at most ₱10,000,000'],
    [{ paidFrom: 'drawer' }, 'v1 bills are never paid from the drawer'],
    [{ name: '   ' }, 'a bill needs a name'],
    [{ name: 'x'.repeat(61) }, 'a name is at most 60 characters'],
    [{ endsOn: '2026-09-30' }, 'ends_on is not before starts_on'],
    [{ remind: 15 }, 'reminders are 0..14 days ahead'],
    [{ status: 'active', pausedUntil: LATER }, 'paused_until only while paused'],
    [{ status: 'stopped' }, 'status is a closed list'],
  ]
  for (const [overrides, message] of bad) {
    await refused(insertBill(db, overrides), '23514', message)
  }
  eq((await insertBill(db, { name: 'On hold', status: 'paused', pausedUntil: LATER })).rows.length, 1, 'a bill may start paused until a date')
  await refused(insertBill(db, { name: 'Held back', status: 'paused', pausedUntil: TODAY }), '22023', 'but never until a day already here', /pause_until_past/)
  await refused(insertBill(db, { name: 'Already over', status: 'ended' }), '42501', 'a bill never starts ended')
}

async function checkOwner(db) {
  await as(db, 'authenticated', U.owner)
  const { rows: inserted } = await insertBill(db, { name: '  Upa sa pwesto  ', createdBy: U.menu })
  eq(inserted.map(({ name, created_by, created_by_name }) => ({ name, created_by, created_by_name })),
    [{ name: 'Upa sa pwesto', created_by: U.owner, created_by_name: 'Olivia Owner' }],
    'owner adds a store-wide bill: name trimmed, creator stamped from the JWT and app_users (not the client)')
  const id = inserted[0].id

  eq(await affected(db, 'update expense_bills set created_by = $2, created_by_name = $3 where id = $1', [id, U.book, 'Someone']), 1, 'an update passes the policy')
  eq((await rows(db, 'select created_by, created_by_name from expense_bills where id = $1', [id]))[0], { created_by: U.owner, created_by_name: 'Olivia Owner' }, 'but who made the bill never changes')
  await refused(db.query('update expense_bills set tenant_id = $2 where id = $1', [id, T_B]), '42501', 'a bill never moves to another store', /another store/)

  await refused(insertBill(db, { category: cat.bRent }), '42501', "another store's category is refused", /different store/)
  await refused(insertBill(db, { outlet: OUT_B1 }), '42501', "another store's branch is refused", /different store/)
  await refused(db.query('update expense_bills set category_id = $2 where id = $1', [id, cat.bRent]), '42501', "nor may an edit point at another store's category", /different store/)
  await refused(db.query('delete from expense_bills where id = $1', [id]), '42501', 'bills are never deleted (no DELETE grant)')

  // Pause / resume / end.
  eq(await affected(db, "update expense_bills set status = 'paused', paused_until = $2 where id = $1", [id, LATER]), 1, 'pause until a date')
  await refused(db.query("update expense_bills set status = 'active' where id = $1", [id]), '23514', 'resuming clears paused_until')
  eq(await affected(db, "update expense_bills set status = 'active', paused_until = null where id = $1", [id]), 1, 'resume')
  eq(await affected(db, "update expense_bills set amount_cents = 1600000, repeat_days = '{10}' where id = $1", [id]), 1, 'edit the amount and the day (next occurrences only)')

  const { rows: ended } = await insertBill(db, { name: 'Old internet', category: cat.internet })
  eq(await affected(db, "update expense_bills set status = 'ended' where id = $1", [ended[0].id]), 1, 'stop a bill')
  await refused(db.query("update expense_bills set status = 'active' where id = $1", [ended[0].id]), '42501', 'a stopped bill never resumes', /stopped/)
  await refused(db.query("update expense_bills set name = 'New internet' where id = $1", [ended[0].id]), '42501', 'nor changes at all', /stopped/)
  return { rentId: id, endedId: ended[0].id }
}

async function checkRoles(db) {
  await as(db, 'authenticated', U.book)
  const { rows: a1 } = await insertBill(db, { outlet: OUT_A1, name: 'Branch 1 rent' })
  eq(a1.length, 1, 'an expenses holder adds a branch bill')
  const { rows: a2 } = await insertBill(db, { outlet: OUT_A2, name: 'Branch 2 rent' })
  eq(a2.length, 1, 'and one at the other branch')
  const total = await count(db, 'select count(*) from expense_bills')
  eq(total > 3, true, 'an expenses holder (store-wide) reads every bill of the store')

  await as(db, 'authenticated', U.branchBook)
  eq((await rows(db, 'select distinct outlet_id from expense_bills')).map((row) => row.outlet_id), [OUT_A1], 'a branch-locked holder reads only their branch (store-wide bills are invisible)')
  const { rows: own } = await insertBill(db, { outlet: OUT_A1, name: 'Branch 1 water', category: cat.water, cents: null })
  eq(own.length, 1, 'a branch-locked holder adds a bill at their branch')
  await refused(insertBill(db, { outlet: OUT_A2 }), '42501', 'but not at another branch')
  await refused(insertBill(db, { outlet: null }), '42501', 'nor a store-wide one')
  eq(await affected(db, "update expense_bills set name = 'x' where outlet_id is null"), 0, 'a branch-locked holder edits no store-wide bill')
  eq(await affected(db, "update expense_bills set name = 'Branch 1 water (Maynilad)' where id = $1", [own[0].id]), 1, 'but edits their own')
  await refused(db.query('update expense_bills set outlet_id = $2 where id = $1', [own[0].id, OUT_A2]), '42501', 'and cannot move it out of reach')

  for (const [who, label] of [
    [U.menu, 'staff without expenses'],
    [U.legacy, 'legacy full access (permissions NULL): expenses is opt-in'],
    [U.cashier, 'a cashier (pos only)'],
    [U.ownerB, "another store's owner"],
  ]) {
    await as(db, 'authenticated', who)
    eq(await count(db, 'select count(*) from expense_bills where tenant_id = $1', [T_A]), 0, `${label} sees no bill`)
    await refused(insertBill(db, { outlet: who === U.cashier ? OUT_A1 : null }), '42501', `${label} cannot add a bill`)
    eq(await affected(db, "update expense_bills set name = 'x' where tenant_id = $1", [T_A]), 0, `${label} edits no bill`)
  }
  return { branchBillId: own[0].id, otherBranchBillId: a2[0].id }
}

async function checkPayments(db, { rentId, endedId, branchBillId }) {
  await as(db, 'authenticated', U.owner)
  const { rows: paid } = await insertExpense(db, { billId: rentId, dueOn: '2026-10-10' })
  eq(paid.length, 1, 'paying = recording an ordinary expense with bill_id + bill_due_on')
  eq((await rows(db, 'select bill_id, bill_due_on::text from expenses where id = $1', [paid[0].id]))[0], { bill_id: rentId, bill_due_on: '2026-10-10' }, 'the payment names the bill and the due date')
  await refused(insertExpense(db, { billId: rentId, dueOn: '2026-10-10' }), '23505', 'a second recorded expense on the same due date is refused')
  await refused(insertExpense(db, { billId: rentId }), '23514', 'bill_id without a due date is refused')
  await refused(insertExpense(db, { dueOn: '2026-10-10' }), '23514', 'a due date without a bill is refused')
  eq((await insertExpense(db, { billId: endedId, dueOn: '2026-09-05', category: cat.internet })).rows.length, 1, 'a stopped bill may still be paid (late payment of an old due date)')

  await db.query("select public.void_expense($1, 'Wrong amount')", [paid[0].id])
  eq((await rows(db, 'select status, bill_id from expenses where id = $1', [paid[0].id]))[0], { status: 'void', bill_id: rentId }, 'the voided payment keeps its link (history)')
  const { rows: again } = await insertExpense(db, { billId: rentId, dueOn: '2026-10-10', cents: 1450000 })
  eq(again.length, 1, 'voiding frees the due date for a new payment')

  const replacement = await scalar(db, "select public.replace_expense($1, 'Typo', $2)", [again[0].id, JSON.stringify({ amount_cents: 1400000, note: 'October' })])
  eq((await rows(db, 'select bill_id, bill_due_on::text, amount_cents from expenses where id = $1', [replacement]))[0], { bill_id: rentId, bill_due_on: '2026-10-10', amount_cents: 1400000 }, 'replace_expense carries the bill link to the corrected copy')
  eq((await rows(db, 'select status, bill_id from expenses where id = $1', [again[0].id]))[0], { status: 'void', bill_id: rentId }, 'and the voided original keeps it too')
  eq(await count(db, "select count(*) from expenses where bill_id = $1 and bill_due_on = '2026-10-10' and status = 'recorded'", [rentId]), 1, 'still one recorded payment for that due date')
  await refused(db.query("select public.replace_expense($1, 'x', $2)", [replacement, JSON.stringify({ bill_id: null })]), '22023', 'the bill link is not a replace_expense patch key (link/unlink is an UPDATE)', /unknown_patch_key/)

  // "I already recorded it": link / unlink an existing recorded expense.
  const { rows: loose } = await insertExpense(db, { cents: 1500000 })
  eq(await affected(db, "update expenses set bill_id = $2, bill_due_on = '2026-11-10' where id = $1", [loose[0].id, rentId]), 1, 'an existing recorded expense is linked to a due date')
  await refused(db.query('update expenses set amount_cents = 1 where id = $1', [loose[0].id]), '42501', 'linking does not open the money fields')
  await refused(db.query("update expenses set bill_due_on = '2026-10-10' where id = $1", [loose[0].id]), '23505', 'a due date already paid cannot take a second link')
  await refused(db.query('update expenses set bill_id = null where id = $1', [loose[0].id]), '23514', 'unlinking clears both columns')
  eq(await affected(db, 'update expenses set bill_id = null, bill_due_on = null where id = $1', [loose[0].id]), 1, 'unlink')
  await refused(db.query("update expenses set bill_id = $2, bill_due_on = '2026-11-10' where id = $1", [paid[0].id, rentId]), '42501', 'a voided expense is never linked')

  // Another store's bill.
  await as(db, 'authenticated', U.ownerB)
  await refused(insertExpense(db, { tenant: T_B, category: cat.bRent, billId: rentId, dueOn: '2026-10-10' }), '42501', "an expense cannot pay another store's bill", /different store/)
  const { rows: bExpense } = await insertExpense(db, { tenant: T_B, category: cat.bRent })
  await refused(db.query("update expenses set bill_id = $2, bill_due_on = '2026-12-10' where id = $1", [bExpense[0].id, rentId]), '42501', "nor be linked to one", /different store/)

  // Branch-locked holder: links their branch's expense to their branch's bill.
  await as(db, 'authenticated', U.branchBook)
  const { rows: water } = await insertExpense(db, { outlet: OUT_A1, category: cat.water, cents: 85000, billId: branchBillId, dueOn: '2026-10-05' })
  eq(water.length, 1, 'a branch-locked holder pays their branch bill')

  // Staff without the key cannot link anything.
  await as(db, 'authenticated', U.menu)
  eq(await affected(db, "update expenses set bill_id = $1, bill_due_on = '2027-01-10'", [rentId]), 0, 'staff without expenses link nothing')
}

async function checkMarks(db, { rentId, branchBillId }) {
  await as(db, 'authenticated', U.owner)
  const { rows: skipped } = await insertMark(db, { billId: rentId, dueOn: '2026-11-10', createdBy: U.menu })
  eq(skipped.map(({ created_by }) => created_by), [U.owner], '"Nothing to pay this time": the mark lands, creator stamped')
  await refused(insertMark(db, { billId: rentId, dueOn: '2026-11-10', kind: 'snoozed', snoozedUntil: '2026-11-11' }), '23505', 'one mark per due date (re-snooze = delete + insert)')
  await refused(insertMark(db, { billId: rentId, dueOn: '2026-12-10', kind: 'snoozed' }), '23514', 'snoozed needs snoozed_until')
  await refused(insertMark(db, { billId: rentId, dueOn: '2026-12-10', kind: 'skipped', snoozedUntil: '2026-12-11' }), '23514', 'skipped takes no snoozed_until')
  await refused(insertMark(db, { billId: rentId, dueOn: '2026-12-10', kind: 'later' }), '23514', 'kind is skipped or snoozed')
  const { rows: snoozed } = await insertMark(db, { billId: rentId, dueOn: '2026-12-10', kind: 'snoozed', snoozedUntil: '2026-12-11' })
  eq(snoozed.length, 1, '"Remind me tomorrow" lands')
  eq(await affected(db, "update expense_bill_marks set snoozed_until = '2026-12-12', created_by = $2 where id = $1", [snoozed[0].id, U.menu]), 1, 're-snooze is one UPDATE (holders only)')
  eq((await rows(db, 'select snoozed_until::text, created_by from expense_bill_marks where id = $1', [snoozed[0].id]))[0], { snoozed_until: '2026-12-12', created_by: U.owner }, 'and the mark names whoever changed it')
  for (const [column, value, label] of [['due_on', '2026-12-11', 'due date'], ['bill_id', branchBillId, 'bill'], ['tenant_id', T_B, 'store']]) {
    await refused(db.query(`update expense_bill_marks set ${column} = $2 where id = $1`, [snoozed[0].id, value]), '42501', `a mark never moves to another ${label}`, /stays on its bill/)
  }
  await refused(insertMark(db, { tenant: T_B, billId: rentId, dueOn: '2027-01-10' }), '42501', "a mark carries its bill's store")

  // Branch reach follows the bill.
  await as(db, 'authenticated', U.branchBook)
  eq(await count(db, 'select count(*) from expense_bill_marks'), 0, "a branch-locked holder sees no mark on a store-wide bill")
  eq(await affected(db, "update expense_bill_marks set snoozed_until = '2026-12-20'"), 0, 'nor changes one')
  await refused(insertMark(db, { billId: rentId, dueOn: '2027-01-10' }), '42501', 'nor can mark one')
  eq(await affected(db, 'delete from expense_bill_marks where id = $1', [skipped[0].id]), 0, 'nor undo one')
  eq((await insertMark(db, { billId: branchBillId, dueOn: '2026-11-05' })).rows.length, 1, 'but marks their own branch bill')

  for (const [who, label] of [
    [U.menu, 'staff without expenses'],
    [U.legacy, 'legacy full access'],
    [U.cashier, 'a cashier'],
    [U.ownerB, "another store's owner"],
  ]) {
    await as(db, 'authenticated', who)
    eq(await count(db, 'select count(*) from expense_bill_marks'), 0, `${label} sees no mark`)
    await refused(insertMark(db, { billId: rentId, dueOn: '2027-02-10' }), '42501', `${label} cannot mark a bill`)
    eq(await affected(db, 'delete from expense_bill_marks'), 0, `${label} deletes no mark`)
    eq(await affected(db, "update expense_bill_marks set snoozed_until = '2027-02-11'"), 0, `${label} changes no mark`)
  }

  await as(db, 'service_role', null)
  await refused(insertMark(db, { tenant: T_B, billId: rentId, dueOn: '2027-03-10' }), '42501', 'even the service role cannot cross stores on a mark')

  await as(db, 'authenticated', U.owner)
  eq(await affected(db, 'delete from expense_bill_marks where id = $1', [skipped[0].id]), 1, 'undo = delete the mark (holders only)')
  eq((await insertMark(db, { billId: rentId, dueOn: '2026-11-10', kind: 'snoozed', snoozedUntil: '2026-11-11' })).rows.length, 1, 'after which the due date can take another mark')
}

/** pause_on is the database's: stamped on pausing, kept while the bill stays paused, cleared on resume / stop. */
async function checkPauseDates(db) {
  await as(db, 'authenticated', U.owner)
  const { rows: bill } = await insertBill(db, { name: 'Cable', category: cat.internet })
  const id = bill[0].id
  const pausedOn = async () => (await rows(db, 'select paused_on::text as d from expense_bills where id = $1', [id]))[0].d
  eq(await pausedOn(), null, 'an active bill has no pause date')
  eq(await affected(db, "update expense_bills set status = 'paused', paused_until = $2, paused_on = '2020-01-01' where id = $1", [id, LATER]), 1, 'pause')
  eq(await pausedOn(), TODAY, 'pausing stamps paused_on = Manila today (whatever the client sends)')
  eq(await affected(db, "update expense_bills set paused_until = $2, paused_on = '2020-01-01' where id = $1", [id, manilaDate(60)]), 1, 'a new end date for the same pause')
  eq(await pausedOn(), TODAY, 'keeps the day the pause began')
  await refused(db.query("update expense_bills set paused_until = $2 where id = $1", [id, manilaDate(-1)]), '22023', 'a pause never ends on a day already gone', /pause_until_past/)
  eq(await affected(db, "update expense_bills set status = 'active', paused_until = null where id = $1", [id]), 1, 'resume')
  eq(await pausedOn(), null, 'resuming clears the pause date')
  eq(await affected(db, "update expense_bills set paused_on = $2 where id = $1", [id, TODAY]), 1, 'an active bill takes no pause date')
  eq(await pausedOn(), null, '(it is ignored)')
  eq(await affected(db, "update expense_bills set status = 'paused', paused_until = null where id = $1", [id]), 1, 'pause until resumed by hand')
  eq(await pausedOn(), TODAY, 'stamps the pause date too')
  eq(await affected(db, "update expense_bills set status = 'ended', paused_until = null where id = $1", [id]), 1, 'stop')
  eq(await pausedOn(), null, 'a stopped bill has no pause date')

  await as(db, 'service_role', null)
  const { rows: legacy } = await insertBill(db, { name: 'Old pause', category: cat.internet, status: 'paused', pausedUntil: manilaDate(-3) })
  eq(legacy.length, 1, 'the service role is not held to the past-date rule (repairs)')
  await as(db, 'authenticated', U.owner)
  eq(await affected(db, "update expense_bills set paused_until = $2 where id = $1", [legacy[0].id, LATER]), 1, 're-pause a bill whose timed pause already ran out')
  eq((await rows(db, 'select paused_on::text as d from expense_bills where id = $1', [legacy[0].id]))[0].d, TODAY,
    'a pause that ran out is a NEW pause: paused_on is today, so the days since it ran out stay owed')
  await as(db, 'service_role', null)
}

/**
 * "I already recorded it" / Mark paid can only settle a bill the CALLER can see,
 * from that bill's own branch: a branch-locked holder never settles the owner's
 * store-wide rent or another branch's bill, and a drawer row never names a bill.
 */
async function checkBillReach(db, { rentId, branchBillId, otherBranchBillId }) {
  await as(db, 'authenticated', U.branchBook)
  await refused(insertExpense(db, { outlet: OUT_A1, billId: rentId, dueOn: '2027-03-10' }), '42501', 'a branch-locked holder cannot pay the store-wide rent', /isn't one you can see/)
  await refused(insertExpense(db, { outlet: OUT_A1, billId: otherBranchBillId, dueOn: '2027-03-10' }), '42501', "nor another branch's bill", /isn't one you can see/)
  const { rows: mine } = await insertExpense(db, { outlet: OUT_A1, category: cat.water, cents: 90000 })
  await refused(db.query("update expenses set bill_id = $2, bill_due_on = '2027-03-10' where id = $1", [mine[0].id, rentId]), '42501', 'nor link an expense to the store-wide rent', /isn't one you can see/)
  await refused(db.query("update expenses set bill_id = $2, bill_due_on = '2027-03-10' where id = $1", [mine[0].id, otherBranchBillId]), '42501', "nor to another branch's bill", /isn't one you can see/)
  eq(await affected(db, "update expenses set bill_id = $2, bill_due_on = '2027-03-05' where id = $1", [mine[0].id, branchBillId]), 1, 'but links one to their own branch bill')

  await as(db, 'authenticated', U.owner)
  const { rows: atBranch } = await insertExpense(db, { outlet: OUT_A1, billId: rentId, dueOn: '2027-04-10' })
  eq(atBranch.length, 1, 'the owner pays the store-wide rent from a branch expense')
  eq((await insertExpense(db, { outlet: OUT_A2, category: cat.rent, billId: otherBranchBillId, dueOn: '2027-04-10' })).rows.length, 1, "and a branch's bill from that branch")
  await refused(insertExpense(db, { outlet: OUT_A1, billId: otherBranchBillId, dueOn: '2027-05-10' }), '42501', "but a branch's bill is never paid from another branch", /own branch/)
  await refused(insertExpense(db, { outlet: null, billId: otherBranchBillId, dueOn: '2027-05-10' }), '42501', 'nor from a store-wide expense', /own branch/)

  await as(db, 'authenticated', U.branchBook)
  eq(await count(db, 'select count(*) from expenses where id = $1', [atBranch[0].id]), 1, 'the branch holder sees the branch expense that pays the rent')
  await refused(db.query('update expenses set bill_id = null, bill_due_on = null where id = $1', [atBranch[0].id]), '42501', 'but cannot take it off the store-wide rent', /isn't one you can see/)
  await refused(db.query("update expenses set bill_due_on = '2027-06-10' where id = $1", [atBranch[0].id]), '42501', 'nor move it to another due date', /isn't one you can see/)
  const copy = await scalar(db, "select public.replace_expense($1, 'Typo', $2)", [atBranch[0].id, JSON.stringify({ note: 'April rent' })])
  eq((await admin(db, 'select bill_id, bill_due_on::text from expenses where id = $1', [copy]))[0], { bill_id: rentId, bill_due_on: '2027-04-10' }, 'fixing that expense keeps its rent link (carried, not chosen)')

  // A cashier's drawer row never names a bill.
  await reset(db)
  await db.query(`insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values ($1, $2, $3, $4, 'Cara', 500)`, [SHIFT, T_A, OUT_A1, U.cashier])
  await db.query(`insert into shift_cash_movements (id, tenant_id, shift_id, kind, amount, reason, recorded_by, recorded_by_name) values ($1, $2, $3, 'pay_out', 85.00, 'water', $4, 'Cara')`, [PAYOUT, T_A, SHIFT, U.cashier])
  await as(db, 'authenticated', U.cashier)
  const { rows: drawer } = await db.query(
    "insert into expenses (tenant_id, category_id, amount_cents, paid_from, shift_cash_movement_id, created_by_name, bill_id, bill_due_on) values ($1, $2, 8500, 'drawer', $3, 'Cara', $4, '2027-03-05') returning id",
    [T_A, cat.water, PAYOUT, branchBillId])
  eq(drawer.length, 1, 'a cashier files their own drawer pay-out')
  eq((await admin(db, 'select bill_id, bill_due_on from expenses where id = $1', [drawer[0].id]))[0], { bill_id: null, bill_due_on: null }, 'but the bill it named is dropped (v1 bills are never paid from the drawer)')
}

/** "Remind me tomorrow" again = ONE upsert (PostgREST on_conflict=bill_id,due_on), never delete + insert. */
async function checkMarkUpsert(db, { rentId, branchBillId }) {
  const UPSERT = `insert into expense_bill_marks (tenant_id, bill_id, due_on, kind, snoozed_until) values ($1, $2, $3, $4, $5)
    on conflict (bill_id, due_on) do update set tenant_id = excluded.tenant_id, bill_id = excluded.bill_id, due_on = excluded.due_on,
      kind = excluded.kind, snoozed_until = excluded.snoozed_until
    returning bill_id, due_on::text, kind, snoozed_until::text`
  await as(db, 'authenticated', U.owner)
  eq((await db.query(UPSERT, [T_A, rentId, '2027-06-10', 'snoozed', '2027-06-11'])).rows.length, 1, 'the first mark on a due date is an insert')
  eq((await db.query(UPSERT, [T_A, rentId, '2027-06-10', 'snoozed', '2027-06-12'])).rows, [{ bill_id: rentId, due_on: '2027-06-10', kind: 'snoozed', snoozed_until: '2027-06-12' }], 'remind me again: the same row, a new date')
  eq((await db.query(UPSERT, [T_A, rentId, '2027-06-10', 'skipped', null])).rows[0].kind, 'skipped', 'or "Nothing to pay this time" over a snooze')
  eq(await count(db, "select count(*) from expense_bill_marks where bill_id = $1 and due_on = '2027-06-10'", [rentId]), 1, 'still one mark on that due date')
  await refused(db.query(UPSERT, [T_B, rentId, '2027-06-10', 'skipped', null]), '42501', "an upsert cannot carry a mark to another store")

  await as(db, 'authenticated', U.branchBook)
  await refused(db.query(UPSERT, [T_A, rentId, '2027-06-10', 'snoozed', '2027-06-20']), '42501', 'a branch-locked holder cannot upsert over a store-wide bill mark')
  eq((await db.query(UPSERT, [T_A, branchBillId, '2027-06-05', 'skipped', null])).rows.length, 1, 'but marks their own branch bill')
  for (const [who, label] of [[U.menu, 'staff without expenses'], [U.cashier, 'a cashier']]) {
    await as(db, 'authenticated', who)
    await refused(db.query(UPSERT, [T_A, rentId, '2027-06-10', 'snoozed', '2027-06-30']), '42501', `${label} cannot upsert a mark`)
  }
  await as(db, 'authenticated', U.owner)
  eq((await rows(db, "select kind from expense_bill_marks where bill_id = $1 and due_on = '2027-06-10'", [rentId]))[0].kind, 'skipped', 'nothing they tried changed it')
}

async function checkTenantDeletion(db) {
  await as(db, 'authenticated', U.ownerB)
  const { rows: bill } = await insertBill(db, { tenant: T_B, category: cat.bRent })
  eq(bill.length, 1, "store B's owner adds a bill")
  eq((await insertExpense(db, { tenant: T_B, category: cat.bRent, billId: bill[0].id, dueOn: '2026-10-05' })).rows.length, 1, 'and pays it')
  eq((await insertMark(db, { tenant: T_B, billId: bill[0].id, dueOn: '2026-11-05' })).rows.length, 1, 'and skips the next one')
  await reset(db)
  eq(await affected(db, 'delete from tenants where id = $1', [T_B]), 1, 'deleting a store cascades through its bills, marks and payments')
  eq(await count(db, 'select count(*) from expense_bills where tenant_id = $1', [T_B]), 0, 'and no bill of it is left')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    for (const file of [
      '20260823120000_staff_shifts.sql',
      '20260916150000_staff_shift_custody.sql',
      '20260927120000_staff_shift_server_timestamps.sql',
      '20261001120000_cash_drawers.sql',
      '20261013120050_staff_permission_keys.sql',
    ]) {
      await db.exec(readMigration(file))
    }
    await db.exec('set check_function_bodies = off')
    await db.exec(readMigration('20261012150000_store_activity.sql'))
    await db.exec('set check_function_bodies = on')
    await db.exec(SEED)
    for (const file of [
      '20261022120000_expenses.sql',
      '20261022120100_expenses_rpcs.sql',
      '20261022120200_expenses_activity_and_bucket.sql',
      '20261022120210_expenses_activity_validate.sql',
    ]) {
      await db.exec(readMigration(file))
    }
    await db.exec('set check_function_bodies = off')
    await db.exec(readMigration('20261022130000_expenses_security_folds.sql'))
    await db.exec('set check_function_bodies = on')
    await db.exec(readMigration('20261022130200_expenses_opt_in.sql'))
    await db.exec(readMigration('20261022140000_expense_bills.sql'))
    await db.exec(readMigration('20261022150000_expense_bills_fixes.sql'))
    await db.exec(readMigration('20261022160000_expense_bills_repause.sql'))

    await seedCategories(db)
    await checkAnon(db)
    await checkShapes(db)
    const ids = await checkOwner(db)
    const { branchBillId, otherBranchBillId } = await checkRoles(db)
    await checkPayments(db, { ...ids, branchBillId })
    await checkMarks(db, { rentId: ids.rentId, branchBillId })
    await checkPauseDates(db)
    await checkBillReach(db, { rentId: ids.rentId, branchBillId, otherBranchBillId })
    await checkMarkUpsert(db, { rentId: ids.rentId, branchBillId })
    await checkTenantDeletion(db)
    console.log(`Expense bills: ${checks} checks passed (anon, shapes per kind, owner, ended is final, roles + branch reach, payments, void frees a due date, replace carries the link, link/unlink, marks, pause dates, bill reach on payments, drawer rows never name a bill, mark upsert, store deletion).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
