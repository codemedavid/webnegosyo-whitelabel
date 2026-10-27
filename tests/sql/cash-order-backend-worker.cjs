// PGlite worker for tests/unit/cash/order-backend-sql-parity.test.ts.
// Jest cannot load PGlite (dynamic wasm import), so the test writes its cases
// to a JSON file and runs this script in a plain Node process:
//
//   node tests/sql/cash-order-backend-worker.cjs <cases.json>  →  JSON on stdout
//
// Cases: [{ order_backend, convex_deployment_url }]. Output: { results: [backend] },
// one cash.tenant_order_backend() answer per case, from the REAL migration.
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, readMigration } = require('./lib/platform-auth.cjs')

const STUB = `
  create table tenants (id uuid primary key, order_backend text, convex_deployment_url text);
  create table outlets (id uuid primary key, tenant_id uuid not null);
  create table app_users (user_id uuid primary key, role text, tenant_id uuid, is_owner boolean, permissions text[], outlet_id uuid, display_name text, email text);
  create function public.app_user_may_reach_branch(uuid, uuid) returns boolean language sql stable as $$ select false $$;
  create function public.app_user_belongs_to_store(uuid) returns boolean language sql stable as $$ select false $$;
`

async function main() {
  const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB)
  await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
  await db.exec(readMigration('20261027120100_cash_manage_permission.sql'))
  await db.exec(readMigration('20261027120200_cash_settings.sql'))
  // One round trip: every case becomes a tenant row, then one read in case order.
  await db.query(`insert into tenants (id, order_backend, convex_deployment_url)
    select ('00000000-0000-4000-8000-' || lpad(c.ord::text, 12, '0'))::uuid, c.v ->> 'order_backend', c.v ->> 'convex_deployment_url'
      from jsonb_array_elements($1::jsonb) with ordinality as c(v, ord)`, [JSON.stringify(cases)])
  const { rows } = await db.query(`select cash.tenant_order_backend(t.id) as backend from tenants t order by t.id`)
  const results = rows.map((row) => row.backend)
  await db.close()
  process.stdout.write(JSON.stringify({ results }))
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})
