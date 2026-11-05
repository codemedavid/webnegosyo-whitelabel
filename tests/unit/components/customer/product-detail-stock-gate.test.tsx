/**
 * The item page (and the menu's item sheet, which renders the same content)
 * asks `/api/inventory/ceilings` only for stores that track stock. A store
 * without inventory has no ceilings, so the request was wasted on every open.
 */
import { render } from '@testing-library/react'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'

const mockStockCeilings = jest.fn((tenantId: string | null | undefined) => (tenantId ? new Map() : new Map()))
const mockOptionCeilings = jest.fn((tenantId: string | null | undefined) => (tenantId ? new Map() : new Map()))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), prefetch: jest.fn(), replace: jest.fn() }),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(() => 1), dismiss: jest.fn() }) }))
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem: jest.fn(() => ({ ok: true })), setTenantContext: jest.fn(), items: [] }),
}))
jest.mock('@/hooks/use-branch-pricing', () => ({
  useBranchPricing: () => ({ resolve: <T,>(item: T) => item, resolveAll: <T,>(items: T[]) => items, selectedOutletId: null }),
}))
jest.mock('@/hooks/use-stock-ceilings', () => ({
  useStockCeilings: (tenantId: string | null | undefined) => mockStockCeilings(tenantId),
  useOptionStockCeilings: (tenantId: string | null | undefined) => mockOptionCeilings(tenantId),
  selectCeiling: () => null,
}))
jest.mock('@/hooks/use-presell-availability', () => ({
  usePresellAvailability: () => ({ calendar: null, isLoading: false }),
}))
jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))
jest.mock('@/components/customer/product-detail-lazy', () => ({
  LazyImageModal: () => null,
  LazyRelatedItemsSection: () => null,
}))

const adobo: MenuItem = {
  id: 'adobo', tenant_id: 't1', category_id: 'mains', name: 'Adobo', description: '',
  price: 150, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
} as MenuItem

async function renderPage(tenant: Partial<SelectedTenant>) {
  const { ProductDetailContent } = await import('@/components/customer/product-detail-content')
  render(
    <ProductDetailContent
      tenant={{ id: 't1', slug: 'lolys', name: "Loly's", ...tenant } as SelectedTenant}
      item={adobo}
      branding={getTenantBranding({})}
    />,
  )
}

beforeEach(() => {
  mockStockCeilings.mockClear()
  mockOptionCeilings.mockClear()
})

describe('ProductDetailContent — stock ceilings', () => {
  it('reads no ceilings for a store without inventory', async () => {
    await renderPage({ inventory_enabled: false })

    expect(mockStockCeilings.mock.calls.every(([tenantId]) => !tenantId)).toBe(true)
    expect(mockOptionCeilings.mock.calls.every(([tenantId]) => !tenantId)).toBe(true)
  })

  it('reads the ceilings for a store that tracks stock', async () => {
    await renderPage({ inventory_enabled: true })

    expect(mockStockCeilings).toHaveBeenCalledWith('t1')
    expect(mockOptionCeilings).toHaveBeenCalledWith('t1')
  })
})
