import { render, screen } from '@testing-library/react'
import { LayoutSidebar } from '@/components/customer/layouts/layout-sidebar'
import { LayoutGridFocus } from '@/components/customer/layouts/layout-grid-focus'
import type { Tenant } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

/**
 * Every hero-bearing layout must honor a chosen hero_preset. The `sidebar` and
 * `grid-focus` layouts were the last two that never rendered StorefrontHero, so
 * a tenant on either of them saw no hero even after picking a preset. These
 * tests pin that a selected preset (split → brand-initial tile) shows up on both.
 */

const branding = {
  textPrimary: '#111111',
  textSecondary: '#666666',
  accent: '#E4572E',
  primary: '#1D1815',
  buttonPrimaryText: '#ffffff',
  searchBar: { enabled: false },
} as unknown as BrandingColors

// The sidebar layout's scroll-spy effect constructs an IntersectionObserver,
// which jsdom does not implement. Stub it so the layout can mount under test.
beforeAll(() => {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver
})

const tenant = (overrides: Partial<Tenant>): Tenant =>
  ({ id: 't1', name: 'Sunset Kitchen', ...overrides } as Tenant)

const baseProps = {
  tenantSlug: 'sunset',
  categories: [],
  filteredItems: [],
  allMenuItems: [],
  activeCategory: null,
  setActiveCategory: () => {},
  searchQuery: '',
  setSearchQuery: () => {},
  onItemSelect: () => {},
  branding,
  cardTemplate: 'classic' as never,
  currentSlide: 0,
  setCurrentSlide: () => {},
}

describe('Layout hero coverage — sidebar & grid-focus honor hero_preset', () => {
  it('sidebar renders the selected split preset tile', () => {
    render(
      <LayoutSidebar
        {...baseProps}
        tenant={tenant({ hero_preset: 'split', hero_section_enabled: true })}
      />
    )
    expect(screen.getByTestId('hero-tile-initial')).toBeInTheDocument()
  })

  it('grid-focus renders the selected split preset tile', () => {
    render(
      <LayoutGridFocus
        {...baseProps}
        isLoading={false}
        tenant={tenant({ hero_preset: 'split', hero_section_enabled: true })}
      />
    )
    expect(screen.getByTestId('hero-tile-initial')).toBeInTheDocument()
  })
})

describe('Sidebar category rail is click-to-inspect tagged', () => {
  // The sidebar renders its own category navigation rail (not the shared
  // CategorySubmenu, which carries the scope), so without an explicit tag the
  // Branding Studio's inspect mode could not select it on the sidebar layout.
  it('tags the category navigation rail with the category-nav scope', () => {
    const { container } = render(
      <LayoutSidebar
        {...baseProps}
        categories={[{ id: 'c1', name: 'Mains', icon: '🍽️' } as never]}
        tenant={tenant({ page_layout: 'sidebar' })}
      />
    )
    expect(
      container.querySelector('[data-branding-scope="storefront/category-nav"]')
    ).not.toBeNull()
  })
})
