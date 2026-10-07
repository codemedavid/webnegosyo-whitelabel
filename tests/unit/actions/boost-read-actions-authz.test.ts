/** @jest-environment node */

/**
 * Boost Sales / tag read actions run on the service role, so the server action
 * itself is the boundary: they used to answer any tenant's data to anyone who
 * could name its id. Each now requires the permission of the admin screen it
 * serves (`analytics` for Boost Sales, `menu` for the menu editor's tags) and
 * validates ids before they reach a PostgREST filter.
 */

import { hasPermission } from '@/lib/staff-permissions'

const TENANT = '3f1c2a7e-5b6d-4c8e-9f0a-1b2c3d4e5f60'
const ITEM = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

let mockPermissions: string[] | null = []
const verifyTenantPermission = jest.fn(async (_tenantId: string, permission: 'analytics' | 'menu') => {
  if (!hasPermission({ role: 'admin', is_owner: false, permissions: mockPermissions }, permission)) {
    throw new Error('Unauthorized: Missing permission for this feature')
  }
  return { user: { id: 'staff-1' }, userRole: { role: 'admin' } }
})
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: [string, 'analytics' | 'menu']) => verifyTenantPermission(...args),
  verifyTenantAdmin: jest.fn(),
  toggleMenuItemAvailability: jest.fn(),
}))

const service = {
  getItemsNotInAnyUpsell: jest.fn(async () => []),
  getUpsellCoverageForItem: jest.fn(async () => ({ pairCount: 1, bundleCount: 0, isCheckoutPick: false })),
  getRecommendedPlacement: jest.fn(async () => ({ placement: 'bundle', reason: 'x' })),
  getSmartUpgradeSuggestions: jest.fn(async () => ({ bundles: [], categoryUpgrades: [] })),
}
jest.mock('@/lib/menu-engineering-service', () => service)

const getComplementaryPairsByTenant = jest.fn(async () => [])
jest.mock('@/lib/complementary-pairs-service', () => ({
  getComplementaryPairsByTenant: (...args: unknown[]) => getComplementaryPairsByTenant(...(args as [])),
  invalidateComplementaryPairsCache: jest.fn(),
}))

const tags = {
  getTagDefinitions: jest.fn(async () => []),
  getItemTags: jest.fn(async () => []),
}
jest.mock('@/lib/tags-service', () => tags)
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: jest.fn() }))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: jest.fn() }))
jest.mock('@/lib/storefront/cached-read', () => ({ storefrontTenantIdTag: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }))

async function boost() {
  return import('@/app/actions/menu-engineering')
}

const BOOST_READS: Array<[string, (a: Awaited<ReturnType<typeof boost>>, item: string) => Promise<unknown>, jest.Mock]> = [
  ['getItemsNotInAnyUpsellAction', (a) => a.getItemsNotInAnyUpsellAction(TENANT), service.getItemsNotInAnyUpsell],
  ['getUpsellCoverageForItemAction', (a, item) => a.getUpsellCoverageForItemAction(item, TENANT), service.getUpsellCoverageForItem],
  ['getRecommendedPlacementAction', (a, item) => a.getRecommendedPlacementAction(item, TENANT), service.getRecommendedPlacement],
  ['getSmartUpgradeSuggestionsAction', (a, item) => a.getSmartUpgradeSuggestionsAction(item, TENANT), service.getSmartUpgradeSuggestions],
]

describe('Boost Sales read actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPermissions = ['orders', 'pos']
  })

  it('no longer exports the unauthenticated, unused setBoostPriorityAction', async () => {
    expect(await boost()).not.toHaveProperty('setBoostPriorityAction')
  })

  it.each(BOOST_READS)('%s refuses staff without the analytics permission', async (_name, call, read) => {
    // Act
    await call(await boost(), ITEM)

    // Assert
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'analytics', 'view')
    expect(read).not.toHaveBeenCalled()
  })

  it.each(BOOST_READS)('%s serves staff with the analytics permission', async (_name, call, read) => {
    // Arrange
    mockPermissions = ['analytics']

    // Act
    await call(await boost(), ITEM)

    // Assert
    expect(read).toHaveBeenCalled()
  })

  it.each(BOOST_READS.slice(1))('%s refuses an item id that is not a uuid', async (_name, call, read) => {
    // Arrange — a crafted id would otherwise be spliced into a PostgREST `.or()`.
    mockPermissions = ['analytics']

    // Act
    await call(await boost(), `${ITEM},tenant_id.neq.${TENANT}`)

    // Assert
    expect(read).not.toHaveBeenCalled()
  })

  it('getComplementaryPairsAction refuses staff without the analytics permission', async () => {
    // Arrange
    const { getComplementaryPairsAction } = await import('@/app/actions/complementary-pairs')

    // Act
    await getComplementaryPairsAction(TENANT).catch(() => undefined)

    // Assert
    expect(getComplementaryPairsByTenant).not.toHaveBeenCalled()
  })
})

describe('tag read actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPermissions = ['orders']
  })

  it('refuses tag reads to staff without the menu permission', async () => {
    // Arrange
    const { getTagDefinitionsAction, getItemTagsAction } = await import('@/app/actions/tags')

    // Act
    const results = await Promise.all([getTagDefinitionsAction(TENANT), getItemTagsAction(ITEM, TENANT)])

    // Assert
    expect(results.every((r) => r.success === false)).toBe(true)
    expect(tags.getTagDefinitions).not.toHaveBeenCalled()
    expect(tags.getItemTags).not.toHaveBeenCalled()
  })

  it('refuses a tenant id that is not a uuid before it reaches the tag filter', async () => {
    // Arrange
    mockPermissions = ['menu']
    const { getTagDefinitionsAction } = await import('@/app/actions/tags')

    // Act
    const result = await getTagDefinitionsAction(`${TENANT},tenant_id.not.is.null`)

    // Assert
    expect(result.success).toBe(false)
    expect(tags.getTagDefinitions).not.toHaveBeenCalled()
  })

  it('serves tag reads to staff with the menu permission', async () => {
    // Arrange
    mockPermissions = ['menu']
    const { getTagDefinitionsAction, getItemTagsAction } = await import('@/app/actions/tags')

    // Act
    const results = await Promise.all([getTagDefinitionsAction(TENANT), getItemTagsAction(ITEM, TENANT)])

    // Assert
    expect(results.every((r) => r.success === true)).toBe(true)
  })
})
