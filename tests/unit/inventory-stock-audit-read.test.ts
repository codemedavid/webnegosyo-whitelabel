import { getInventoryAuditLog } from '@/lib/inventory/stock-audit-read'

const calls: Array<[string, unknown[]]> = []
let auditResult: { data: unknown; error: unknown } = { data: [], error: null }
let staffRows: unknown[] = []

function builder(table: string) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'ilike', 'or', 'order', 'limit']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([`${table}.${method}`, args])
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve(table === 'app_users' ? { data: staffRows, error: null } : auditResult)
  return chain
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('the audit log must be read through RLS, never the service role')
  },
}))

beforeEach(() => {
  calls.length = 0
  auditResult = { data: [], error: null }
  staffRows = []
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('getInventoryAuditLog', () => {
  test('scopes the read to the tenant, newest first', async () => {
    await getInventoryAuditLog('t1', { orderQuery: null, problemsOnly: false })

    expect(calls).toContainEqual(['inventory_audit_log.eq', ['tenant_id', 't1']])
    expect(calls).toContainEqual(['inventory_audit_log.order', ['created_at', { ascending: false }]])
    expect(calls.some(([name]) => name === 'inventory_audit_log.ilike')).toBe(false)
  })

  test('applies the order search and the problems view', async () => {
    await getInventoryAuditLog('t1', { orderQuery: 'def456', problemsOnly: true })

    expect(calls).toContainEqual(['inventory_audit_log.ilike', ['order_id', '%def456%']])
    expect(calls).toContainEqual([
      'inventory_audit_log.or',
      ['outcome.in.(duplicate,failed),is_suspected_duplicate.eq.true'],
    ])
  })

  test('names the person from the roster, falling back to email', async () => {
    auditResult = {
      data: [
        {
          id: 1, created_at: '2026-09-26T01:00:00Z', event: 'order_sale', outcome: 'applied', source: 'pos',
          order_id: 'o1', revision: 0, outlet_id: null, actor_user_id: 'u1', movement_count: 1,
          lines: [{ inventoryItemId: 'rice', name: 'Rice', quantityDelta: -2, enteredQuantity: 2, enteredUnitId: 'g' }],
          is_suspected_duplicate: false, detail: null,
        },
        {
          id: 2, created_at: '2026-09-26T01:01:00Z', event: 'order_sale', outcome: 'duplicate', source: 'pos',
          order_id: 'o1', revision: 0, outlet_id: null, actor_user_id: 'u2', movement_count: 0,
          lines: 'not-an-array', is_suspected_duplicate: false, detail: null,
        },
      ],
      error: null,
    }
    staffRows = [
      { user_id: 'u1', display_name: 'Maria', email: 'maria@example.com' },
      { user_id: 'u2', display_name: '  ', email: 'jun@example.com' },
    ]

    const { entries, loadFailed } = await getInventoryAuditLog('t1', { orderQuery: null, problemsOnly: false })

    expect(loadFailed).toBe(false)
    expect(entries[0]).toMatchObject({ actorName: 'Maria', outcome: 'applied', lines: [expect.any(Object)] })
    expect(entries[1]).toMatchObject({ actorName: 'jun@example.com', lines: [] })
  })

  test('an unreadable log says so instead of rendering as an empty day', async () => {
    auditResult = { data: null, error: { message: 'permission denied' } }
    await expect(getInventoryAuditLog('t1', { orderQuery: null, problemsOnly: false })).resolves.toEqual({
      entries: [],
      loadFailed: true,
    })
  })
})
