// Staff seat floor: `enforce_staff_limit` must enforce the tenant's own
// allowance (`tenants.max_staff_per_branch`), not a hard-coded 3.
//
// Regression for 2026-10-29: a superadmin raised a store's seats from 3 to 5,
// the app and web both allowed a 4th account, and the database trigger refused
// it with "a store may have at most 3 store-wide staff accounts".
//
// The fixture installs the trigger body that was live on the platform before
// the fix (copied verbatim), proves it refuses the 4th seat, then runs the REAL
// migration and asserts affected rows per case.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const MIGRATION = '20261029120000_staff_limit_reads_allowance.sql'

const T_RAISED = '00000000-0000-0000-0000-0000000000a1'
const T_DEFAULT = '00000000-0000-0000-0000-0000000000a2'
const T_LOWERED = '00000000-0000-0000-0000-0000000000a3'
const T_NONE = '00000000-0000-0000-0000-0000000000a4'
const BRANCH_A = '00000000-0000-0000-0000-0000000000b1'
const BRANCH_B = '00000000-0000-0000-0000-0000000000b2'
const AUTHED_UID = '00000000-0000-0000-0000-0000000000c1'

let seq = 0
const nextUserId = () => `00000000-0000-0000-0001-${String(++seq).padStart(12, '0')}`

// Live body before the fix (pg_get_functiondef, 2026-10-29).
const LIVE_TRIGGER_BEFORE = `
CREATE OR REPLACE FUNCTION public.enforce_staff_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  peer_count INTEGER;
BEGIN
  IF new.role = 'admin' AND new.is_owner = false AND new.tenant_id IS NOT NULL THEN
    SELECT count(*) INTO peer_count
    FROM public.app_users
    WHERE tenant_id = new.tenant_id
      AND role = 'admin'
      AND is_owner = false
      AND user_id <> new.user_id
      AND outlet_id IS NOT DISTINCT FROM new.outlet_id;

    IF peer_count >= 3 THEN
      IF new.outlet_id IS NULL THEN
        RAISE EXCEPTION 'Staff limit reached: a store may have at most 3 store-wide staff accounts';
      ELSE
        RAISE EXCEPTION 'Staff limit reached: a branch may have at most 3 staff accounts';
      END IF;
    END IF;
  END IF;

  RETURN new;
END;
$function$;
CREATE TRIGGER app_users_enforce_staff_limit BEFORE INSERT OR UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION enforce_staff_limit();
`

async function setup(db) {
  await installPlatformAuth(db)
  await db.exec(`
    create table public.tenants (
      id uuid primary key,
      max_staff_per_branch integer not null default 3
    );
    create table public.outlets (id uuid primary key, tenant_id uuid not null);
    create table public.app_users (
      user_id uuid primary key,
      tenant_id uuid,
      role text not null default 'admin',
      is_owner boolean not null default false,
      outlet_id uuid,
      permissions text[]
    );
    insert into public.tenants values
      ('${T_RAISED}', 5), ('${T_DEFAULT}', 3), ('${T_LOWERED}', 3), ('${T_NONE}', 0);
    insert into public.outlets values ('${BRANCH_A}', '${T_RAISED}'), ('${BRANCH_B}', '${T_RAISED}');
  `)
  await db.exec(LIVE_TRIGGER_BEFORE)
}

async function addStaff(db, tenantId, { outletId = null, isOwner = false } = {}) {
  const userId = nextUserId()
  const result = await db.query(
    'insert into public.app_users (user_id, tenant_id, is_owner, outlet_id) values ($1, $2, $3, $4) returning user_id',
    [userId, tenantId, isOwner, outletId]
  )
  assert.equal(result.rows.length, 1, 'insert must return its row')
  return userId
}

async function fillStoreWide(db, tenantId, count) {
  const ids = []
  for (let i = 0; i < count; i += 1) ids.push(await addStaff(db, tenantId))
  return ids
}

