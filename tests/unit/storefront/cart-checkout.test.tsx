import { act, fireEvent, render, screen } from '@testing-library/react'
import { CartDrawer } from '@/components/customer/cart-drawer'
import { ALWAYS_OPEN_STATUS } from '@/lib/store-open-status'
import type { CartItem, Tenant } from '@/types/database'

const mockPush = jest.fn()
const mockPrefetch = jest.fn()
const mockRouter = { push: mockPush, prefetch: mockPrefetch }
const mockToast = jest.fn()
let mockOpenStatus = ALWAYS_OPEN_STATUS
const mockItems: CartItem[] = [{ id: 'line-1', menu_item: { id: 'dish-1', name: 'Soup', price: 10, tenant_id: 'tenant-1', category_id: 'category-1', description: 'Soup', image_url: '', is_available: true, order: 0, created_at: '', updated_at: '', variations: [], addons: [] }, quantity: 1, subtotal: 10, selected_addons: [] }]
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mockToast(...args) } }))
jest.mock('@/hooks/use-store-open-status', () => ({ useStoreOpenStatus: () => mockOpenStatus }))
jest.mock('@/hooks/use-presell-cart-caps', () => ({ usePresellCartCaps: () => ({ canIncreaseItem: () => true, presellHintFor: () => null }) }))
jest.mock('@/hooks/useCart', () => ({ useCart: () => ({ items: mockItems, bundleItems: [], total: 10, updateQuantity: jest.fn(), updateItemConfiguration: jest.fn(), removeItem: jest.fn(), updateBundleQuantity: jest.fn(), removeBundleFromCart: jest.fn() }) }))
jest.mock('@/app/actions/menu-engineering', () => ({ getCheckoutUpsellsAction: jest.fn().mockResolvedValue({ success: true, data: [] }) }))
jest.mock('@/components/customer/item-detail-modal', () => ({ ItemDetailModal: () => null }))
jest.mock('@/components/customer/offers/cart-offers-section', () => ({ CartOffersSection: () => <div data-testid="cart-offers" /> }))

const props = { open: true, onClose: jest.fn(), tenantSlug: 'cafe', tenant: { id: 'tenant-1' } as Tenant, branding: { primary: '#000000', secondary: '#ffffff', accent: '#000000' } as never }
beforeEach(() => { jest.clearAllMocks(); mockOpenStatus = ALWAYS_OPEN_STATUS })

test('drawer blocks checkout while ordering is closed and leaves the cart visible', () => {
  mockOpenStatus = { ...ALWAYS_OPEN_STATUS, isOrderingBlocked: true, nextOpenLabel: 'tomorrow' }
  render(<CartDrawer {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Proceed to Checkout' }))
  expect(mockPush).not.toHaveBeenCalled()
  expect(props.onClose).not.toHaveBeenCalled()
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('tomorrow'))
})

test('drawer shows suggestions inline and checks out without an interstitial', async () => {
  const upsellProps = { ...props, tenantId: 'tenant-1', menuEngineeringEnabled: true, checkoutUpsellEnabled: true }
  render(<CartDrawer {...upsellProps} />)
  expect(screen.getByTestId('cart-offers')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Proceed to Checkout' })) })
  expect(mockPush).toHaveBeenCalledWith('/cafe/checkout')
})
