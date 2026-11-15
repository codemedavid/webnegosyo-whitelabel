// The export log (report_exports): each caller writes only their own row, for
// a store where they hold `reports`; they read their own rows, the owner and
// `activity_view` staff read the store's; nobody edits or deletes. Runs the
// REAL migrations over PGlite with Supabase's default grants: the table
// (20261114120000) and its follow-up (20261115150000: a BRANCH account with
// `activity_view` reads only rows exported for its branch; custom / saved-format
// exports keep what shaped them).
//   node tests/sql/run-report-exports.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const OWNER = '00000000-0000-4000-8000-00000000000a'
const REPORTER = '00000000-0000-4000-8000-00000000000b' // reports only
const ANALYST = '00000000-0000-4000-8000-00000000000c' // analytics (implies reports)
const CASHIER = '00000000-0000-4000-8000-00000000000d' // pos only
const WATCHER = '00000000-0000-4000-8000-00000000000e' // activity_view only
const LEGACY = '00000000-0000-4000-8000-00000000000f' // permissions null
const STRANGER = '00000000-0000-4000-8000-000000000010' // other store's owner
const BRANCH_WATCHER = '00000000-0000-4000-8000-000000000011' // activity_view + reports, locked to BRANCH_A
const BRANCH_A = '00000000-0000-4000-8000-0000000000a1'
const BRANCH_B = '00000000-0000-4000-8000-0000000000b1'
const TEMPLATE = '00000000-0000-4000-8000-0000000000c1'

// Copied verbatim from 20261112022453_owl_assistant_access_and_kinds.sql (live).
const HAS_PERMISSION = `
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
`

