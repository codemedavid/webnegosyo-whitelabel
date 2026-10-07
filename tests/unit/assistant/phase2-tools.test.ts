/** @jest-environment node */
import { createRefBook } from '@/lib/assistant/refs'
import type { BasketSummary } from '@/lib/boost/order-baskets'
import type { CustomerHubOverview } from '@/lib/customer-hub-overview'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/dashboard/load-admin-dashboard', () => ({ readTenantSales: jest.fn() }))
jest.mock('@/lib/boost/order-baskets', () => ({ getBasketSummary: jest.fn() }))
jest.mock('@/lib/boost/workspace', () => ({ getBoostWorkspace: jest.fn() }))
jest.mock('@/lib/customers/load-hub-overview', () => ({ loadCustomerHubOverview: jest.fn() }))

const MENU = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Sisig', price: 180, isAvailable: true, categoryId: null, categoryName: null, createdAt: null },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Iced Tea', price: 60, isAvailable: true, categoryId: null, categoryName: null, createdAt: null },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'Rice', price: 25, isAvailable: true, categoryId: null, categoryName: null, createdAt: null },
]

function basket(): BasketSummary {
  const pair = (a: number, b: number, share: number) => ({
    anchorId: MENU[a].id, partnerId: MENU[b].id, together: 12, share, reverseShare: share, support: 0.1, lift: 2.4, strength: share > 0.6 ? ('always' as const) : ('often' as const),
  })
  return { dataSource: 'platform', isAvailable: true, note: null, windowLabel: 'last 90 days', orderCount: 120, itemOrders: {}, pairs: [pair(0, 1, 0.7), pair(2, 1, 0.4)] }
}

describe('get_item_pairs', () => {
  test('names pairs with refs, never ids, and can focus on one dish', async () => {
    const { buildItemPairsResult } = await import('@/lib/assistant/tools/reads/item-pairs')
    const refs = createRefBook({})
    const focus = MENU[2].id

    const all = buildItemPairsResult(basket(), MENU, null, refs)
    const focused = buildItemPairsResult(basket(), MENU, focus, refs)

    expect(JSON.stringify(all.facts)).not.toMatch(/aaaaaaaa/)
    expect((all.facts.pairs as unknown[]).length).toBe(2)
    expect((focused.facts.pairs as Array<{ a: { name: string } }>).map((p) => p.a.name)).toEqual(['Rice'])
    expect(all.chips?.[0].prompt).toBe('Make a combo of Sisig and Iced Tea.')
  })

  test('an unreadable history is reported, not shown as "no pairs"', async () => {
    const { buildItemPairsResult } = await import('@/lib/assistant/tools/reads/item-pairs')

    const result = buildItemPairsResult({ ...basket(), isAvailable: false, note: 'Convex unreachable' }, MENU, null, createRefBook({}))

    expect(result.facts).toEqual({ available: false, reason: 'Convex unreachable' })
  })
})

describe('get_customers', () => {
  const overview = {
    windows: [],
    topItems: [],
    coverage: { complete: true },
    dashboard: {
      slipping: 4,
      lapsed: 2,
      lifetimeValue: { regular: 2400, oneTime: 300 },
      tillComplete: true,
      windows: [{
        days: 30,
        revenue: { total: 10000, returning: 6000, new: 3000, unknown: 1000 },
        previousRevenue: 8000, orders: 50, previousOrders: 40, knownOrders: 40,
        customers: 30, previousCustomers: 25, returningCustomers: 12, newCustomers: 18,
        repeatRate: 0.4, previousRepeatRate: 0.35, oneTimers: 10, favourites: { returning: [], new: [] },
        topCustomers: [
          { key: 'k1', customerId: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Maria Clara Santos', phoneTail: '4321', visits: 6, spend: 2100, lastVisitAt: '2026-10-01T10:00:00Z' },
          { key: 'k2', customerId: null, name: null, phoneTail: '9876', visits: 3, spend: 900, lastVisitAt: '2026-09-28T10:00:00Z' },
        ],
      }],
    },
  } as unknown as CustomerHubOverview

  test('the model sees masked names and no phone digits; the owner’s card keeps the saved name', async () => {
    const { buildCustomersResult } = await import('@/lib/assistant/tools/reads/customers')

    const result = buildCustomersResult(overview, 'best', 30, createRefBook({}))
    const facts = JSON.stringify(result.facts)

    expect(facts).toContain('Maria S.')
    expect(facts).not.toContain('Santos')
    expect(facts).not.toMatch(/4321|9876|bbbbbbbb/)
    expect(result.card?.type === 'ranked' && result.card.rows[0].label).toBe('Maria Clara Santos')
  })

  test('the overview gives rates as percentages and the slipping count', async () => {
    const { buildCustomersResult } = await import('@/lib/assistant/tools/reads/customers')

    const result = buildCustomersResult(overview, 'overview', 30, createRefBook({}))

    expect(result.facts).toMatchObject({ repeatRatePct: 40, previousRepeatRatePct: 35, slippingRegulars: 4, newCustomers: 18 })
  })
})

describe('tool access', () => {
  test('staff activity is owner-only and inventory needs the store feature', async () => {
    const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
    const { availableTools } = await import('@/lib/assistant/tools/registry')
    const flags = { inventoryEnabled: false, customerHubOn: true, menuEngineeringEnabled: true }

    const manager = availableTools(ASSISTANT_TOOLS, { role: 'admin', is_owner: false, permissions: ['analytics', 'menu', 'customers'] }, flags).map((t) => t.name)
    const owner = availableTools(ASSISTANT_TOOLS, { role: 'admin', is_owner: true, permissions: null }, { ...flags, inventoryEnabled: true }).map((t) => t.name)

    expect(manager).not.toContain('get_staff_activity')
    expect(manager).not.toContain('get_inventory')
    expect(owner).toEqual(expect.arrayContaining(['get_staff_activity', 'get_inventory', 'get_customers']))
  })

  test('every tool schema is an object and none accepts a tenant id', async () => {
    const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
    const { z } = await import('zod')

    for (const tool of ASSISTANT_TOOLS) {
      const schema = z.toJSONSchema(tool.input) as { type?: string; properties?: Record<string, unknown> }
      expect(schema.type).toBe('object')
      expect(Object.keys(schema.properties ?? {}).some((key) => /tenant/i.test(key))).toBe(false)
    }
  })
})
