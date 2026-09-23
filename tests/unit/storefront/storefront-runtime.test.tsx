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

async function renderRuntime(menu: StorefrontMenuController, page = <main data-testid="pack-page" />) {
  const { StorefrontRuntime } = await import('@/storefront/runtime/storefront-runtime')
  return render(<StorefrontRuntime menu={menu}>{page}</StorefrontRuntime>)
}

beforeEach(() => { mockDraft.current = null })

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
