import { createClient } from '@/lib/supabase/server'
import { getManualUpsellItems, getQuickAddItems, getStarItems, getUpsellsForCart, getUpsellsForItem } from '@/lib/menu-engineering-service'
import { needsChoices } from '@/lib/boost/offer-items'
import type { MenuItem } from '@/types/database'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))
jest.mock('@/lib/redis-cache', () => ({
  getCachedOrFetch: (_key: string, fetch: () => Promise<unknown>) => fetch(),
  generateCacheKey: (prefix: string, id: string) => `${prefix}:${id}`,
  CACHE_TTL: { CHECKOUT_UPSELL: 300 },
}))

const choices: Partial<MenuItem> = {
  modifier_groups: [{
    id: 'extras', name: 'Required extras', display_order: 0, min_select: 1, max_select: null,
    options: [{ id: 'egg', name: 'Egg', price_modifier: 10, display_order: 0 }],
  }],
}

/** Honor the SELECT projection, so omitted fields cannot magically reach the UI. */
function stubMenuRow(extra: Partial<MenuItem>) {
  const row: Record<string, unknown> = {
    id: 'drink', name: 'Iced Tea', is_available: true, price: 50,
    category: { name: 'Drinks' }, variations: [], variation_types: [], addons: [], ...extra,
  }
  const from = (table: string) => {
    let columns = ''
    const builder = {
      select: (value: string) => { columns = value; return builder },
      eq: () => builder, in: () => builder, order: () => builder, limit: () => builder,
      then: (resolve: (value: unknown) => unknown) => {
        const projected = Object.fromEntries(Object.entries(row).filter(([key]) => new RegExp(`\\b${key}\\b`).test(columns)))
        const result = table === 'upsell_pairs' ? { target_item: projected } : projected
        return Promise.resolve({ data: [result], error: null }).then(resolve)
      },
    }
    return builder
  }
  jest.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
}

const sources: Array<[string, () => Promise<MenuItem[]>]> = [
  ['manual picks', () => getManualUpsellItems('tenant')],
  ['automatic quick additions', () => getQuickAddItems('tenant')],
  ['star items', () => getStarItems('tenant')],
  ['cart pairings', () => getUpsellsForCart(['main'], 'tenant')],
  ['item pairings', () => getUpsellsForItem('main', 'tenant')],
]

describe.each(sources)('%s', (_label, read) => {
  it('keeps required extras in the suggestion so they cannot be skipped by quick add', async () => {
    stubMenuRow(choices)
    const [suggestion] = await read()
    expect(suggestion.modifier_groups).toEqual(choices.modifier_groups)
    expect(needsChoices(suggestion)).toBe(true)
  })

  it('keeps the pre-order flag so the customer must choose a pickup date', async () => {
    stubMenuRow({ presell_enabled: true })
    const [suggestion] = await read()
    expect(suggestion.presell_enabled).toBe(true)
    expect(needsChoices(suggestion)).toBe(true)
  })
})
