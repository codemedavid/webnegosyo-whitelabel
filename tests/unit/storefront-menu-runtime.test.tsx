import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MenuClient } from '@/app/[tenant]/menu/menu-client'
import { createTestMenuItem } from '../fixtures/menu-item.fixture'
import type { Tenant, MenuItem } from '@/types/database'

const mockAddItem = jest.fn()
const mockSetTenant = jest.fn()
const mockPush = jest.fn()
const mockLayoutRender = jest.fn()
const mockHeaderRender = jest.fn()
const mockSheetRender = jest.fn()
const mockBundleRender = jest.fn()
const mockCartRender = jest.fn()
const mockStatus = { isOrderingBlocked: false, nextOpenLabel: null }
let mockMobile = false
const mockMediaListeners = new Set<() => void>()

// useSearchParams comes with TableLinkCapture, which the menu mounts to read a
// scanned table's ?table= — a mock without it fails every render in this file.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/hooks/useCart', () => ({ useCart: () => ({ addItem: mockAddItem, item_count: 0, items: [], bundleItems: [], setTenantContext: mockSetTenant }) }))
jest.mock('@/hooks/use-store-open-status', () => ({ useStoreOpenStatus: () => mockStatus }))
jest.mock('@/hooks/use-outlet-selection', () => ({ useOutletSelection: () => ({ outlet: null }) }))
jest.mock('@/components/customer/layouts', () => ({ MenuLayout: (props: { layout: string; filteredItems: MenuItem[]; onItemSelect: (item: MenuItem) => void }) => {
  mockLayoutRender(props)
  return <div data-testid="menu-layout" data-layout={props.layout}>{props.filteredItems.map(item => <button key={item.id} onClick={() => props.onItemSelect(item)}>{item.name}</button>)}</div>
} }))
jest.mock('@/components/customer/header-templates', () => ({ MenuHeaderRenderer: (props: { onSearchChange: (query: string) => void; onCartClick: () => void }) => {
  mockHeaderRender(props)
  return <header><input aria-label="Search" onChange={event => props.onSearchChange(event.target.value)} /><button onClick={props.onCartClick}>Cart</button></header>
} }))
jest.mock('@/components/customer/cart-drawer', () => ({ CartDrawer: (props: unknown) => { mockCartRender(props); return <div data-testid="cart" /> } }))
jest.mock('@/components/customer/product-detail-sheet', () => ({ ProductDetailSheet: (props: unknown) => { mockSheetRender(props); return <div data-testid="sheet" /> } }))
jest.mock('@/components/customer/bundle-wizard', () => ({ BundleWizard: (props: unknown) => { mockBundleRender(props); return <div data-testid="bundle" /> } }))
jest.mock('next/dynamic', () => {
  const React = jest.requireActual('react')
  return (load: () => Promise<unknown>) => {
    const Lazy = React.lazy(load)
    return function LazyView(props: unknown) { return React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props)) }
  }
})
jest.mock('@/components/customer/block-hero-renderer', () => ({ BlockHeroRenderer: () => <div data-testid="block-hero" /> }))
jest.mock('@/components/customer/category-submenu', () => ({ CategorySubmenu: () => null }))
jest.mock('@/components/customer/announcement-bar', () => ({ AnnouncementBar: () => null }))
jest.mock('@/components/customer/store-closed-banner', () => ({ StoreClosedBanner: () => null }))
jest.mock('@/components/customer/branding-inspector', () => ({ BrandingInspector: () => null }))
jest.mock('@/components/customer/active-order-banner', () => ({ ActiveOrderBanner: () => null }))
jest.mock('@/components/customer/outlet-gate', () => ({ OutletGate: () => null }))
jest.mock('@/components/customer/flash-screen-loader', () => ({ FlashScreenLoader: () => null }))
jest.mock('@/components/customer/background-overlay-layer', () => ({ BackgroundOverlayLayer: () => null }))

const tenant = { id: 'test-tenant-1', slug: 'test', name: 'Test', page_layout: 'default', mobile_page_layout: 'sidebar' } as Tenant
const item = createTestMenuItem()
const base = { tenant, tenantSlug: 'test', categories: [], allMenuItems: [item], bundles: [], outlets: [], isBrandAdmin: false, error: null }

beforeEach(() => {
  jest.clearAllMocks()
  mockMediaListeners.clear()
  mockMobile = false
  mockStatus.isOrderingBlocked = false
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  window.matchMedia = jest.fn().mockImplementation(() => ({
    get matches() { return mockMobile },
    addEventListener: (_: string, callback: () => void) => { mockMediaListeners.add(callback) },
    removeEventListener: (_: string, callback: () => void) => { mockMediaListeners.delete(callback) },
  }))
})

it('mounts one menu presentation when desktop and mobile layouts differ', async () => {
  render(<MenuClient {...base} />)
  await waitFor(() => expect(screen.getAllByTestId('menu-layout')).toHaveLength(1))
  expect(screen.getByTestId('menu-layout')).toHaveAttribute('data-layout', 'default')
})

it('renders a load error instead of a successful empty catalog for detailed server errors', () => {
  render(<MenuClient {...base} error="Failed to load menu data (items: database unavailable)" />)
  expect(screen.getByRole('heading', { name: 'Unable to load menu' })).toBeInTheDocument()
  expect(screen.queryByTestId('menu-layout')).not.toBeInTheDocument()
  expect(screen.queryByText(/database unavailable/)).not.toBeInTheDocument()
})

