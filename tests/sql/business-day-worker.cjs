// PGlite worker for tests/unit/business-day/trading-day-sql-parity.property.test.ts.
//
//   node tests/sql/business-day-worker.cjs <input.json>  →  JSON on stdout
//
// Input: { stores: [{ tenantId, schedule: [{ effectiveFrom, cutoffMinutes }] }],
//          probes: [{ tenantId, at }], days: [{ tenantId, day }] }
// Output: { of: ['YYYY-MM-DD'], bounds: [{ startIso, endIso }] } from the REAL
// 20261027120000 helpers (called with no JWT subject, like a server job).
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, readMigration } = require('./lib/platform-auth.cjs')

async function main() {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(`
    create table tenants (id uuid primary key, timezone text not null default 'Asia/Manila');
    create table app_users (user_id uuid primary key, role text, tenant_id uuid, is_owner boolean, permissions text[], outlet_id uuid, display_name text, email text);
  `)
  await db.exec(readMigration('20261027120000_business_day_cutoffs.sql'))
  const stores = input.stores
  await db.query('insert into tenants (id) select (s->>\'tenantId\')::uuid from jsonb_array_elements($1::jsonb) s', [JSON.stringify(stores)])
  const cutoffs = stores.flatMap((s) => s.schedule.map((c) => ({ tenant_id: s.tenantId, effective_from: c.effectiveFrom, cutoff_minutes: c.cutoffMinutes })))
  await db.query(`insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes)
    select tenant_id, effective_from, cutoff_minutes from jsonb_populate_recordset(null::business_day_cutoffs, $1::jsonb)`, [JSON.stringify(cutoffs)])
  const of = (await db.query(`select public.business_day_of((p->>'tenantId')::uuid, (p->>'at')::timestamptz)::text as day
      from jsonb_array_elements($1::jsonb) with ordinality as e(p, n) order by n`, [JSON.stringify(input.probes)])).rows.map((r) => r.day)
  const bounds = (await db.query(`select to_char(b.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "startIso",
             to_char(b.end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "endIso"
      from jsonb_array_elements($1::jsonb) with ordinality as e(d, n),
           lateral public.business_day_bounds((d->>'tenantId')::uuid, (d->>'day')::date) b
      order by n`, [JSON.stringify(input.days)])).rows
  await db.close()
  process.stdout.write(JSON.stringify({ of, bounds }))
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})
