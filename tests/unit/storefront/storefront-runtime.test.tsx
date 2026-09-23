/**
 * StorefrontRuntime mounts the storefront's shared overlays once, around any
 * storefront pack: the product sheet, the bundle wizard, the active-order
 * banner, the Branding Studio inspector and the flash-screen preview. A pack
 * supplies only its own markup, so a new pack cannot forget one of them.
 */
import { render, screen, waitFor } from '@testing-library/react'
import type { StorefrontMenuController } from '@/storefront/contracts'
import type { MenuItem, Tenant, BundleWithSlots } from '@/types/database'

const mockDraft: { current: Record<string, unknown> | null } = { current: null }

jest.mock('next/dynamic', () => {
  const React = jest.requireActual('react')
  return (load: () => Promise<unknown>) => {
    const Lazy = React.lazy(load)
    return function LazyView(props: unknown) {
      return React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props))
    }
  }
})
jest.mock('@/hooks/use-branding-preview', () => ({ useBrandingPreviewDraft: () => mockDraft.current }))
jest.mock('@/components/customer/product-detail-sheet', () => ({
  ProductDetailSheet: (props: { open: boolean }) => (props.open ? <div data-testid="product-sheet" /> : null),
}))
jest.mock('@/components/customer/bundle-wizard', () => ({
  BundleWizard: (props: { open: boolean }) => (props.open ? <div data-testid="bundle-wizard" /> : null),
}))
jest.mock('@/components/customer/active-order-banner', () => ({ ActiveOrderBanner: () => <div data-testid="active-order" /> }))
jest.mock('@/components/customer/branding-inspector', () => ({ BrandingInspector: () => <div data-testid="inspector" /> }))
jest.mock('@/components/customer/flash-screen-loader', () => ({ FlashScreenLoader: () => <div data-testid="flash" /> }))
jest.mock('@/components/customer/checkout-upsell-modal', () => ({
  CheckoutUpsellModal: (props: { open: boolean }) => (props.open ? <div data-testid="upsell" /> : null),
}))

const mockCart = { items: [] as unknown[], bundleItems: [] as unknown[] }
jest.mock('@/hooks/useCart', () => ({ useCart: () => mockCart }))

const mockGate = {
  requestCheckout: jest.fn(),
  isNavigating: false,
  showInterstitial: false,
  showUpsellModal: false,
  prefetchedItems: null,
  onUpsellContinue: jest.fn(),
}
const mockUseCartCheckout = jest.fn((options: unknown) => { void options; return mockGate })
jest.mock('@/storefront/cart/use-cart-checkout', () => ({
  useCartCheckout: (options: unknown) => mockUseCartCheckout(options),
}))

const tenant = { id: 't1', slug: 'shop', name: 'Shop' } as Tenant
const item = { id: 'i1', name: 'Burger' } as MenuItem

function controller(overrides: Partial<StorefrontMenuController> = {}): StorefrontMenuController {
  return {
    tenant, tenantSlug: 'shop', categories: [], allMenuItems: [item], categoriesWithBundles: [],
    filteredItems: [item], searchItems: [item], searchQuery: '', setSearchQuery: jest.fn(),
    activeCategory: null, setActiveCategory: jest.fn(), itemCount: 0,
    openStatus: { isOrderingBlocked: false } as StorefrontMenuController['openStatus'],
    isCartOpen: false, openCart: jest.fn(), closeCart: jest.fn(),
    selectedBundle: null, closeBundle: jest.fn(), sheetItem: null, closeProduct: jest.fn(), selectItem: jest.fn(),
    ...overrides,
  }
}

async function renderRuntime(
  menu: StorefrontMenuController,
  page = <main data-testid="pack-page" />,
  checkoutEntry: 'cart-drawer' | 'direct' = 'cart-drawer'
) {
  const { StorefrontRuntime } = await import('@/storefront/runtime/storefront-runtime')
  return render(<StorefrontRuntime menu={menu} checkoutEntry={checkoutEntry}>{page}</StorefrontRuntime>)
}

beforeEach(() => {
  mockDraft.current = null
  mockCart.items = []
  Object.assign(mockGate, { showInterstitial: false, showUpsellModal: false })
  jest.clearAllMocks()
})

