// Standalone, isolated PostgreSQL regression. Requires @electric-sql/pglite
// (it may be installed outside this repository and supplied via NODE_PATH).
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      create table loyalty_programs (id uuid primary key, tenant_id uuid not null);
      create table loyalty_program_versions (id uuid primary key, rules jsonb);
      create table loyalty_ledger (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, program_id uuid,
        version_id uuid, customer_key text, kind text, delta numeric,
        order_backend text, external_order_id text, is_shadow boolean, actor uuid, note text
      );
      create unique index loyalty_ledger_order_uq on loyalty_ledger
        (program_id, order_backend, external_order_id, kind) where external_order_id is not null;
      create table loyalty_balances (
        tenant_id uuid, program_id uuid, customer_key text, customer_id uuid,
        balance numeric default 0, lifetime_earned numeric default 0,
        rewards_issued integer default 0, updated_at timestamptz,
        unique(program_id, customer_key)
      );
      create table loyalty_entitlements (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, program_id uuid,
        version_id uuid, customer_key text, source_ledger_id uuid, terms jsonb,
        expires_at timestamptz, status text default 'issued', updated_at timestamptz
      );
      create table loyalty_reservations (
        id uuid primary key default gen_random_uuid(), tenant_id uuid,
        entitlement_id uuid, status text default 'held', updated_at timestamptz
      );
    `)
    const root = path.resolve(__dirname, '../..')
    const original = readFileSync(path.join(root, 'supabase/migrations/20260905140000_loyalty_programs.sql'), 'utf8')
    await db.exec(original.match(/create or replace function public\.apply_loyalty_earning\([\s\S]*?\n\$\$;/)[0])
    if (!process.argv.includes('--baseline')) {
      await db.exec(readFileSync(path.join(root, 'supabase/migrations/20260906150000_loyalty_reversal_accounting.sql'), 'utf8'))
    }
    await db.exec(readFileSync(path.join(__dirname, 'loyalty-earning.sql'), 'utf8'))
    console.log('Loyalty SQL regressions passed')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