// Copied verbatim from the live body (pg_get_functiondef, 2026-11-15).
const MAY_REACH_BRANCH = `
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

function insertSql(overrides = {}) {
  const row = {
    tenant_id: STORE,
    sheets: '{orders,order_lines}',
    preset: 'today',
    period_from: '2026-11-14',
    period_to: '2026-11-14',
    format: 'xlsx',
    source: 'page',
    bytes: 1234,
    ...overrides,
  }
  const columns = Object.keys(row)
  return {
    text: `insert into public.report_exports (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id, user_id`,
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

async function visibleTo(db, uid) {
  await as(db, 'authenticated', uid)
  return (await db.query('select user_id from public.report_exports order by created_at, id')).rows.map((row) => row.user_id)
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
      -- The FK target of report_exports.template_id (the real table is 20261114150000).
      create table public.report_templates (id uuid primary key, tenant_id uuid not null);
      grant select on public.report_templates to authenticated;
      insert into public.report_templates (id, tenant_id) values ('${TEMPLATE}', '${STORE}');
      insert into public.tenants (id) values ('${STORE}'), ('${OTHER}');
      insert into public.app_users (user_id, role, tenant_id, is_owner, permissions) values
        ('${OWNER}', 'admin', '${STORE}', true, null),
        ('${REPORTER}', 'admin', '${STORE}', false, '{reports}'),
        ('${ANALYST}', 'admin', '${STORE}', false, '{analytics}'),
        ('${CASHIER}', 'admin', '${STORE}', false, '{pos}'),
        ('${WATCHER}', 'admin', '${STORE}', false, '{activity_view}'),
        ('${LEGACY}', 'admin', '${STORE}', false, null),
        ('${STRANGER}', 'admin', '${OTHER}', true, null);
      insert into public.app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
        ('${BRANCH_WATCHER}', 'admin', '${STORE}', false, '{reports,activity_view}', '${BRANCH_A}');
    `)
    await db.exec(HAS_PERMISSION)
    await db.exec(MAY_REACH_BRANCH)
    await db.exec(readMigration('20261114120000_report_exports.sql'))
    await db.exec(readMigration('20261115150000_report_exports_branch_scope_and_shape.sql'))
    await db.exec('begin')

    // Whoever holds `reports` (outright, through analytics, as owner, as a legacy full-access account) logs their own export.
    for (const uid of [OWNER, REPORTER, ANALYST, LEGACY]) {
      const { rows } = await insertAs(db, uid)
      assert.equal(rows.length, 1, `insert as ${uid}`)
      assert.equal(rows[0].user_id, uid, 'user_id defaults to the caller')
    }

    // No reports key, another store, or no session: refused loudly (never a silent zero rows).
    await rejects(db, () => insertAs(db, CASHIER), /row-level security/, 'cashier without reports refused')
    await rejects(db, () => insertAs(db, WATCHER), /row-level security/, 'activity_view alone cannot export')
    await rejects(db, () => insertAs(db, STRANGER), /row-level security/, "another store's owner refused")
    await rejects(db, () => insertAs(db, REPORTER, { tenant_id: OTHER }), /row-level security/, 'cannot log into another store')
    await rejects(db, () => insertAs(db, REPORTER, { user_id: OWNER }), /row-level security/, 'cannot log as someone else')
    await asAnon(db)
    await rejects(db, () => db.query(insertSql().text, insertSql().values), /permission denied/, 'anon has no grant')
    await rejects(db, () => db.query('select 1 from public.report_exports'), /permission denied/, 'anon cannot read')

    // Column checks hold for a legitimate caller too.
    await rejects(db, () => insertAs(db, REPORTER, { format: 'pdf' }), /violates check/, 'format is xlsx or csv')
    await rejects(db, () => insertAs(db, REPORTER, { source: 'cron' }), /violates check/, 'source is page / button / owl')
    await rejects(db, () => insertAs(db, REPORTER, { sheets: '{}' }), /violates check/, 'at least one sheet')
    await rejects(db, () => insertAs(db, REPORTER, { period_to: '2026-11-13' }), /violates check/, 'period ends on or after it starts')

    // Reading: your own rows; owner and activity_view see the store; other stores see nothing.
    assert.deepEqual(await visibleTo(db, REPORTER), [REPORTER], 'reporter sees only their own')
    assert.deepEqual(await visibleTo(db, ANALYST), [ANALYST], 'analyst sees only their own')
    assert.deepEqual((await visibleTo(db, OWNER)).sort(), [OWNER, REPORTER, ANALYST, LEGACY].sort(), 'owner sees the store')
    assert.deepEqual((await visibleTo(db, WATCHER)).sort(), [OWNER, REPORTER, ANALYST, LEGACY].sort(), 'activity_view sees the store')
    assert.deepEqual(await visibleTo(db, LEGACY), [LEGACY], 'legacy full access does not include activity_view')
    assert.deepEqual(await visibleTo(db, CASHIER), [], 'cashier sees none')

    // A branch account with activity_view: its own rows + rows exported FOR its branch, never the
    // whole store's, another branch's or "no branch yet".
    await insertAs(db, BRANCH_WATCHER, { branch: BRANCH_A })
    await insertAs(db, OWNER, { branch: BRANCH_A })
    await insertAs(db, OWNER, { branch: BRANCH_B })
    await insertAs(db, OWNER, { branch: 'unassigned' })
    await reset(db)
    const branchRows = async (uid) => {
      await as(db, 'authenticated', uid)
      return (await db.query('select user_id, branch from public.report_exports order by created_at, id')).rows.map((row) => `${row.user_id === uid ? 'own' : 'other'}:${row.branch ?? 'store'}`)
    }
    assert.deepEqual((await branchRows(BRANCH_WATCHER)).sort(), ['other:' + BRANCH_A, 'own:' + BRANCH_A].sort(), 'branch watcher: own + its branch only')
    assert.equal((await branchRows(WATCHER)).length, 8, 'store-wide watcher still sees every row')
    assert.equal((await branchRows(OWNER)).length, 8, 'owner still sees every row')

    // Shape: custom keeps its spec, a saved format its id (cleared when the format is removed).
    const custom = await insertAs(db, REPORTER, { shape: 'custom', custom_spec: JSON.stringify({ sheet: 'orders', title: 'Mine', columns: [{ id: 'total' }] }) })
    assert.equal(custom.rows.length, 1, 'custom export logged with its spec')
    const saved = await insertAs(db, REPORTER, { shape: 'template', template_id: TEMPLATE })
    assert.equal(saved.rows.length, 1, 'saved-format export logged with its id')
    await rejects(db, () => insertAs(db, REPORTER, { shape: 'custom' }), /violates check/, 'custom needs its spec')
    await rejects(db, () => insertAs(db, REPORTER, { custom_spec: '{"a":1}' }), /violates check/, 'a spec only on a custom export')
    await rejects(db, () => insertAs(db, REPORTER, { template_id: TEMPLATE }), /violates check/, 'a format id only on a format export')
    await rejects(db, () => insertAs(db, REPORTER, { shape: 'custom', custom_spec: JSON.stringify({ x: 'y'.repeat(4500) }) }), /violates check/, 'spec is bounded')
    await rejects(db, () => insertAs(db, REPORTER, { shape: 'pdf' }), /violates check/, 'shape is one of three')
    await reset(db)
    await db.query('delete from public.report_templates where id = $1', [TEMPLATE])
    const cleared = await db.query('select template_id from public.report_exports where id = $1', [saved.rows[0].id])
    assert.equal(cleared.rows[0].template_id, null, 'a removed format clears the id (set null)')
    assert.deepEqual(await visibleTo(db, STRANGER), [], "another store's owner sees none")

    // Append-only for clients: no UPDATE or DELETE grant at all.
    await as(db, 'authenticated', OWNER)
    await rejects(db, () => db.query('update public.report_exports set bytes = 0'), /permission denied/, 'no update')
    await rejects(db, () => db.query('delete from public.report_exports'), /permission denied/, 'no delete')

    // Rows go with the store.
    await reset(db)
    await db.query('delete from public.tenants where id = $1', [STORE])
    assert.equal((await db.query('select count(*)::int as n from public.report_exports')).rows[0].n, 0, 'cascade on store delete')

    await db.exec('rollback')
    console.log('report_exports: all checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
