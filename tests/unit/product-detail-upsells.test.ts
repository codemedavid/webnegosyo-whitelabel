/**
 * Product-page upgrade upsells were read per request through the
 * cookie-bound server client, so every product view (and every quick-view
 * sheet opened from the menu) paid an `upsell_pairs` query. They now read
 * through the public client and the storefront data cache; anon RLS already
 * allows active pairs (`Public can view active upsell pairs`) and available
 * menu items, and the result filters to available targets either way.
 */

const cacheBoundaries: Array<{ keyParts: string[]; options: { tags?: string[]; revalidate?: number }; fn: (...args: unknown[]) => Promise<unknown> }> = []

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { tags?: string[]; revalidate?: number }) => {
    cacheBoundaries.push({ keyParts, options, fn })
    return fn
  },
}))

const mockCookieClient = jest.fn(() => {
  throw new Error('the cookie-bound client must not be used for public upsell reads')
})
jest.mock('@/lib/supabase/server', () => ({ createClient: () => mockCookieClient() }))

const mockComplementary = jest.fn()
jest.mock('@/lib/complementary-pairs-service', () => ({
  getComplementaryItems: (...args: unknown[]) => mockComplementary(...args),
}))

interface Recorded { table: string; columns: string; filters: Array<[string, unknown]> }
let recorded: Recorded[] = []
let upsellResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }

jest.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      const entry: Recorded = { table, columns: '', filters: [] }
      recorded.push(entry)
      const builder: Record<string, unknown> = {}
      Object.assign(builder, {
        select: (columns: string) => { entry.columns = columns; return builder },
        eq: (key: string, value: unknown) => { entry.filters.push([key, value]); return builder },
        order: () => builder,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(upsellResult).then(resolve),
      })
      return builder
    },
  }),
}))

const TENANT = 'tenant-1'
const ITEM = 'item-1'

const target = (id: string, isAvailable: boolean) => ({
  source_label: 'Solo',
  target_label: 'Meal',
  upgrade_header: 'Make it a meal?',
  target_item: { id, tenant_id: TENANT, name: id, price: 150, is_available: isAvailable, variations: null, variation_types: null, addons: null },
})

async function loadUpsells(itemId = ITEM) {
  const { getCachedUpsellsForItem } = await import('@/lib/product-detail-data')
  return getCachedUpsellsForItem(itemId, TENANT, 'cat-1', { pairingRulesEnabled: false })
}

describe('product page upgrade upsells', () => {
  beforeEach(() => {
    recorded = []
    cacheBoundaries.length = 0
    mockComplementary.mockReset().mockResolvedValue([])
    upsellResult = { data: [], error: null }
  })

  test('reads active upgrade pairs for this item and store through the public client', async () => {
    upsellResult = { data: [target('meal', true)], error: null }

    const { upgrades } = await loadUpsells()

    expect(mockCookieClient).not.toHaveBeenCalled()
    const read = recorded.find((entry) => entry.table === 'upsell_pairs')
    expect(read?.filters).toEqual(expect.arrayContaining([
      ['source_item_id', ITEM], ['tenant_id', TENANT], ['pair_type', 'upgrade'], ['is_active', true],
    ]))
    expect(upgrades).toHaveLength(1)
    expect(upgrades[0]).toMatchObject({ sourceLabel: 'Solo', targetLabel: 'Meal', upgradeHeader: 'Make it a meal?' })
    expect(upgrades[0].targetItem).toMatchObject({ id: 'meal', variations: [], variation_types: [], addons: [] })
  })

  test('never offers an upgrade the customer cannot buy', async () => {
    upsellResult = { data: [target('meal', true), target('sold-out', false), { ...target('gone', true), target_item: null }], error: null }

    const { upgrades } = await loadUpsells()

    expect(upgrades.map((upgrade) => upgrade.targetItem.id)).toEqual(['meal'])
  })

  test('is cached per store, tagged so a storefront purge refreshes it', async () => {
    await loadUpsells()

    const boundary = cacheBoundaries.find((entry) => entry.keyParts.includes('product-detail-upgrades'))
    expect(boundary?.options.tags).toEqual(['storefront-tenant:tenant-1'])
    expect(boundary?.options.revalidate).toBeGreaterThan(0)
  })

  test('a failed read reaches the page as "no upgrades" but is never cached', async () => {
    upsellResult = { data: null, error: { message: 'upstream request timeout' } }
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})

    const { upgrades } = await loadUpsells()

    expect(upgrades).toEqual([])
    const boundary = cacheBoundaries.find((entry) => entry.keyParts.includes('product-detail-upgrades'))
    await expect(boundary!.fn(ITEM, TENANT)).rejects.toThrow('must not be cached')
    errorLog.mockRestore()
  })

  test('the cached value is plain JSON', async () => {
    upsellResult = { data: [target('meal', true)], error: null }

    const { upgrades } = await loadUpsells()

    expect(JSON.parse(JSON.stringify(upgrades))).toEqual(upgrades)
  })

  test('still returns complementary items alongside', async () => {
    mockComplementary.mockResolvedValue([{ id: 'fries' }])

    const { complementary } = await loadUpsells()

    expect(complementary).toEqual([{ id: 'fries' }])
    expect(mockComplementary).toHaveBeenCalledWith(ITEM, 'cat-1', TENANT, { pairingRulesEnabled: false })
  })
})

// A module, not a script: without this, top-level helpers collide across test files under tsc.
export {};
