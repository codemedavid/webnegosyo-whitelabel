/**
 * Customer PII is readable only with the `customers` staff grant.
 *
 * Every policy on `customers`, `customer_external_orders` and the `sms_*`
 * tables asked one question — "is this an admin of the row's tenant?" — and a
 * staff account IS `role = 'admin'`. Its `permissions` array was never
 * consulted, so a cashier granted only the register could pull the whole guest
 * list (names, phones, emails, spend, consent) straight through PostgREST: the
 * merchant app's guest list, campaign editor and POS picker all read the table
 * directly. That is the Data Privacy Act exposure this migration closes.
 *
 * The register still needs to attach a guest to a sale. It gets two narrow
 * definer functions instead of the table: an EXACT phone/email lookup (no
 * browsing, no partial match) and a quick-create — both open to `pos` staff.
 *
 * This runs in CI without a database; the live policies are probed through
 * `pg_policies` once the migration is applied.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, test, expect } from '@jest/globals'

/** The RLS tightening — held back until every store runs the RPC-path app. */
const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20261004180000_customers_staff_permission.sql'
)

/** The register RPCs, applied on their own ahead of the RLS tightening. */
const RPC_MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20261004170000_pos_customer_attach_rpcs.sql'
)

const GATE = "public.loyalty_has_permission(tenant_id, 'customers')"

const PII_TABLES = [
  'customers',
  'customer_external_orders',
  'sms_campaigns',
  'sms_campaign_runs',
  'sms_sends',
  'sms_suppressions',
] as const

/** Old policies that granted every admin of the tenant — staff included. */
const OLD_POLICIES = [
  ['customers', 'customers_select_by_tenant'],
  ['customers', 'customers_write_admin'],
  ['customer_external_orders', 'customer_external_orders_select_by_tenant'],
  ['customer_external_orders', 'customer_external_orders_write_admin'],
  ['sms_campaigns', 'sms_campaigns_rw'],
  ['sms_campaign_runs', 'sms_campaign_runs_rw'],
  ['sms_sends', 'sms_sends_rw'],
  ['sms_suppressions', 'sms_suppressions_rw'],
] as const

/** Executable statements only: comments quote the old predicate to explain it. */
function executableSql(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

function migrationSql(): string {
  return executableSql(MIGRATION)
}

function rpcSql(): string {
  return executableSql(RPC_MIGRATION)
}

/** The body of one `create ... function public.<name>` statement. */
function functionSql(name: string): string {
  const sql = rpcSql()
  const start = sql.indexOf(`function public.${name}(`)
  expect(start).toBeGreaterThan(-1)
  const end = sql.indexOf('$$;', start)
  return sql.slice(start, end)
}

describe('customer PII policies', () => {
  test.each(OLD_POLICIES)('drops the any-admin policy %s.%s', (table, policy) => {
    expect(migrationSql()).toContain(`drop policy if exists ${policy} on public.${table};`)
  })

  test.each(PII_TABLES)('gates every %s policy on the customers grant', (table) => {
    const sql = migrationSql()
    const creates = sql
      .split(';')
      .filter((statement) => new RegExp(`create policy \\w+ on public\\.${table}\\b`).test(statement))

    // read, insert, update and delete — FOR ALL would hide which is which.
    expect(creates).toHaveLength(4)
    for (const statement of creates) {
      expect(statement).toContain(GATE)
      expect(statement).not.toMatch(/\bfor all\b/i)
    }
  })

  test('never re-creates the bare admin-of-tenant predicate', () => {
    expect(migrationSql()).not.toMatch(/au\.role\s*=\s*'admin'/)
  })
})

describe('register lookup functions', () => {
  test.each(['pos_find_customer', 'pos_create_customer'])(
    '%s is a pinned definer function open to pos or customers staff',
    (name) => {
      const body = functionSql(name)
      expect(body).toMatch(/security definer/i)
      expect(body).toMatch(/set search_path = public/i)
      expect(body).toContain("public.loyalty_has_permission(p_tenant_id, 'pos')")
      expect(body).toContain("public.loyalty_has_permission(p_tenant_id, 'customers')")

      const sql = rpcSql()
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`))
    }
  )

  test('the lookup matches exactly — no browsing the list by fragment', () => {
    const body = functionSql('pos_find_customer')
    expect(body).not.toMatch(/\blike\b|\bilike\b|~/i)
    expect(body).toMatch(/limit 1/i)
  })

  test('the lookup returns only what attaching a guest needs', () => {
    const body = functionSql('pos_find_customer')
    expect(body).not.toMatch(/total_spent|order_count|sms_consent|notes/)
  })
})
