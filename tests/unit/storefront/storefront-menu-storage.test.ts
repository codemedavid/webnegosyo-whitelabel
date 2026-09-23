/**
 * The cached menu snapshot stores dishes as a column table and decodes them on
 * the way out. Paging past PostgREST's 1000-row cap made a 4066-item store's
 * snapshot ~2 MB of plain rows — over Next's data-cache entry limit — so the
 * storage format is what keeps a large menu cacheable at all.
 */
import { MAX_CACHE_ENTRY_BYTES, measureCacheEntryBytes } from '@/lib/storefront/cached-read'

const storedBodies: string[] = []

// Behaves like Next's data cache: the result crosses a JSON boundary.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
    const body = JSON.stringify(await fn(...args))
    storedBodies.push(body)
    return JSON.parse(body)
  },
}))

jest.mock('@/lib/supabase/public', () => ({ createPublicClient: jest.fn(() => ({})) }))

const TENANT = { id: '5f0f3a52-9a3e-4c61-8a57-4a3f1b2c9d10', slug: 'mini-mart', name: 'Mini Mart' }

jest.mock('@/lib/storefront/storefront-tenant', () => ({
  getStorefrontTenant: jest.fn(async () => ({ tenant: TENANT, error: null })),
}))

const mockLoadCatalog = jest.fn()
jest.mock('@/lib/storefront/storefront-catalog', () => ({
  ...jest.requireActual('@/lib/storefront/storefront-catalog'),
  loadStorefrontCatalog: (...args: unknown[]) => mockLoadCatalog(...args),
}))

/** Shaped like the live 4066-item store's rows (MENU_ITEM_LIST_SELECT). */
function realisticItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `3b7c${String(index).padStart(4, '0')}-1f2e-4d5c-9b8a-7a6b5c4d3e2f`,
    tenant_id: TENANT.id,
    category_id: `c0ffee${String(index % 70).padStart(2, '0')}-1f2e-4d5c-9b8a-7a6b5c4d3e2f`,
    name: `Product number ${index} 500g pack`,
    description: 'Imported goods, best before printed on pack',
    price: 100 + index,
    discounted_price: null,
    image_url: '',
    is_available: true,
    is_featured: false,
    order: index % 600,
    modifier_groups: [],
    variations: [],
    variation_types: [],
    addons: [],
    bcg_classification: 'unclassified',
    badge_text: null,
    presell_enabled: false,
  }))
}

function catalogWith(menuItems: unknown[]) {
  return {
    categories: [{ id: 'c1', name: 'Snacks' }],
    menuItems,
    bundles: [],
    outlets: [],
    outletsFailed: false,
    menuOverrides: [],
    overridesFailed: false,
    error: null,
  }
}

async function getMenu(slug: string) {
  const { getStorefrontMenu } = await import('@/lib/storefront/storefront-menu')
  return getStorefrontMenu(slug)
}

describe('storefront menu storage', () => {
  beforeEach(() => {
    storedBodies.length = 0
    mockLoadCatalog.mockReset()
  })

  test('dishes come back exactly as the catalog loaded them', async () => {
    const items = realisticItems(25)
    mockLoadCatalog.mockResolvedValue(catalogWith(items))

    const menu = await getMenu('mini-mart')

    expect(menu.status).toBe('ready')
    expect(menu.menuItems).toEqual(items)
    expect(menu.categories).toEqual([{ id: 'c1', name: 'Snacks' }])
  })

  test('a 4066-item menu fits in one cache entry once stored as a table', async () => {
    const items = realisticItems(4066)
    mockLoadCatalog.mockResolvedValue(catalogWith(items))

    const menu = await getMenu('mini-mart')

    expect(menu.menuItems).toHaveLength(4066)
    const storedBytes = measureCacheEntryBytes(JSON.parse(storedBodies[0]))
    const plainBytes = measureCacheEntryBytes(catalogWith(items))
    expect(plainBytes).toBeGreaterThan(MAX_CACHE_ENTRY_BYTES)
    expect(storedBytes).toBeLessThan(MAX_CACHE_ENTRY_BYTES)
  })

  test('a failed catalog read is still delivered, decoded', async () => {
    mockLoadCatalog.mockResolvedValue({ ...catalogWith(realisticItems(2)), outletsFailed: true })

    const menu = await getMenu('mini-mart')

    expect(menu.outletsFailed).toBe(true)
    expect(menu.menuItems).toHaveLength(2)
  })
})
