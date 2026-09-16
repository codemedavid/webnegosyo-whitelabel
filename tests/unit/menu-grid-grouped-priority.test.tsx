/**
 * The storefront draws the menu grouped by category, not through MenuGrid —
 * SeaCook's 8s LCP was the first "Mixed Seafoods" card in the first group,
 * still `loading="lazy"`. The fold is counted across groups: the first
 * ABOVE_THE_FOLD_CARD_COUNT cards on the page are priority wherever their
 * category boundary falls, and everything after stays lazy.
 */
import { render, screen } from '@testing-library/react'
import { MenuGridGrouped } from '@/components/customer/menu-grid-grouped'
import { ABOVE_THE_FOLD_CARD_COUNT } from '@/components/customer/menu-grid'
import type { Category, MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

jest.mock('@/components/customer/menu-item-card', () => ({
  __esModule: true,
  MenuItemCard: ({ item, priority }: { item: { id: string }; priority?: boolean }) => (
    <div data-testid={`card-${item.id}`} data-priority={String(Boolean(priority))} />
  ),
}))

const branding = {
  primary: '#ff5500',
  menuCategoryHeader: '#111',
  textMuted: '#777',
} as unknown as BrandingColors

const category = (id: string, order: number): Category =>
  ({ id, tenant_id: 't-1', name: `Category ${id}`, order, is_active: true }) as unknown as Category

const item = (id: string, categoryId: string): MenuItem =>
  ({
    id,
    tenant_id: 't-1',
    category_id: categoryId,
    name: `Item ${id}`,
    price: 100,
    image_url: `https://cdn.test/${id}.png`,
    variations: [],
    addons: [],
    is_available: true,
  }) as unknown as MenuItem

describe('MenuGridGrouped above-the-fold priority', () => {
  it('counts the fold across category boundaries', () => {
    // Arrange — two cards in the first group, four in the second.
    const categories = [category('c1', 0), category('c2', 1)]
    const items = [
      item('a', 'c1'),
      item('b', 'c1'),
      item('c', 'c2'),
      item('d', 'c2'),
      item('e', 'c2'),
      item('f', 'c2'),
    ]

    // Act
    render(
      <MenuGridGrouped items={items} categories={categories} onItemSelect={jest.fn()} branding={branding} />,
    )

    // Assert
    const priorityIds = items
      .map((it) => it.id)
      .filter((id) => screen.getByTestId(`card-${id}`).getAttribute('data-priority') === 'true')
    expect(priorityIds).toEqual(items.slice(0, ABOVE_THE_FOLD_CARD_COUNT).map((it) => it.id))
  })
})
