/**
 * A platform superadmin opening a merchant's inventory could add an
 * ingredient but never receive stock into it: "Failed to record stock
 * movement", on-hand pinned at zero, an activity feed that read as empty.
 *
 * `20260809120000_inventory_branch_rls.sql` replaced the ledger's policies
 * with `app_user_may_reach_branch`, whose predicate requires the caller to be
 * an `app_users` row OF THAT TENANT. A superadmin's row has `tenant_id IS
 * NULL`, so both the SELECT and the INSERT policy refuse them. Every sibling
 * inventory table (`inventory_stock`, `inventory_counts`, `stock_transfers`)
 * got a separate `*_manage_superadmin` policy in the same series;
 * `stock_movements` was the one left out.
 *
 * This test replays every migration's policy DDL for the ledger in filename
 * order and asserts that whatever survives grants superadmins both verbs. It
 * is written against the migration text, so a future migration that drops the
 * superadmin arm again fails here rather than in a merchant's shop.
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
const TABLE = 'stock_movements'

interface Policy {
  name: string
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'
  body: string
}

const CREATE_POLICY =
  /CREATE POLICY\s+("?[\w\s-]+"?)\s+ON\s+(?:public\.)?stock_movements\b\s*(?:FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL))?([\s\S]*?);/gi
const DROP_POLICY = /DROP POLICY(?: IF EXISTS)?\s+("?[\w\s-]+"?)\s+ON\s+(?:public\.)?stock_movements\b/gi

function stripComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, '')
}

/** The ledger's policies as they stand after every migration has run. */
function survivingPolicies(): Policy[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  return files.reduce<Policy[]>((policies, file) => {
    const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    const afterDrops = [...sql.matchAll(DROP_POLICY)].reduce(
      (current, match) => current.filter((p) => p.name !== match[1].replace(/"/g, '')),
      policies,
    )
    const created = [...sql.matchAll(CREATE_POLICY)].map<Policy>((match) => ({
      name: match[1].replace(/"/g, ''),
      command: (match[2]?.toUpperCase() as Policy['command']) ?? 'ALL',
      body: match[3],
    }))
    return [...afterDrops, ...created]
  }, [])
}

function grantsSuperadmin(policy: Policy): boolean {
  return /role\s*=\s*'superadmin'/.test(policy.body)
}

function covers(policy: Policy, verb: 'SELECT' | 'INSERT'): boolean {
  return policy.command === verb || policy.command === 'ALL'
}

describe(`${TABLE} RLS after all migrations`, () => {
  const policies = survivingPolicies()

  it('still has a branch-scoped policy for tenant admins (unchanged)', () => {
    expect(policies.some((p) => /app_user_may_reach_branch/.test(p.body))).toBe(true)
  })

  it('lets a platform superadmin read the ledger', () => {
    expect(policies.filter((p) => covers(p, 'SELECT')).some(grantsSuperadmin)).toBe(true)
  })

  it('lets a platform superadmin write a movement', () => {
    expect(policies.filter((p) => covers(p, 'INSERT')).some(grantsSuperadmin)).toBe(true)
  })

  it('keeps the ledger append-only — nothing grants UPDATE or DELETE', () => {
    const mutating = policies.filter((p) => ['UPDATE', 'DELETE', 'ALL'].includes(p.command))
    expect(mutating).toEqual([])
  })
})
