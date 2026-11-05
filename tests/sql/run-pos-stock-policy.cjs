// tenants.pos_stock_policy (20261104150000), pinned in PGlite as the role that
// really runs each query.
//
// Loads the REAL migration over a stub of tenants + app_users with the live
// tenants policies that matter here (public read of active stores,
// tenants_update_staff, tenants_write_superadmin). Asserts:
//   - every store starts on 'warn'; anything but 'warn' | 'block' is refused;
//   - authenticated staff of the store (and anon) can READ the policy;
//   - only the store owner (store-wide) or a superadmin may CHANGE it as a
//     client; staff with `settings`, a branch-locked owner and another store's
//     owner are refused (42501 / zero rows); the service role always may;
//   - saving other columns with the policy unchanged still works for staff.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_OTHER = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUTLET = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  settingsStaff: '00000000-0000-4000-8000-000000000002',
  branchOwner: '00000000-0000-4000-8000-000000000003',
  otherOwner: '00000000-0000-4000-8000-000000000004',
  superadmin: '00000000-0000-4000-8000-000000000005',
  cashier: '00000000-0000-4000-8000-000000000006',
}

// The live tenants policies (pg_policies, 2026-11-04), with the permission
// helper reduced to what these accounts need: an owner holds every key, staff
// hold their listed keys.
const STUB = `
  create table public.tenants (
    id uuid primary key, name text, is_active boolean not null default true
  );
  create table public.app_users (
    user_id uuid not null, tenant_id uuid, role text not null,
    is_owner boolean default false, outlet_id uuid, permissions text[]
  );
  alter table public.tenants enable row level security;
  create or replace function public.app_user_holds_any_permission(p_tenant uuid, p_keys text[])
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid() and au.tenant_id = p_tenant and au.role = 'admin'
         and (au.is_owner or au.permissions is null or au.permissions && p_keys)
    )
  $$;
  create policy tenants_read_active on public.tenants for select using (is_active = true);
  create policy tenants_write_superadmin on public.tenants for all using (
    exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));
  create policy tenants_update_staff on public.tenants for update to authenticated
    using (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']))
    with check (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']));
  -- app_users_select_self (live): the guard reads the caller's own row.
  alter table public.app_users enable row level security;
  create policy app_users_select_self on public.app_users for select using (user_id = auth.uid());
`

const SEED = `
  insert into public.tenants (id, name) values ('${T}', 'Lolys'), ('${T_OTHER}', 'Other');
  insert into public.app_users (user_id, tenant_id, role, is_owner, outlet_id, permissions) values
    ('${U.owner}', '${T}', 'admin', true, null, null),
    ('${U.settingsStaff}', '${T}', 'admin', false, null, array['settings', 'store_setup']),
    ('${U.branchOwner}', '${T}', 'admin', true, '${OUTLET}', null),
    ('${U.otherOwner}', '${T_OTHER}', 'admin', true, null, null),
    ('${U.superadmin}', null, 'superadmin', false, null, null),
    ('${U.cashier}', '${T}', 'admin', false, null, array['pos']);
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}

async function policyOf(db, tenant = T) {
  await reset(db)
  const { rows } = await db.query('select pos_stock_policy from public.tenants where id = $1', [tenant])
  return rows[0]?.pos_stock_policy
}

async function setPolicy(db, tenant, value) {
  await reset(db)
  await db.query('update public.tenants set pos_stock_policy = $2 where id = $1', [tenant, value])
}

/** Run an UPDATE as `role`/`uid`; answers rows affected, or the SQLSTATE it raised. */
async function tryUpdate(db, role, uid, sql, params) {
  if (role === 'anon') await asAnon(db)
  else await as(db, role, uid)
  try {
    const result = await db.query(sql, params)
    return result.affectedRows ?? 0
  } catch (error) {
    return error.code ?? String(error.message)
  } finally {
    await reset(db)
  }
}

const SET_BLOCK = ['update public.tenants set pos_stock_policy = $2 where id = $1 returning id', [T, 'block']]

async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB)
  await db.exec(SEED)
  await db.exec(readMigration('20261104150000_tenants_pos_stock_policy.sql'))
  // Re-running the migration is harmless (it is applied by hand, maybe twice).
  await db.exec(readMigration('20261104150000_tenants_pos_stock_policy.sql'))

  // Default and domain.
  eq(await policyOf(db), 'warn', 'an existing store starts on warn')
  await reset(db)
  await db.query(`insert into public.tenants (id, name) values ('cccccccc-0000-4000-8000-000000000001', 'New')`)
  eq(await policyOf(db, 'cccccccc-0000-4000-8000-000000000001'), 'warn', 'a new store starts on warn')
  await reset(db)
  await assert.rejects(
    db.query('update public.tenants set pos_stock_policy = $2 where id = $1', [T, 'ignore']),
    /pos_stock_policy/,
    'only warn | block',
  )
  checks += 1
  await assert.rejects(
    db.query('update public.tenants set pos_stock_policy = null where id = $1', [T]),
    /null/i,
    'never null',
  )
  checks += 1

  // Reads: the register session and the storefront.
  for (const [label, uid] of [['cashier', U.cashier], ['owner', U.owner]]) {
    await as(db, 'authenticated', uid)
    const { rows } = await db.query('select pos_stock_policy from public.tenants where id = $1', [T])
    eq(rows, [{ pos_stock_policy: 'warn' }], `${label} reads the policy`)
  }
  await asAnon(db)
  eq((await db.query('select pos_stock_policy from public.tenants where id = $1', [T])).rows.length, 1, 'anon reads it')
  await reset(db)

  // Writes refused.
  eq(await tryUpdate(db, 'authenticated', U.settingsStaff, ...SET_BLOCK), '42501', 'staff with settings cannot change it')
  eq(await tryUpdate(db, 'authenticated', U.branchOwner, ...SET_BLOCK), '42501', 'a branch-locked owner cannot change it')
  eq(await tryUpdate(db, 'authenticated', U.otherOwner, ...SET_BLOCK), 0, "another store's owner reaches no row")
  eq(await tryUpdate(db, 'authenticated', U.cashier, ...SET_BLOCK), 0, 'a cashier reaches no row')
  eq(await tryUpdate(db, 'anon', null, ...SET_BLOCK), 0, 'anon reaches no row')
  eq(await policyOf(db), 'warn', 'still warn after every refusal')

  // Writes allowed.
  eq(await tryUpdate(db, 'authenticated', U.owner, ...SET_BLOCK), 1, 'the owner switches it to block')
  eq(await policyOf(db), 'block', 'block stored')
  eq(
    await tryUpdate(db, 'authenticated', U.superadmin, 'update public.tenants set pos_stock_policy = $2 where id = $1 returning id', [T, 'warn']),
    1,
    'a superadmin may change it',
  )
  eq(await policyOf(db), 'warn', 'back to warn')
  eq(await tryUpdate(db, 'service_role', null, ...SET_BLOCK), 1, 'the service role may change it')
  eq(await policyOf(db), 'block', 'service role wrote block')

  // Unchanged policy does not get in the way of other settings saves.
  await setPolicy(db, T, 'block')
  eq(
    await tryUpdate(db, 'authenticated', U.settingsStaff, 'update public.tenants set name = $2, pos_stock_policy = $3 where id = $1 returning id', [T, 'Lolys Cafe', 'block']),
    1,
    'staff re-sending the same policy with another change still saves',
  )
  eq(await policyOf(db), 'block', 'the policy is untouched')

  console.log(`pos_stock_policy: ${checks} checks passed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
