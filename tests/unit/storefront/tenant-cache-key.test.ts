/**
 * Browser QA 2026-11-05: after a deploy that added `inventory_enabled` to the
 * storefront projection, the cached tenant read (5 min) still held rows from
 * before, so the stock badges stayed off until the entry expired. Next keys
 * `unstable_cache` on the key parts + the wrapper's source, neither of which
 * changed. The key now carries a fingerprint of the projection, so a deploy
 * that changes the columns starts from a fresh entry by itself.
 */
const seenKeys: string[][] = []

jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keyParts: string[]) => {
    seenKeys.push(keyParts)
    return fn
  },
}))
jest.mock('@/lib/supabase/public', () => {
  const actual = jest.requireActual('@/lib/supabase/public')
  const builder = { eq: () => builder, maybeSingle: async () => ({ data: null, error: null }) }
  return { ...actual, createPublicClient: () => ({ from: () => ({ select: () => builder }) }) }
})

beforeEach(() => {
  seenKeys.length = 0
})

describe('projectionCacheKey', () => {
  it('is stable for the same columns and changes when a column is added', async () => {
    const { projectionCacheKey } = await import('@/lib/storefront/cached-read')

    expect(projectionCacheKey('id, slug')).toBe(projectionCacheKey('id, slug'))
    expect(projectionCacheKey('id, slug, inventory_enabled')).not.toBe(projectionCacheKey('id, slug'))
    expect(projectionCacheKey('id, slug')).toMatch(/^cols-[0-9a-z]+$/)
  })
})

describe('tenant reads key their cache on the columns they select', () => {
  it('the storefront tenant read', async () => {
    const { projectionCacheKey } = await import('@/lib/storefront/cached-read')
    const { TENANT_STOREFRONT_SELECT } = await import('@/lib/queries/tenant-storefront-select')
    const { getStorefrontTenant } = await import('@/lib/storefront/storefront-tenant')

    await getStorefrontTenant('cafe')

    expect(seenKeys).toContainEqual(['storefront-tenant', projectionCacheKey(TENANT_STOREFRONT_SELECT)])
  })

  it('the product page tenant read', async () => {
    const { projectionCacheKey } = await import('@/lib/storefront/cached-read')
    const { PRODUCT_DETAIL_TENANT_SELECT } = await import('@/lib/queries/product-detail-tenant-select')
    const { getCachedTenantBySlug } = await import('@/lib/product-detail-data')

    await getCachedTenantBySlug('cafe')

    expect(seenKeys).toContainEqual(['product-detail-tenant', projectionCacheKey(PRODUCT_DETAIL_TENANT_SELECT)])
  })
})
