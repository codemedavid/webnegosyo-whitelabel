/**
 * Direct refunds are serialized (follow-up to 20261012170300 / 180200),
 * asserted against the migration corpus: the LATEST definition of each
 * function must hold the locks, so a later migration cannot quietly undo it.
 *
 * - create_and_execute_approval quotes a direct refund only after locking the
 *   order row and the requester, so two direct asks (refund + cancel_paid, or
 *   two balance refunds) cannot both pass a cumulative limit read at once.
 * - order_refund_insert_check answers a signed-in caller only for an order at
 *   a branch they reach, and serializes the register's own refund rows per
 *   person the same way.
 * - Append-only ledgers cannot be TRUNCATEd by the service role (row triggers
 *   do not fire on TRUNCATE). The approvals tables already revoke all from it.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

function corpus(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((file) => stripComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')))
    .join('\n')
}

/** Body of the last CREATE [OR REPLACE] FUNCTION public.<name>. */
function latestBody(name: string): string {
  const sql = corpus()
  const create = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, 'gi')
  const starts = [...sql.matchAll(create)].map((m) => m.index ?? 0)
  expect(starts.length).toBeGreaterThan(0)
  const rest = sql.slice(starts[starts.length - 1])
  const open = rest.match(/\bas\s+(\$[a-z_0-9]*\$)/i)
  if (!open || open.index === undefined) throw new Error(`no body for ${name}`)
  const from = open.index + open[0].length
  return rest.slice(from, rest.indexOf(open[1], from))
}

describe('direct refunds are serialized', () => {
  it('create_and_execute_approval locks the order and the requester before it quotes', () => {
    const body = latestBody('create_and_execute_approval')
    const orderLock = body.search(/from\s+public\.orders[\s\S]*?for\s+update/i)
    const personLock = body.search(/pg_advisory_xact_lock\s*\(/i)
    const quote = body.search(/public\.create_approval_request\s*\(/i)

    expect(orderLock).toBeGreaterThanOrEqual(0)
    expect(personLock).toBeGreaterThanOrEqual(0)
    expect(quote).toBeGreaterThan(orderLock)
    expect(quote).toBeGreaterThan(personLock)
    expect(body).toMatch(/p_kind\s+in\s*\(\s*'refund'\s*,\s*'cancel_paid'\s*\)/i)
  })

  it('both writers take the SAME per-person lock key', () => {
    const key = /pg_advisory_xact_lock\s*\(\s*public\.approval_direct_lock_key\s*\(/i
    expect(latestBody('create_and_execute_approval')).toMatch(key)
    expect(latestBody('order_refund_insert_check')).toMatch(key)
  })

  it('order_refund_insert_check answers a signed-in caller only for an order at a branch they reach', () => {
    const body = latestBody('order_refund_insert_check')
    // The same rule as the order_payments INSERT policy, and a REFUSAL (not a
    // silent return): for an order with no branch the policy checks the
    // writer-sent outlet, so returning would let the row skip every check.
    expect(body).toMatch(/public\.app_user_may_see_order\s*\(\s*v_tenant\s*,\s*v_outlet\s*\)/i)
    expect(body).toMatch(/app_user_has_permission\s*\(\s*v_tenant\s*,\s*'order_refund'\s*\)/i)
    const guard = body.slice(0, body.search(/pg_advisory_xact_lock/i))
    expect(guard).toMatch(/raise\s+exception[^;]*errcode\s*=\s*'42501'/i)
    expect(guard).not.toMatch(/\breturn\s*;/i)
  })

  it('the service role cannot TRUNCATE the append-only ledgers', () => {
    const sql = corpus()
    for (const table of ['store_activity', 'order_payments', 'order_revisions']) {
      expect(sql).toMatch(
        new RegExp(`revoke\\s+[^;]*truncate[^;]*\\son\\s+[^;]*public\\.${table}\\b[^;]*from\\s+[^;]*service_role`, 'i')
      )
    }
  })
})
