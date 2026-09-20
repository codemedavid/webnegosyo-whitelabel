/**
 * The activity log's guarantees, asserted against the migration corpus the
 * way branch-scoped-order-children.test.ts does: the corpus is what the
 * database allows, and replaying it catches a later migration quietly
 * widening what this one narrowed.
 *
 * Two things must hold forever: only the platform writes (no INSERT policy
 * for authenticated), and nothing rewrites (append-only trigger).
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations')
const TABLE = 'order_status_events'

const CREATE_POLICY =
  /CREATE\s+POLICY\s+(?:"([^"]+)"|([a-z0-9_]+))\s+ON\s+(?:public\.)?TABLE\b([\s\S]*?);/gi
const DROP_POLICY =
  /DROP\s+POLICY\s+IF\s+EXISTS\s+(?:"([^"]+)"|([a-z0-9_]+))\s+ON\s+(?:public\.)?TABLE\b/gi

function forTable(pattern: RegExp): RegExp {
  return new RegExp(pattern.source.replace('TABLE', TABLE), pattern.flags)
}

function corpus(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
}

function survivingPolicies(): Map<string, string> {
  const surviving = new Map<string, string>()
  for (const sql of corpus()) {
    for (const match of sql.matchAll(forTable(DROP_POLICY))) surviving.delete(match[1] ?? match[2])
    for (const match of sql.matchAll(forTable(CREATE_POLICY))) surviving.set(match[1] ?? match[2], match[3])
  }
  return surviving
}

describe('order_status_events migration', () => {
  const policies = survivingPolicies()

  test('exists and is append-only for every role, service role included', () => {
    const all = corpus().join('\n')
    expect(all).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${TABLE}`))
    expect(all).toMatch(/trg_order_status_event_append_only[\s\S]*BEFORE UPDATE OR DELETE ON order_status_events/)
  })

  test('grants authenticated users reads only — every writer is a verified platform route', () => {
    expect(policies.size).toBeGreaterThan(0)
    for (const [name, body] of policies) {
      expect({ name, forSelect: /FOR\s+SELECT/i.test(body) }).toEqual({ name, forSelect: true })
    }
  })

  test('the branch read honours the shared branch predicate and lets an actor read their own acts', () => {
    const body = policies.get('order_status_events_read_branch')
    expect(body).toBeDefined()
    expect(body).toMatch(/app_user_may_reach_branch\(tenant_id,\s*outlet_id\)/)
    expect(body).toMatch(/actor_user_id\s*=\s*auth\.uid\(\)/)
  })
})
