/**
 * Per-category card template on the grouped customer menu.
 *
 * A category with its own `card_template` renders its cards (grid AND
 * horizontal scroll) with that template while other categories keep the
 * tenant-wide template.
 */
import { render, screen } from '@testing-library/react'
import { MenuGridGrouped } from '@/components/customer/menu-grid-grouped'
import type { Category, MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

jest.mock('@/components/customer/menu-item-card', () => ({
  __esModule: true,
  MenuItemCard: ({ item, template }: { item: { id: string }; template?: string }) => (
    <div data-testid={`card-${item.id}`} data-template={template} />
  ),
}))

jest.mock('@/components/customer/horizontal-scroll-section', () => ({
  __esModule: true,
  HorizontalScrollSection: ({ items, template }: { items: { id: string }[]; template?: string }) => (
    <div data-testid={`scroll-${items[0]?.id}`} data-template={template} />
  ),
}))

const branding = {
  primary: '#ff5500',
  menuCategoryHeader: '#111111',
  textMuted: '#777777',
} as unknown as BrandingColors

const category = (id: string, overrides: Partial<Category> = {}): Category =>
  ({
    id,
    tenant_id: 't-1',
    name: id,
    order: 0,
    is_active: true,
    display_layout: 'grid',
    created_at: '',
    updated_at: '',
    ...overrides,
  }) as Category

const item = (id: string, categoryId: string): MenuItem =>
  ({
    id,
    tenant_id: 't-1',
    category_id: categoryId,
    name: `Item ${id}`,
    description: '',
    price: 100,
    is_available: true,
  }) as unknown as MenuItem

describe('MenuGridGrouped per-category card template', () => {
  it('renders each category with its own template, falling back to the tenant template', () => {
    // Arrange
    const categories = [
      category('burgers', { card_template: 'storefront', display_layout: 'horizontal_scroll' }),
      category('drinks'),
    ]
    const items = [item('i1', 'burgers'), item('i2', 'drinks')]

    // Act
    render(
      <MenuGridGrouped
        items={items}
        categories={categories}
        onItemSelect={jest.fn()}
        branding={branding}
        template="classic"
      />
    )

    // Assert — burgers horizontal row uses its storefront override…
    expect(screen.getByTestId('scroll-i1')).toHaveAttribute('data-template', 'storefront')
    // …while drinks' grid cards keep the tenant-wide template.
    expect(screen.getByTestId('card-i2')).toHaveAttribute('data-template', 'classic')
  })

  it('uses the category template for grid cards too', () => {
    const categories = [category('burgers', { card_template: 'neon' })]
    const items = [item('i1', 'burgers')]

    render(
      <MenuGridGrouped
        items={items}
        categories={categories}
        onItemSelect={jest.fn()}
        branding={branding}
        template="classic"
      />
    )

    expect(screen.getByTestId('card-i1')).toHaveAttribute('data-template', 'neon')
  })
})
