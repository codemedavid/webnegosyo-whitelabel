/**
 * Phase 0 of Store Activity & Approvals: the security floor, asserted against
 * the migration corpus (same approach as order-deletion-migration.test.ts and
 * order-status-events-migration.test.ts). Replaying every migration catches a
 * later one quietly re-opening what this one closed. The live database is
 * probed separately (supabase/probes/20261012140000_security_floor_probe.sql).
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import { IMPLIED_BY, OPT_IN_PERMISSION_KEYS } from '@/lib/staff-permissions'

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20261012140000_security_floor_activity.sql'

function corpus(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
}

/** Executable SQL only, so a comment quoting a statement never counts as running it. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Policy name → definition, for policies still standing after every migration. */
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
  for (const raw of corpus()) {
    const sql = stripComments(raw)
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

function commandOf(definition: string): string {
  const forClause = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(definition)
  return forClause ? forClause[1].toUpperCase() : 'ALL'
}

/** The full CREATE FUNCTION statement for `name` in this migration, body included. */
function functionStatement(sql: string, name: string): string {
  const start = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i').exec(sql)
  if (!start) return ''
  const rest = sql.slice(start.index)
  const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(rest)
  if (!tag) return ''
  const bodyEnd = rest.indexOf(tag[1], tag.index + tag[0].length)
  return rest.slice(0, rest.indexOf(';', bodyEnd) + 1)
}

describe('security floor migration (store activity phase 0)', () => {
  const raw = readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8')
  const sql = stripComments(raw)

  describe('order_payments and order_revisions are append-only', () => {
    test.each(['order_payments', 'order_revisions'])('no surviving policy lets a client UPDATE %s', (table) => {
      const updating = [...survivingPolicies(table)]
        .filter(([, definition]) => ['ALL', 'UPDATE'].includes(commandOf(definition)))
        .map(([name]) => name)
      expect(updating).toEqual([])
    })

    test.each(['order_payments', 'order_revisions'])('drops the old %s update policies by name', (table) => {
      const singular = table === 'order_payments' ? 'order_payments' : 'order_revisions'
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${singular}_update_admin\\s+on\\s+public\\.${table}`, 'i'))
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+platform_staff_update\\s+on\\s+public\\.${table}`, 'i'))
    })

    test.each(['order_payments', 'order_revisions'])('revokes UPDATE and TRUNCATE on %s from client roles', (table) => {
      expect(sql).toMatch(
        new RegExp(`revoke\\s+update\\s*,\\s*truncate\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, 'i')
      )
    })

    test.each(['order_payments', 'order_revisions'])('%s has a BEFORE UPDATE OR DELETE guard for every role', (table) => {
      expect(sql).toMatch(
        new RegExp(`create\\s+trigger\\s+${table}_append_only\\s+before\\s+update\\s+or\\s+delete\\s+on\\s+public\\.${table}\\s+for\\s+each\\s+row\\s+execute\\s+function\\s+public\\.order_ledger_append_only\\(\\)`, 'i')
      )
    })

    test('the guard lets only the cascades through: the order/store deleted, or a branch deleted', () => {
      const body = functionStatement(sql, 'order_ledger_append_only')
      expect(body).toMatch(/from\s+public\.orders\s+o\s+where\s+o\.id\s*=\s*old\.order_id/i)
      expect(body).toMatch(/from\s+public\.tenants\s+t\s+where\s+t\.id\s*=\s*old\.tenant_id/i)
      // The outlet ON DELETE SET NULL cascade is an UPDATE of outlet_id alone.
      expect(body).toMatch(/to_jsonb\(new\)\s*-\s*'outlet_id'\s*=\s*to_jsonb\(old\)\s*-\s*'outlet_id'/i)
      expect(body).toMatch(/from\s+public\.outlets\s+b\s+where\s+b\.id\s*=\s*old\.outlet_id/i)
      expect(body).toMatch(/raise\s+exception/i)
    })
  })

  describe('client-asserted actor and time are overwritten by the database', () => {
    test.each([
      ['order_payments', 'recorded_by'],
      ['order_revisions', 'revised_by'],
      ['stock_movements', 'created_by'],
    ])('%s.%s and created_at are stamped on a client insert', (table, column) => {
      expect(sql).toMatch(
        new RegExp(
          `create\\s+trigger\\s+${table}_stamp_actor\\s+before\\s+insert\\s+on\\s+public\\.${table}\\s+for\\s+each\\s+row\\s+execute\\s+function\\s+public\\.stamp_client_actor\\('${column}'\\)`,
          'i'
        )
      )
    })

    test('stamps only for client roles, so the service role and definer functions keep what they sent', () => {
      const body = functionStatement(sql, 'stamp_client_actor')
      expect(body).toMatch(/current_user\s+in\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)/i)
      expect(body).toMatch(/auth\.uid\(\)/)
      expect(body).toMatch(/'created_at'\s*,\s*now\(\)/i)
      // Must run as the caller: a SECURITY DEFINER trigger would always see its owner.
      expect(body).not.toMatch(/security\s+definer/i)
    })
  })

  describe('app_user_has_permission mirrors hasPermission', () => {
    // Later migrations (staff_permission_keys) redefine the helper, so check the
    // definition that survives the whole corpus, not only this file's.
    const helper =
      corpus()
        .map((file) => functionStatement(stripComments(file), 'app_user_has_permission'))
        .filter((statement) => statement !== '')
        .at(-1) ?? ''

    test('keeps the live signature (renaming a parameter needs a DROP the gov-discount policies block)', () => {
      expect(helper).toMatch(/app_user_has_permission\s*\(\s*p_tenant_id\s+uuid\s*,\s*p_permission\s+text\s*\)/i)
    })

    test('is a stable definer function with an empty search_path', () => {
      expect(helper).toMatch(/\bstable\b/i)
      expect(helper).toMatch(/security\s+definer/i)
      expect(helper).toMatch(/set\s+search_path\s*=\s*''/i)
    })

    test('is executable by signed-in callers only', () => {
      expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.app_user_has_permission\(uuid,\s*text\)\s+from\s+public\s*,\s*anon/i)
      expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.app_user_has_permission\(uuid,\s*text\)\s+to\s+authenticated/i)
    })

    test('treats exactly the TS opt-in keys as not granted by full access', () => {
      const optIn = /permissions\s+is\s+null\s+and\s+p_permission\s*<>\s*all\s*\(\s*array\[([^\]]*)\]/i.exec(helper)
      expect(optIn).not.toBeNull()
      const keys = [...(optIn?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      expect(keys).toEqual([...OPT_IN_PERMISSION_KEYS])
    })

    test('honours the same containment as IMPLIED_BY', () => {
      const parents = [...new Set(Object.values(IMPLIED_BY))]
      for (const parent of parents) {
        const expected = Object.entries(IMPLIED_BY)
          .filter(([, held]) => held === parent)
          .map(([key]) => key)
          .sort()
        // Either `p_permission in ('a', 'b') and 'parent' = any(...)` or `p_permission = 'a' and ...`.
        const implied = new RegExp(
          `p_permission\\s*(?:in\\s*\\(([^)]*)\\)|=\\s*('[a-z_]+'))\\s+and\\s+'${parent}'\\s*=\\s*any\\s*\\(au\\.permissions\\)`,
          'i',
        ).exec(helper)
        expect(implied).not.toBeNull()
        const list = implied?.[1] ?? implied?.[2] ?? ''
        const keys = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
        expect(keys).toEqual(expected)
      }
    })

    test('keeps owners and superadmins unconditional', () => {
      expect(helper).toMatch(/au\.role\s*=\s*'superadmin'/i)
      expect(helper).toMatch(/au\.is_owner\s+is\s+true/i)
    })
  })

  describe('refunds need order_refund', () => {
    test('the admin insert policy refuses a refund row without the grant', () => {
      const body = survivingPolicies('order_payments').get('order_payments_insert_admin')
      expect(body).toBeDefined()
      expect(commandOf(body ?? '')).toBe('INSERT')
      expect(body).toMatch(/kind\s*<>\s*'refund'\s+or\s+public\.app_user_has_permission\(tenant_id,\s*'order_refund'\)/i)
    })
  })

  describe('order status moves that undo the past', () => {
    test('a guard fires on every status update of orders', () => {
      expect(sql).toMatch(
        /create\s+trigger\s+orders_client_status_guard\s+before\s+update\s+of\s+status\s+on\s+public\.orders\s+for\s+each\s+row\s+execute\s+function\s+public\.orders_client_status_guard\(\)/i
      )
    })

    test('the never-applied cancel-only draft is removed, not left beside it', () => {
      expect(sql).toMatch(/drop\s+trigger\s+if\s+exists\s+orders_client_cancel_guard\s+on\s+public\.orders/i)
      expect(sql).toMatch(/drop\s+function\s+if\s+exists\s+public\.orders_client_cancel_guard\(\)/i)
      expect(functionStatement(sql, 'orders_client_cancel_guard')).toBe('')
    })

    const body = (): string => functionStatement(sql, 'orders_client_status_guard')

    test('runs for client roles only, as the caller', () => {
      expect(body()).toMatch(/current_user\s+not\s+in\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)/i)
      expect(body()).not.toMatch(/security\s+definer/i)
    })

    test('never cancels a delivered order from a client', () => {
      expect(body()).toMatch(/old\.status\s*=\s*'delivered'\s+and\s+new\.status\s*=\s*'cancelled'/i)
    })

    test('moving an order OUT of delivered needs order_edit, so cancel cannot be reached by cycling', () => {
      expect(body()).toMatch(
        /if\s+old\.status\s*=\s*'delivered'\s+then\s+if\s+not\s+public\.app_user_has_permission\(new\.tenant_id,\s*'order_edit'\)/i
      )
    })

    test('cancelling and reopening a cancelled order need orders', () => {
      expect(body()).toMatch(
        /\(old\.status\s*=\s*'cancelled'\s+or\s+new\.status\s*=\s*'cancelled'\)\s+and\s+not\s+public\.app_user_has_permission\(new\.tenant_id,\s*'orders'\)/i
      )
    })

    test('documents the audited client flows in the migration header of 4b', () => {
      expect(raw).toMatch(/order-status-management\.tsx/)
      expect(raw).toMatch(/Residual, by design/)
    })
  })

  describe('vouchers', () => {
    test('no surviving catch-all policy lets any member write vouchers', () => {
      const policies = survivingPolicies('vouchers')
      expect(policies.has('vouchers_tenant_access')).toBe(false)
      for (const [name, body] of policies) {
        if (commandOf(body) === 'SELECT') continue
        expect({ name, gated: /app_user_has_permission\(tenant_id,\s*'vouchers'\)/i.test(body) }).toEqual({ name, gated: true })
      }
      expect([...policies.values()].some((body) => commandOf(body) === 'SELECT')).toBe(true)
    })

    test('voucher targets ride the same grant', () => {
      const policies = survivingPolicies('voucher_targets')
      expect(policies.has('voucher_targets_tenant_access')).toBe(false)
      for (const [name, body] of policies) {
        if (commandOf(body) === 'SELECT') continue
        expect({ name, gated: /app_user_has_permission\(v\.tenant_id,\s*'vouchers'\)/i.test(body) }).toEqual({ name, gated: true })
      }
    })

    test('redemptions are read-only to clients — only redeem_voucher() writes them', () => {
      const policies = survivingPolicies('voucher_redemptions')
      expect(policies.size).toBeGreaterThan(0)
      for (const [name, body] of policies) {
        expect({ name, command: commandOf(body) }).toEqual({ name, command: 'SELECT' })
      }
      expect(sql).toMatch(
        /revoke\s+insert\s*,\s*update\s*,\s*delete\s*,\s*truncate\s+on\s+(?:table\s+)?public\.voucher_redemptions\s+from\s+anon\s*,\s*authenticated/i
      )
      for (const verb of ['insert', 'update', 'delete']) {
        expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+platform_staff_${verb}\\s+on\\s+public\\.voucher_redemptions`, 'i'))
      }
    })
  })

  describe('stock movements', () => {
    test('a client insert needs the menu grant on top of branch reach', () => {
      const body = survivingPolicies('stock_movements').get('stock_movements_insert_branch')
      expect(body).toBeDefined()
      expect(body).toMatch(/app_user_may_reach_branch\(tenant_id,\s*outlet_id\)/i)
      expect(body).toMatch(/app_user_has_permission\(tenant_id,\s*'menu'\)/i)
    })
  })

  test('every function in the migration pins its search_path', () => {
    const names = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(/gi)].map((m) => m[1])
    expect(names.length).toBeGreaterThanOrEqual(4)
    for (const name of names) {
      expect({ name, pinned: /set\s+search_path/i.test(functionStatement(sql, name)) }).toEqual({ name, pinned: true })
    }
  })

  test('trigger functions are not callable through the API', () => {
    for (const fn of ['order_ledger_append_only()', 'stamp_client_actor()', 'orders_client_status_guard()']) {
      const escaped = fn.replace(/[()]/g, '\\$&')
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${escaped}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'))
    }
  })
})
