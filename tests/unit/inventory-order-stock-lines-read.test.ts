/**
 * @jest-environment node
 *
 * The server's read of an order's lines, history and dish options.
 */
const tables: Record<string, { data: unknown; error?: unknown }> = {}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain
      const answer = () => Promise.resolve({ error: null, ...tables[table] })
      chain.maybeSingle = answer
      chain.then = (resolve: (value: unknown) => unknown) => answer().then(resolve)
      return chain
    },
  }),
}))

const convexQuery = jest.fn()
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: () => ({ query: convexQuery }) }))
jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: async () => ({ convex_deploy_key: 'k' }) }))

import { readOrderLineEvidence } from '@/lib/inventory/order-stock-lines-read'

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key]
  convexQuery.mockReset()
})

describe('readOrderLineEvidence — platform', () => {
  test('totals the current lines, every edit, the snapshot ids and the dish options', async () => {
    tables.orders = { data: { revision_number: 1, customer_data: { _inventory_selections: { version: 1, items: [{ menuItemId: 'latte', quantity: 2, optionIds: ['old'], addonIds: [] }] } } } }
    tables.order_items = { data: [{ menu_item_id: 'latte', quantity: 1 }, { menu_item_id: 'latte', quantity: 1 }, { menu_item_id: null, quantity: 3 }] }
    tables.order_revisions = { data: [{ revision_number: 1, items_before: [{ menuItemId: 'bun', quantity: 2 }], items_after: [{ menuItemId: 'latte', quantity: 2 }] }] }
    tables.menu_items = { data: [{ id: 'latte', modifier_groups: [{ options: [{ id: 'large' }] }], variation_types: [{ options: [{ id: 'hot' }] }], variations: [{ id: 'small' }], addons: [{ id: 'shot' }] }] }

    const read = await readOrderLineEvidence('platform', 't1', 'o1', ['latte'])

    expect(read.kind).toBe('evidence')
    if (read.kind !== 'evidence') return
    const { evidence } = read
    expect([...evidence.current]).toEqual([['latte', 2]])
    expect(evidence.revisionNumber).toBe(1)
    expect([...evidence.revisions.get(1)!.before]).toEqual([['bun', 2]])
    expect([...evidence.menuOptionIds.get('latte')!].sort()).toEqual(['hot', 'large', 'shot', 'small'])
    expect([...evidence.selectionIds.get('latte')!]).toEqual(['old'])
    expect(evidence.hasRevisionHistory).toBe(true)
  })

  test('asks for a retry while the order has no lines yet', async () => {
    tables.orders = { data: { revision_number: 0, customer_data: null } }
    tables.order_items = { data: [] }
    tables.order_revisions = { data: [] }
    tables.menu_items = { data: [] }
    expect((await readOrderLineEvidence('platform', 't1', 'o1', ['latte'])).kind).toBe('unreadable')
  })

  test('throws when the database refuses, so the route can ask for a retry', async () => {
    tables.orders = { data: null, error: new Error('boom') }
    tables.order_items = { data: [] }
    tables.order_revisions = { data: [] }
    tables.menu_items = { data: [] }
    await expect(readOrderLineEvidence('platform', 't1', 'o1', [])).rejects.toThrow('boom')
  })
})

describe('readOrderLineEvidence — other backends', () => {
  test('a Convex order gives its lines and edit counter but no edit history', async () => {
    tables.tenants = { data: { convex_deployment_url: 'https://x.convex.cloud' } }
    tables.menu_items = { data: [] }
    convexQuery.mockResolvedValueOnce({ revisionNumber: 2, items: [{ menuItemId: 'latte', quantity: 3 }] })
    const read = await readOrderLineEvidence('convex', 't1', 'j1', ['latte'])
    expect(read.kind === 'evidence' && read.evidence.hasRevisionHistory).toBe(false)
    expect(read.kind === 'evidence' && read.evidence.revisionNumber).toBe(2)
    expect(read.kind === 'evidence' && [...read.evidence.current]).toEqual([['latte', 3]])
  })

  test('a Convex store with no deployment cannot be checked', async () => {
    tables.tenants = { data: { convex_deployment_url: null } }
    expect((await readOrderLineEvidence('convex', 't1', 'j1', [])).kind).toBe('unverifiable')
  })
})
