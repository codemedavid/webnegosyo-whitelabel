/**
 * The four scroll-based catalog layouts (storefront, kiosk, rails, lookbook)
 * share one contract: every category renders as a jump target, the category
 * nav scrolls to it, and an empty search offers the way back.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { DEFAULT_BRANDING } from '@/lib/branding-utils'
import type { MenuLayoutContentProps } from '@/storefront/contracts'
import type { Category, MenuItem } from '@/types/database'

const CATEGORIES = [
  { id: 'cat-rice', name: 'Rice Meals', order: 1, is_active: true, display_layout: 'grid' },
  { id: 'cat-drinks', name: 'Drinks', order: 2, is_active: true, display_layout: 'grid' },
] as unknown as Category[]

const item = (id: string, categoryId: string, name: string): MenuItem =>
  ({
    id, tenant_id: 't', category_id: categoryId, name, description: '', price: 120,
    image_url: '', is_available: true, variations: [], addons: [], is_featured: id === 'i1',
  }) as unknown as MenuItem

const ITEMS = [
  item('i1', 'cat-rice', 'Pork Sisig'),
  item('i2', 'cat-rice', 'Chicken Adobo'),
  item('i3', 'cat-rice', 'Beef Tapa'),
  item('i4', 'cat-drinks', 'Calamansi Juice'),
]

const baseProps = (overrides: Partial<MenuLayoutContentProps> = {}): MenuLayoutContentProps => ({
  tenant: null,
  tenantSlug: 'demo',
  categories: CATEGORIES,
  filteredItems: ITEMS,
  allMenuItems: ITEMS,
  activeCategory: null,
  setActiveCategory: jest.fn(),
  searchQuery: '',
  setSearchQuery: jest.fn(),
  onItemSelect: jest.fn(),
  branding: DEFAULT_BRANDING,
  cardTemplate: 'showcase',
  currentSlide: 0,
  setCurrentSlide: jest.fn(),
  mobileGridColumns: 2,
  ...overrides,
})

const LAYOUTS: Array<[string, () => Promise<ComponentType<MenuLayoutContentProps>>]> = [
  ['storefront', async () => (await import('@/components/customer/layouts/layout-storefront')).LayoutStorefront],
  ['kiosk', async () => (await import('@/components/customer/layouts/layout-kiosk')).LayoutKiosk],
  ['rails', async () => (await import('@/components/customer/layouts/layout-rails')).LayoutRails],
  ['lookbook', async () => (await import('@/components/customer/layouts/layout-lookbook')).LayoutLookbook],
]

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

describe.each(LAYOUTS)('the %s layout', (_name, load) => {
  it('renders every category as a jump target holding its dishes', async () => {
    const Layout = await load()
    const { container } = render(<Layout {...baseProps()} />)

    const rice = container.querySelector('#category-cat-rice') as HTMLElement
    const drinks = container.querySelector('#category-cat-drinks') as HTMLElement
    expect(rice).not.toBeNull()
    expect(drinks).not.toBeNull()
    await waitFor(() => expect(within(drinks).getByRole('button', { name: 'Calamansi Juice' })).toBeInTheDocument())
  })

  it('scrolls to a category when its nav entry is chosen', async () => {
    const Layout = await load()
    render(<Layout {...baseProps()} />)
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock
    scrollIntoView.mockClear()

    const [nav] = screen.getAllByRole('navigation', { name: 'Menu categories' })
    fireEvent.click(within(nav).getByRole('button', { name: /Drinks/ }))

    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('offers the whole menu back when a search finds nothing', async () => {
    const Layout = await load()
    const setSearchQuery = jest.fn()
    render(<Layout {...baseProps({ filteredItems: [], searchQuery: 'pizza', setSearchQuery })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show the whole menu' }))

    expect(setSearchQuery).toHaveBeenCalledWith('')
  })
})
