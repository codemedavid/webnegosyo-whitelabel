/**
 * The storefront pack contract. Every pack draws its own menu, but ordering
 * rules are shared: a tap on a dish must go through the menu controller, so a
 * closed store, a sold-out dish or a branch list that failed to load refuses
 * the add in every pack, and every pack must reach checkout. A new pack is
 * covered here the moment it is registered.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MenuClient } from '@/app/[tenant]/menu/menu-client'
import { STOREFRONT_PACK_IDS } from '@/lib/storefront-packs'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'
import type { MenuItem, Tenant } from '@/types/database'

const mockAddItem = jest.fn()
const mockPush = jest.fn()
const mockCartRender = jest.fn()
const mockStatus = { isOrderingBlocked: false, nextOpenLabel: null }
const mockCart = { items: [] as unknown[], bundleItems: [] as unknown[], item_count: 0, total: 0 }

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/test/menu',
}))
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({ ...mockCart, addItem: mockAddItem, setTenantContext: jest.fn() }),
}))
jest.mock('@/hooks/use-store-open-status', () => ({ useStoreOpenStatus: () => mockStatus }))
jest.mock('@/hooks/use-outlet-selection', () => ({ useOutletSelection: () => ({ outlet: null }) }))
jest.mock('next/dynamic', () => {
  const React = jest.requireActual('react')
  return (load: () => Promise<unknown>) => {
    const Lazy = React.lazy(load)
    return function LazyView(props: unknown) {
      return React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props))
    }
  }
})
jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))
// The legacy pack's own markup is covered by storefront-menu-runtime.test.tsx;
// here its catalog layout is a stand-in that, like every real layout, hands
// taps to onItemSelect.
jest.mock('@/components/customer/layouts', () => ({
  MenuLayout: (props: { filteredItems: MenuItem[]; onItemSelect: (item: MenuItem) => void }) => (
    <div>{props.filteredItems.map((item) => <button key={item.id} onClick={() => props.onItemSelect(item)}>{item.name}</button>)}</div>
  ),
}))
jest.mock('@/components/customer/header-templates', () => ({
  MenuHeaderRenderer: (props: { onCartClick: () => void }) => <header><button onClick={props.onCartClick}>Cart</button></header>,
}))
jest.mock('@/components/customer/cart-drawer', () => ({ CartDrawer: (props: unknown) => { mockCartRender(props); return null } }))
jest.mock('@/components/customer/product-detail-sheet', () => ({ ProductDetailSheet: () => null }))
jest.mock('@/components/customer/bundle-wizard', () => ({ BundleWizard: () => null }))
jest.mock('@/components/customer/block-hero-renderer', () => ({ BlockHeroRenderer: () => null }))
jest.mock('@/components/customer/category-submenu', () => ({ CategorySubmenu: () => null }))
jest.mock('@/components/customer/branding-inspector', () => ({ BrandingInspector: () => null }))
jest.mock('@/components/customer/active-order-banner', () => ({ ActiveOrderBanner: () => null }))
jest.mock('@/components/customer/outlet-gate', () => ({ OutletGate: () => null }))
jest.mock('@/components/customer/flash-screen-loader', () => ({ FlashScreenLoader: () => null }))
jest.mock('@/components/customer/background-overlay-layer', () => ({ BackgroundOverlayLayer: () => null }))
jest.mock('@/components/customer/checkout-upsell-modal', () => ({ CheckoutUpsellModal: () => null }))

const burger = createTestMenuItem({ id: 'burger', name: 'Classic Burger' })
const soldOut = createTestMenuItem({ id: 'fries', name: 'Loaded Fries', is_available: false })

// Awaited act: a pack's pages are lazy chunks, and React 19 only retries a
// suspended render inside an awaited act scope.
async function renderPack(pack: string, overrides: Partial<Parameters<typeof MenuClient>[0]> = {}) {
  const tenant = { id: 't1', slug: 'test', name: 'Test', storefront_pack: pack } as Tenant
  await act(async () => {
    render(
      <MenuClient tenant={tenant} tenantSlug="test" categories={[]} allMenuItems={[burger, soldOut]}
        bundles={[]} outlets={[]} isBrandAdmin={false} error={null} {...overrides} />
    )
  })
}

// A pack's pages are lazy chunks; give the first cold import time to land.
const LAZY_PAGE_TIMEOUT = { timeout: 4000 }
const tapDish = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }, LAZY_PAGE_TIMEOUT))

beforeEach(() => {
  jest.clearAllMocks()
  mockStatus.isOrderingBlocked = false
  Object.assign(mockCart, { items: [], item_count: 0, total: 0 })
  window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }))
})

describe.each(STOREFRONT_PACK_IDS)('the %s storefront pack', (pack) => {
  it('lists the menu and adds a simple dish through the shared controller', async () => {
    await renderPack(pack)
    await tapDish('Classic Burger')
    expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'burger' }), undefined, [], 1, undefined)
  })

  it('refuses to add while the store is closed', async () => {
    mockStatus.isOrderingBlocked = true
    await renderPack(pack)
    await tapDish('Classic Burger')
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('refuses to add a sold-out dish', async () => {
    await renderPack(pack)
    await tapDish('Loaded Fries')
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('refuses to add when the branch list failed to load', async () => {
    const tenant = { id: 't1', slug: 'test', name: 'Test', storefront_pack: pack, multi_branch_enabled: true } as Tenant
    await renderPack(pack, { tenant, outletsFailed: true })
    await tapDish('Classic Burger')
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('adds from the home page through the shared controller, and refuses while closed', async () => {
    await renderPack(pack, { page: 'home' })
    await tapDish('Classic Burger')
    expect(mockAddItem).toHaveBeenCalledTimes(1)

    mockAddItem.mockClear()
    mockStatus.isOrderingBlocked = true
    await tapDish('Classic Burger')
    expect(mockAddItem).not.toHaveBeenCalled()
  })

  it('reaches checkout from the menu once the cart has items', async () => {
    Object.assign(mockCart, { items: [{ id: 'line-1', menu_item: burger }], item_count: 1, total: 150 })
    await renderPack(pack)
    const orderButton = (await screen.findAllByRole('button', { name: /cart|view order/i }, LAZY_PAGE_TIMEOUT))[0]
    fireEvent.click(orderButton)
    await waitFor(() => {
      const openedDrawer = mockCartRender.mock.calls.some(([props]) => (props as { open: boolean }).open)
      const navigated = mockPush.mock.calls.some(([href]) => href === '/test/checkout')
      expect(openedDrawer || navigated).toBe(true)
    })
  })
})
