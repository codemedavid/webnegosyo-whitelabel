/** @jest-environment node */

/**
 * `getUpsellCoverageForItem` spliced the raw item id into a PostgREST `.or()`
 * filter and read `menu_items` by id with no tenant filter, on the service
 * role. The id must be a uuid, and the item read must stay inside the tenant.
 */

const TENANT = '3f1c2a7e-5b6d-4c8e-9f0a-1b2c3d4e5f60'
const ITEM = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

const calls: Array<{ table: string; method: string; args: unknown[] }> = []

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const record = (method: string) => (...args: unknown[]) => {
        calls.push({ table, method, args })
        return chain
      }
      const chain: Record<string, unknown> = {
        select: record('select'),
        eq: record('eq'),
        or: record('or'),
        single: async () => ({ data: { category_id: null, show_in_checkout_upsell: false, price: 100 } }),
        then: (resolve: (value: unknown) => unknown) => resolve({ count: 0, data: [] }),
      }
      return chain
    },
  }),
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))
jest.mock('@/lib/redis-cache', () => ({
  getCachedOrFetch: jest.fn(),
  invalidateCache: jest.fn(),
  generateCacheKey: jest.fn(),
  CACHE_TTL: {},
}))

async function load() {
  return import('@/lib/menu-engineering-service')
}

describe('getUpsellCoverageForItem', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('refuses an item id that would inject into the .or() filter', async () => {
    // Arrange
    const { getUpsellCoverageForItem } = await load()

    // Act / Assert
    await expect(
      getUpsellCoverageForItem(`${ITEM},tenant_id.neq.${TENANT}`, TENANT),
    ).rejects.toThrow()
    expect(calls.some((c) => c.method === 'or')).toBe(false)
  })

  it('scopes the menu item read to the tenant', async () => {
    // Arrange
    const { getUpsellCoverageForItem } = await load()

    // Act
    await getUpsellCoverageForItem(ITEM, TENANT)

    // Assert
    const itemFilters = calls.filter((c) => c.table === 'menu_items' && c.method === 'eq').map((c) => c.args)
    expect(itemFilters).toEqual(expect.arrayContaining([['id', ITEM], ['tenant_id', TENANT]]))
  })
})

// A module, so its top-level mocks do not collide with other test files.
export {}