async function main() {
  const db = new PGlite()
  let checks = 0
  const check = async (fn) => {
    await fn()
    checks += 1
  }
  try {
    await setup(db)

    // --- RED: the live body refuses the 4th seat on a store that bought 5. ---
    await as(db, 'service_role', null)
    await addStaff(db, T_RAISED, { isOwner: true })
    await fillStoreWide(db, T_RAISED, 3)
    await check(() =>
      assert.rejects(addStaff(db, T_RAISED), /at most 3 store-wide/, 'pre-fix body reproduces the bug')
    )

    // --- Apply the real migration. ---
    await reset(db)
    await db.exec(readMigration(MIGRATION))
    await as(db, 'service_role', null)

    // Raised allowance: seats 4 and 5 go in, the 6th is refused naming 5.
    await check(() => addStaff(db, T_RAISED))
    await check(() => addStaff(db, T_RAISED))
    await check(() =>
      assert.rejects(addStaff(db, T_RAISED), /at most 5 store-wide staff accounts/)
    )
    await check(async () => {
      const { rows } = await db.query(
        "select count(*)::int as n from public.app_users where tenant_id = $1 and not is_owner and outlet_id is null",
        [T_RAISED]
      )
      assert.equal(rows[0].n, 5)
    })

    // The owner never takes a seat, even on a full store.
    await check(() => addStaff(db, T_RAISED, { isOwner: true }))

    // Each branch is its own pool at the same allowance.
    for (let i = 0; i < 5; i += 1) await addStaff(db, T_RAISED, { outletId: BRANCH_A })
    await check(() =>
      assert.rejects(addStaff(db, T_RAISED, { outletId: BRANCH_A }), /a branch may have at most 5 staff accounts/)
    )
    const branchBStaff = await addStaff(db, T_RAISED, { outletId: BRANCH_B })
    checks += 1

    // Moving into a full pool is refused; moving into a pool with room is not.
    await check(() =>
      assert.rejects(
        db.query('update public.app_users set outlet_id = $1 where user_id = $2', [BRANCH_A, branchBStaff]),
        /a branch may have at most 5 staff accounts/
      )
    )

    // Platform default store: still 3.
    await fillStoreWide(db, T_DEFAULT, 3)
    await check(() => assert.rejects(addStaff(db, T_DEFAULT), /at most 3 store-wide/))

    // Lowered below what is held: nothing is taken away, edits still save,
    // but no new seat is handed out (caps bite on create only).
    const lowered = await fillStoreWide(db, T_LOWERED, 3)
    await reset(db)
    await db.exec(`update public.tenants set max_staff_per_branch = 2 where id = '${T_LOWERED}'`)
    await as(db, 'service_role', null)
    await check(async () => {
      const res = await db.query(
        "update public.app_users set permissions = array['orders'] where user_id = $1 returning user_id",
        [lowered[0]]
      )
      assert.equal(res.rows.length, 1, 'a permission edit on an over-allowance store must still save')
    })
    await check(() => assert.rejects(addStaff(db, T_LOWERED), /at most 2 store-wide/))

    // An owner-only plan (0 seats) refuses every staff account but not the owner.
    await check(() => addStaff(db, T_NONE, { isOwner: true }))
    await check(() => assert.rejects(addStaff(db, T_NONE), /at most 0 store-wide/))

    // The floor holds under RLS: a client role that can insert but cannot see
    // the store's rows or its tenant row still gets the true count.
    await reset(db)
    await db.exec(`
      alter table public.tenants enable row level security;
      alter table public.app_users enable row level security;
      create policy staff_insert_test on public.app_users for insert to authenticated with check (true);
    `)
    await as(db, 'authenticated', AUTHED_UID)
    await check(() =>
      assert.rejects(
        db.query('insert into public.app_users (user_id, tenant_id) values ($1, $2)', [nextUserId(), T_RAISED]),
        /at most 5 store-wide/
      )
    )

    // The trigger function is not callable by the API roles.
    await reset(db)
    await check(async () => {
      const { rows } = await db.query(`
        select has_function_privilege('anon', 'public.enforce_staff_limit()', 'execute') as anon,
               has_function_privilege('authenticated', 'public.enforce_staff_limit()', 'execute') as authed
      `)
      assert.deepEqual(rows[0], { anon: false, authed: false })
    })

    console.log(`Staff limit allowance: ${checks} checks passed (tenant allowance enforced per pool, edits never locked, RLS-proof count).`)
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