describe('StorefrontRuntime', () => {
  it('renders the pack page with the always-on overlays exactly once', async () => {
    await renderRuntime(controller())

    expect(screen.getByTestId('pack-page')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByTestId('active-order')).toHaveLength(1))
    expect(screen.getAllByTestId('inspector')).toHaveLength(1)
    expect(screen.queryByTestId('product-sheet')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bundle-wizard')).not.toBeInTheDocument()
    expect(screen.queryByTestId('flash')).not.toBeInTheDocument()
  })

  it('opens the product sheet for the selected item', async () => {
    await renderRuntime(controller({ sheetItem: item }))
    expect(await screen.findByTestId('product-sheet')).toBeInTheDocument()
  })

  it('opens the bundle wizard for the selected bundle', async () => {
    await renderRuntime(controller({ selectedBundle: { id: 'b1' } as BundleWithSlots }))
    expect(await screen.findByTestId('bundle-wizard')).toBeInTheDocument()
  })

  it('shows the flash screen while the Studio previews the flash surface', async () => {
    mockDraft.current = { __previewSurface: 'flash' }
    await renderRuntime(controller())
    expect(screen.getByTestId('flash')).toBeInTheDocument()
  })

  it('exposes the controller and tenant branding to the pack through context', async () => {
    const { useStorefrontRuntime } = await import('@/storefront/runtime/storefront-runtime')
    function PackPage() {
      const { menu, branding } = useStorefrontRuntime()
      return <main data-testid="pack-page" data-slug={menu.tenantSlug} data-has-branding={String(!!branding.background)} />
    }
    await renderRuntime(controller(), <PackPage />)
    expect(screen.getByTestId('pack-page')).toHaveAttribute('data-slug', 'shop')
    expect(screen.getByTestId('pack-page')).toHaveAttribute('data-has-branding', 'true')
  })
})

describe('checkout entry for packs without a cart drawer', () => {
  it('hands the pack a requestCheckout that goes through the shared checkout gate', async () => {
    const { useStorefrontRuntime } = await import('@/storefront/runtime/storefront-runtime')
    function PackPage() {
      const { requestCheckout } = useStorefrontRuntime()
      return <button onClick={requestCheckout}>View order</button>
    }
    await renderRuntime(controller(), <PackPage />, 'direct')
    screen.getByRole('button', { name: 'View order' }).click()
    expect(mockGate.requestCheckout).toHaveBeenCalledTimes(1)
  })

  it('prefetches checkout only for a direct-checkout pack with items in the cart', async () => {
    mockCart.items = [{ id: 'line-1' }]
    await renderRuntime(controller(), undefined, 'direct')
    expect(mockUseCartCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, hasItems: true }))
  })

  it('never prefetches for a pack whose cart drawer owns checkout', async () => {
    mockCart.items = [{ id: 'line-1' }]
    await renderRuntime(controller(), undefined, 'cart-drawer')
    expect(mockUseCartCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('shows the checkout upsell interstitial for a direct-checkout pack', async () => {
    Object.assign(mockGate, { showInterstitial: true, showUpsellModal: true })
    await renderRuntime(controller(), undefined, 'direct')
    expect(await screen.findByTestId('upsell')).toBeInTheDocument()
  })

  it('leaves the interstitial to the cart drawer for a drawer pack', async () => {
    Object.assign(mockGate, { showInterstitial: true, showUpsellModal: true })
    await renderRuntime(controller(), undefined, 'cart-drawer')
    await waitFor(() => expect(screen.getByTestId('active-order')).toBeInTheDocument())
    expect(screen.queryByTestId('upsell')).not.toBeInTheDocument()
  })
})

describe('StorefrontBottomInset', () => {
  it('reserves phone-width space at the bottom for a fixed pack bar', async () => {
    const { StorefrontBottomInset } = await import('@/storefront/runtime/storefront-runtime')
    const { container } = render(<StorefrontBottomInset mobilePx={72} />)
    expect(container.querySelector('style')?.textContent).toBe(
      '@media (max-width: 767px){:root{--storefront-bottom-inset:72px}}'
    )
  })
})
