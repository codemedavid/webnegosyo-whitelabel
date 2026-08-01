/**
 * The `*_write_admin` policies decide whether a signed-in merchant may write a
 * row, and five of them asked the wrong question:
 *
 *   au.role = 'admin' AND au.tenant_id = au.tenant_id
 *
 * The right-hand side is the same column as the left, so the comparison is
 * always true and the policy collapses to "is any admin". Any merchant admin
 * could write any other tenant's categories, menu items, order types, payment
 * methods and customer form fields.
 *
 * The fix compares the admin's tenant to *the row's* tenant. This test locks
 * the shape of that comparison in the migration, so the self-comparison cannot
 * be copied into a sixth table the next time one of these policies is written —
 * which is how it spread to five in the first place.
 *
 * The live database is checked separately, by probing `pg_policies` before and
 * after the migration is applied; that evidence is in the TDD report. This test
 * is the part that runs in CI without a database.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260815130000_fix_tenant_write_policy_scope.sql',
)

/** Every table whose `*_write_admin` policy carried the self-comparison. */
const AFFECTED_TABLES = [
  'categories',
  'customer_form_fields',
  'menu_items',
  'order_types',
  'payment_methods',
] as const

/**
 * The executable statements only. Comments are stripped because the migration
 * quotes the broken predicate in order to explain it, and a scan for the
 * anti-pattern must not trip over the description of the anti-pattern.
 */
function migrationSql(): string {
  return readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

describe('tenant write policies', () => {
  it('never compares the admin tenant to itself', () => {
    // Collapses to "is any admin", which is the defect being fixed.
    expect(migrationSql()).not.toMatch(/au\.tenant_id\s*=\s*au\.tenant_id/)
  })

  it.each(AFFECTED_TABLES)(
    'scopes the %s write policy to the row it is deciding about',
    (table) => {
      expect(migrationSql()).toContain(`au.tenant_id = ${table}.tenant_id`)
    },
  )

  it.each(AFFECTED_TABLES)(
    'redefines the %s policy rather than leaving the old one in place',
    (table) => {
      const sql = migrationSql()
      expect(sql).toContain(`DROP POLICY IF EXISTS ${table}_write_admin`)
      expect(sql).toContain(`CREATE POLICY ${table}_write_admin`)
    },
  )

  it.each(AFFECTED_TABLES)(
    'judges an inserted %s row on the row being written, not only on reads',
    (table) => {
      // WITH CHECK governs INSERT. Without it the policy would default to
      // USING, which reads correctly here but leaves the intent implicit.
      const clause = new RegExp(
        `CREATE POLICY ${table}_write_admin[\\s\\S]*?WITH CHECK[\\s\\S]*?au\\.tenant_id = ${table}\\.tenant_id`,
      )
      expect(migrationSql()).toMatch(clause)
    },
  )

  it('keeps superadmin able to write across tenants', () => {
    // Platform admins legitimately act on any tenant; narrowing to the row's
    // tenant must not lock them out of the superadmin console. Twice per table,
    // once in USING and once in WITH CHECK.
    const superadminChecks = migrationSql().match(/au\.role = 'superadmin'/g) ?? []
    expect(superadminChecks).toHaveLength(AFFECTED_TABLES.length * 2)
  })
})
