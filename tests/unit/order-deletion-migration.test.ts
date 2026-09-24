/**
 * The database half of order deletion, asserted against the migration corpus
 * (same approach as order-status-events-migration.test.ts): replaying every
 * migration catches a later one quietly re-opening what this one closed.
 *
 * Two guarantees:
 *   1. No signed-in client can DELETE an order, a payment or a revision
 *      directly. Before this migration `orders_write_admin` was `FOR ALL`, so
 *      any cashier's token could erase the store's history through PostgREST.
 *   2. The deletion tables and functions are server-only: RLS on with no
 *      policies, and the functions executable by the service role alone.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20260924120000_order_deletion.sql'

function corpus(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
}

/** Policy name → its definition, for policies still standing after every migration. */
function survivingPolicies(table: string): Map<string, string> {
  const create = new RegExp(
    `CREATE\\s+POLICY\\s+(?:"([^"]+)"|([a-z0-9_]+))\\s+ON\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`,
    'gi'
  )
  const drop = new RegExp(
    `DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?(?:"([^"]+)"|([a-z0-9_]+))\\s+ON\\s+(?:public\\.)?${table}\\b`,
    'gi'
  )
  const surviving = new Map<string, string>()
  for (const sql of corpus()) {
    // Within one file, drops and creates interleave in source order.
    const events = [
      ...[...sql.matchAll(drop)].map((m) => ({ at: m.index ?? 0, kind: 'drop' as const, m })),
      ...[...sql.matchAll(create)].map((m) => ({ at: m.index ?? 0, kind: 'create' as const, m })),
    ].sort((a, b) => a.at - b.at)
    for (const { kind, m } of events) {
      const name = m[1] ?? m[2]
      if (kind === 'drop') surviving.delete(name)
      else surviving.set(name, m[3])
    }
  }
  return surviving
}

function allowsDelete(definition: string): boolean {
  const forClause = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(definition)
  // A policy with no FOR clause is FOR ALL.
  const command = forClause ? forClause[1].toUpperCase() : 'ALL'
  return command === 'ALL' || command === 'DELETE'
}

describe('order deletion migration', () => {
  const migration = readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8')

  test.each(['orders', 'order_payments', 'order_revisions'])(
    'no surviving policy lets a client delete from %s',
    (table) => {
      const deleting = [...survivingPolicies(table)]
        .filter(([, definition]) => allowsDelete(definition))
        .map(([name]) => name)
      expect(deleting).toEqual([])
    }
  )

  test.each(['orders', 'order_payments', 'order_revisions'])(
    'revokes the DELETE grant on %s from client roles',
    (table) => {
      expect(migration).toMatch(
        new RegExp(`revoke\\s+delete\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, 'i')
      )
    }
  )

  test('keeps order_items deletable by staff, which order editing needs', () => {
    expect(migration).not.toMatch(/revoke\s+delete\s+on\s+(?:table\s+)?public\.order_items/i)
  })

  test.each(['order_deletions', 'order_deletion_archive', 'order_deletion_audit'])(
    '%s is RLS-locked with no client policy',
    (table) => {
      expect(migration).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
      expect(migration).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'))
      expect(survivingPolicies(table).size).toBe(0)
    }
  )

  test.each([
    'execute_order_deletion(uuid, uuid)',
    'restore_order_deletion(uuid, uuid)',
    'purge_order_deletions()',
  ])('%s runs for the service role only', (signature) => {
    const escaped = signature.replace(/[()]/g, '\\$&').replace(/\s+/g, '\\s*')
    expect(migration).toMatch(
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${escaped}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i')
    )
    expect(migration).toMatch(
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped}\\s+to\\s+service_role`, 'i')
    )
  })

  test('every deletion function re-checks that the actor owns the store', () => {
    const bodies = migration.split(/create\s+or\s+replace\s+function/i).slice(1)
    const guarded = bodies.filter((body) => /^\s*public\.(execute|restore)_order_deletion/i.test(body))
    expect(guarded).toHaveLength(2)
    for (const body of guarded) {
      expect(body).toMatch(/is_owner/)
      expect(body).toMatch(/tenant_id\s*=\s*v_deletion\.tenant_id/)
    }
  })

  test('the audit trail is append-only', () => {
    expect(migration).toMatch(/before\s+update\s+or\s+delete\s+on\s+public\.order_deletion_audit/i)
  })
})

describe('order deletion purge schedule', () => {
  const cron = readFileSync(join(MIGRATIONS_DIR, '20260924130000_order_deletion_purge_cron.sql'), 'utf8')

  test('runs the purge from pg_cron inside the database, hourly', () => {
    expect(cron).toMatch(/create\s+extension\s+if\s+not\s+exists\s+pg_cron/i)
    expect(cron).toMatch(
      /cron\.schedule\(\s*'order-deletion-purge'\s*,\s*'0 \* \* \* \*'\s*,\s*\$\$\s*select\s+public\.purge_order_deletions\(\)\s*\$\$\s*\)/i
    )
  })

  test('is idempotent: re-running replaces the job instead of adding a second one', () => {
    expect(cron).toMatch(/cron\.unschedule\(\s*jobid\s*\)\s+from\s+cron\.job\s+where\s+jobname\s*=\s*'order-deletion-purge'/i)
  })
})
