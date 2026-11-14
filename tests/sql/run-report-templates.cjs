// Saved report formats (report_templates): store-wide accounts with `reports`
// read, save and remove their store's formats; a branch-locked account, an
// account without the key, another store and anon get nothing; nobody edits
// one in place; a store keeps at most 50; names are unique per store. Runs
// the REAL migration over PGlite with Supabase's default grants.
//   node tests/sql/run-report-templates.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const BRANCH = '00000000-0000-4000-8000-0000000000b1'
const OWNER = '00000000-0000-4000-8000-00000000000a'
const REPORTER = '00000000-0000-4000-8000-00000000000b' // reports only, store-wide
const ANALYST = '00000000-0000-4000-8000-00000000000c' // analytics (implies reports)
const CASHIER = '00000000-0000-4000-8000-00000000000d' // pos only
const BRANCH_REPORTER = '00000000-0000-4000-8000-00000000000e' // reports, locked to a branch
const LEGACY = '00000000-0000-4000-8000-00000000000f' // permissions null
const STRANGER = '00000000-0000-4000-8000-000000000010' // other store's owner
const PLATFORM = '00000000-0000-4000-8000-000000000011' // superadmin, no store

// Copied verbatim from the live platform database (pg_get_functiondef, 2026-11-14).
const HELPERS = `
create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses', 'cash_manage', 'assistant']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$$;
revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
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
`

const SPEC = JSON.stringify({ title: 'Average order per day', sheet: 'sales_by_day', columns: [{ id: 'day' }, { id: 'aov', header: 'Avg ticket' }], filters: [], sort: { column: 'aov', descending: true }, top: 5 })

function insertSql(overrides = {}) {
  const row = { tenant_id: STORE, name: 'Average order per day', kind: 'custom', spec: SPEC, ...overrides }
  const columns = Object.keys(row)
  return {
    text: `insert into public.report_templates (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id, created_by`,
    values: Object.values(row),
  }
}

async function insertAs(db, uid, overrides) {
  await as(db, 'authenticated', uid)
  const { text, values } = insertSql(overrides)
  return db.query(text, values)
}

async function rejects(db, work, pattern, label) {
  await db.exec('savepoint s')
  await assert.rejects(work(), pattern, label)
  await db.exec('rollback to savepoint s')
}