it('does not render a stale block hero when a preset was selected', () => {
  render(<MenuClient {...base} tenant={{ ...tenant, hero_preset: 'split', hero_design: { version: 4 } }} />)
  expect(screen.queryByTestId('block-hero')).not.toBeInTheDocument()
})

it('does not mount shopping overlays before the customer opens one', async () => {
  render(<MenuClient {...base} />)
  await act(async () => {})
  expect(mockSheetRender).not.toHaveBeenCalled()
  expect(mockBundleRender).not.toHaveBeenCalled()
  expect(mockCartRender).not.toHaveBeenCalled()
})

it('opens customization for unified modifiers instead of quick-adding', async () => {
  render(<MenuClient {...base} allMenuItems={[{ ...item, modifier_groups: [{ id: 'g', name: 'Size', options: [], display_order: 0, min_select: 1, max_select: 1 }] } as MenuItem]} />)
  fireEvent.click(screen.getAllByText(item.name)[0])
  await waitFor(() => expect(screen.getByTestId('sheet')).toBeInTheDocument())
  expect(mockAddItem).not.toHaveBeenCalled()
})

it('keeps unavailable items unorderable through the shared selection command', () => {
  render(<MenuClient {...base} allMenuItems={[{ ...item, is_available: false }]} />)
  fireEvent.click(screen.getAllByText(item.name)[0])
  expect(mockAddItem).not.toHaveBeenCalled()
})

it('quick-adds a plain available item once', () => {
  render(<MenuClient {...base} />)
  fireEvent.click(screen.getAllByText(item.name)[0])
  expect(mockAddItem).toHaveBeenCalledTimes(1)
})

it('blocks product selection when branch data failed', () => {
  render(<MenuClient {...base} tenant={{ ...tenant, multi_branch_enabled: true }} outletsFailed />)
  fireEvent.click(screen.getAllByText(item.name)[0])
  expect(mockAddItem).not.toHaveBeenCalled()
})


it('switches the single presentation on viewport change without resetting the cart', () => {
  render(<MenuClient {...base} />)
  act(() => { mockMobile = true; mockMediaListeners.forEach(listener => listener()) })
  expect(screen.getAllByTestId('menu-layout')).toHaveLength(1)
  expect(screen.getByTestId('menu-layout')).toHaveAttribute('data-layout', 'sidebar')
  expect(mockSetTenant).toHaveBeenCalledTimes(1)
})

it('does not rebind cart identity for a branding-only change', () => {
  const { rerender } = render(<MenuClient {...base} />)
  rerender(<MenuClient {...base} tenant={{ ...tenant, primary_color: '#ff0000' }} />)
  expect(mockSetTenant).toHaveBeenCalledTimes(1)
})

it('closes a product overlay when changing tenants', async () => {
  const { rerender } = render(<MenuClient {...base} allMenuItems={[{ ...item, presell_enabled: true }]} />)
  fireEvent.click(screen.getByText(item.name))
  await waitFor(() => expect(screen.getByTestId('sheet')).toBeInTheDocument())
  rerender(<MenuClient {...base} tenant={{ ...tenant, id: 'tenant-b', slug: 'other' }} tenantSlug="other" />)
  expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  expect(mockSetTenant).toHaveBeenLastCalledWith('tenant-b', 'other')
})

it('debounces search and preserves featured ranking without mutating server items', () => {
  jest.useFakeTimers()
  const items = [createTestMenuItem({ id: 'a', name: 'Rice', order: 0 }), createTestMenuItem({ id: 'b', name: 'Rice Special', is_featured: true, order: 2 })]
  const { unmount } = render(<MenuClient {...base} allMenuItems={items} />)
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Cart', 'Rice Special', 'Rice'])
  fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'special' } })
  act(() => { jest.advanceTimersByTime(200) })
  expect(screen.queryByText('Rice')).not.toBeInTheDocument()
  expect(items.map(item => item.id)).toEqual(['a', 'b'])
  unmount()
  expect(jest.getTimerCount()).toBe(0)
  jest.useRealTimers()
})

describe('storefront pack selection', () => {
  it.each([undefined, '', 'garbage', 'legacy'])('renders the legacy storefront for pack %p', async (pack) => {
    render(<MenuClient {...base} tenant={{ ...tenant, storefront_pack: pack } as Tenant} />)
    await waitFor(() => expect(screen.getByTestId('menu-layout')).toBeInTheDocument())
  })

  it('registers a menu page for every storefront pack', async () => {
    const { STOREFRONT_PACK_IDS } = await import('@/lib/storefront-packs')
    const { STOREFRONT_PACK_PAGES } = await import('@/storefront/packs/registry')
    for (const id of STOREFRONT_PACK_IDS) expect(STOREFRONT_PACK_PAGES[id].menu).toBeDefined()
  })
})

describe('the tenant home page', () => {
  it('shows the menu for a pack without a home page', async () => {
    render(<MenuClient {...base} page="home" />)
    await waitFor(() => expect(screen.getByTestId('menu-layout')).toBeInTheDocument())
  })
})
