import { act, renderHook } from '@testing-library/react'
import { useCartView } from '@/hooks/useCartView'
import { getTenantBySlugClient } from '@/lib/tenants-client'
import { ALWAYS_OPEN_STATUS } from '@/lib/store-open-status'
import type { CartItem, Tenant } from '@/types/database'

let mockSlug = 'cafe'
let mockOpenStatus = ALWAYS_OPEN_STATUS
const mockRouter = { push: jest.fn(), prefetch: jest.fn() }
const mockTenant = { id: 'tenant-1', menu_engineering_enabled: true, checkout_upsell_enabled: true } as Tenant
const mockItems = [{ id: 'line', menu_item: { id: 'dish' } }] as CartItem[]
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, useParams: () => ({ tenant: mockSlug }) }))
jest.mock('@/lib/tenants-client', () => ({ getTenantBySlugClient: jest.fn() }))
jest.mock('@/hooks/use-branding-preview', () => ({ useBrandingPreviewTenant: (tenant: Tenant | null) => tenant }))
jest.mock('@/hooks/use-store-open-status', () => ({ useStoreOpenStatus: () => mockOpenStatus }))
jest.mock('@/hooks/use-presell-cart-caps', () => ({ usePresellCartCaps: () => ({ canIncreaseItem: () => true, presellHintFor: () => null }) }))
jest.mock('@/hooks/useCart', () => ({ useCart: () => ({ items: mockItems, bundleItems: [], total: 10, updateQuantity: jest.fn(), updateItemConfiguration: jest.fn(), removeItem: jest.fn(), updateBundleQuantity: jest.fn(), removeBundleFromCart: jest.fn() }) }))
jest.mock('@/app/actions/menu-engineering', () => ({ getCheckoutUpsellsAction: jest.fn().mockResolvedValue({ success: true, data: [] }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
const fetchTenant = jest.mocked(getTenantBySlugClient)
beforeEach(() => { jest.clearAllMocks(); mockSlug = 'cafe'; mockOpenStatus = ALWAYS_OPEN_STATUS; fetchTenant.mockResolvedValue({ data: mockTenant, error: null }) })

test('cart page uses the current hours when continuing its upsell', async () => {
  const { result, rerender } = renderHook(() => useCartView())
  await act(async () => {})
  act(() => result.current.requestCheckout())
  expect(result.current.showUpsellModal).toBe(true)
  mockOpenStatus = { ...ALWAYS_OPEN_STATUS, isOrderingBlocked: true }
  rerender()
  await act(async () => result.current.onUpsellContinue())
  expect(result.current.showUpsellModal).toBe(false)
  expect(mockRouter.push).not.toHaveBeenCalled()
})

test('a tenant response arriving after a slug change cannot replace the current tenant', async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof getTenantBySlugClient>>) => void
  fetchTenant.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
  const { result, rerender } = renderHook(() => useCartView())
  mockSlug = 'new-cafe'
  fetchTenant.mockResolvedValue({ data: { ...mockTenant, id: 'tenant-2' }, error: null })
  rerender()
  await act(async () => {})
  expect(result.current.tenant?.id).toBe('tenant-2')
  await act(async () => resolveOld({ data: mockTenant, error: null }))
  expect(result.current.tenant?.id).toBe('tenant-2')
})