async function namesFor(db, uid) {
  await as(db, 'authenticated', uid)
  return (await db.query('select name from public.report_templates order by name')).rows.map((row) => row.name)
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(`
      create table public.tenants (id uuid primary key);
      create table public.app_users (
        user_id uuid primary key, role text not null, tenant_id uuid, is_owner boolean default false, permissions text[], outlet_id uuid
      );
      insert into public.tenants (id) values ('${STORE}'), ('${OTHER}');
      insert into public.app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
        ('${OWNER}', 'admin', '${STORE}', true, null, null),
        ('${REPORTER}', 'admin', '${STORE}', false, '{reports}', null),
        ('${ANALYST}', 'admin', '${STORE}', false, '{analytics}', null),
        ('${CASHIER}', 'admin', '${STORE}', false, '{pos}', null),
        ('${BRANCH_REPORTER}', 'admin', '${STORE}', false, '{reports}', '${BRANCH}'),
        ('${LEGACY}', 'admin', '${STORE}', false, null, null),
        ('${STRANGER}', 'admin', '${OTHER}', true, null, null),
        ('${PLATFORM}', 'superadmin', null, false, null, null);
    `)
    await db.exec(HELPERS)
    await db.exec(readMigration('20261114150000_report_templates.sql'))
    await db.exec('begin')

    // Store-wide accounts that hold `reports` (outright, through analytics, as owner, legacy full access) save a format.
    const names = { [OWNER]: 'Owner weekly', [REPORTER]: 'Average order per day', [ANALYST]: 'Top dishes', [LEGACY]: 'GCash orders' }
    for (const [uid, name] of Object.entries(names)) {
      const { rows } = await insertAs(db, uid, { name })
      assert.equal(rows.length, 1, `insert as ${uid}`)
      assert.equal(rows[0].created_by, uid, 'created_by defaults to the caller')
    }

    // Refused loudly: no key, locked to a branch, another store, platform staff, someone else's name, no session.
    await rejects(db, () => insertAs(db, CASHIER, { name: 'x1' }), /row-level security/, 'cashier without reports refused')
    await rejects(db, () => insertAs(db, BRANCH_REPORTER, { name: 'x2' }), /row-level security/, 'branch-locked account refused')
    await rejects(db, () => insertAs(db, STRANGER, { name: 'x3' }), /row-level security/, "another store's owner refused")
    await rejects(db, () => insertAs(db, PLATFORM, { name: 'x4' }), /row-level security/, 'platform staff refused')
    await rejects(db, () => insertAs(db, REPORTER, { name: 'x5', tenant_id: OTHER }), /row-level security/, 'cannot save into another store')
    await rejects(db, () => insertAs(db, REPORTER, { name: 'x6', created_by: OWNER }), /row-level security/, 'cannot save as someone else')
    await asAnon(db)
    await rejects(db, () => db.query(insertSql({ name: 'x7' }).text, insertSql({ name: 'x7' }).values), /permission denied/, 'anon has no grant')
    await rejects(db, () => db.query('select 1 from public.report_templates'), /permission denied/, 'anon cannot read')

    // Column checks hold for a legitimate caller too.
    await rejects(db, () => insertAs(db, REPORTER, { name: 'average ORDER per day' }), /duplicate key/, 'a name is unique per store, whatever the case')
    await rejects(db, () => insertAs(db, REPORTER, { name: ' padded ' }), /violates check/, 'a name is trimmed')
    await rejects(db, () => insertAs(db, REPORTER, { name: '' }), /violates check/, 'a name is not empty')
    await rejects(db, () => insertAs(db, REPORTER, { name: 'x'.repeat(61) }), /violates check/, 'a name is at most 60 characters')
    await rejects(db, () => insertAs(db, REPORTER, { name: 'x8', kind: 'format' }), /violates check/, 'only the custom kind exists')
    await rejects(db, () => insertAs(db, REPORTER, { name: 'x9', spec: '[]' }), /violates check/, 'spec is an object')
    await rejects(db, () => insertAs(db, REPORTER, { name: 'x10', spec: JSON.stringify({ pad: 'x'.repeat(8000) }) }), /violates check/, 'spec is small')

    // The same name in another store is fine.
    const { rows: abroad } = await insertAs(db, STRANGER, { tenant_id: OTHER, name: 'Average order per day' })
    assert.equal(abroad.length, 1, 'names are per store')

    // Reading: every store-wide reports account sees the store's formats; nobody else sees any.
    const all = Object.values(names).sort()
    for (const uid of [OWNER, REPORTER, ANALYST, LEGACY]) assert.deepEqual(await namesFor(db, uid), all, `store formats visible to ${uid}`)
    assert.deepEqual(await namesFor(db, CASHIER), [], 'cashier sees none')
    assert.deepEqual(await namesFor(db, BRANCH_REPORTER), [], 'branch-locked account sees none')
    assert.deepEqual(await namesFor(db, STRANGER), ['Average order per day'], "another store's owner sees only their own store's")
    assert.deepEqual(await namesFor(db, PLATFORM), [], 'platform staff see none')

    // Nobody edits in place: no UPDATE grant at all.
    await as(db, 'authenticated', OWNER)
    await rejects(db, () => db.query("update public.report_templates set name = 'renamed'"), /permission denied/, 'no update')

    // Removing: store-wide reports accounts remove any of the store's; others remove zero rows (silently, so writers assert rows).
    for (const uid of [CASHIER, BRANCH_REPORTER, STRANGER, PLATFORM]) {
      await as(db, 'authenticated', uid)
      const { rows } = await db.query('delete from public.report_templates where tenant_id = $1 returning id', [STORE])
      assert.equal(rows.length, 0, `${uid} removes nothing`)
    }
    await as(db, 'authenticated', REPORTER)
    const removed = await db.query("delete from public.report_templates where tenant_id = $1 and name = 'Owner weekly' returning id", [STORE])
    assert.equal(removed.rows.length, 1, "a reports account removes the owner's format")
    assert.deepEqual(await namesFor(db, OWNER), all.filter((name) => name !== 'Owner weekly'), 'and it is gone for everyone')

    // At most 50 per store: the 51st is refused, another store is not affected.
    await reset(db)
    const held = (await db.query('select count(*)::int as n from public.report_templates where tenant_id = $1', [STORE])).rows[0].n
    for (let index = held; index < 50; index += 1) await insertAs(db, OWNER, { name: `Format ${index}` })
    await rejects(db, () => insertAs(db, OWNER, { name: 'One too many' }), /report_templates_limit/, 'the 51st format is refused')
    const { rows: stillFine } = await insertAs(db, STRANGER, { tenant_id: OTHER, name: 'Second' })
    assert.equal(stillFine.length, 1, "another store's count is its own")
    // A refused outsider learns nothing from the limit: the policy answers first.
    await rejects(db, () => insertAs(db, STRANGER, { name: 'Probe' }), /row-level security/, 'an outsider gets the policy refusal, not the limit')

    // Rows go with the store.
    await reset(db)
    await db.query('delete from public.tenants where id = $1', [STORE])
    assert.equal((await db.query('select count(*)::int as n from public.report_templates where tenant_id = $1', [STORE])).rows[0].n, 0, 'cascade on store delete')

    await db.exec('rollback')
    console.log('report_templates: all checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
