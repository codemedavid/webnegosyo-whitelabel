/**
 * Lighthouse flagged an 8s LCP on the guest menu: every card image was
 * `loading="lazy"`, including the ones in the first viewport. The grid now
 * marks the first few cards as priority so their images load eagerly with
 * high fetch priority, while the rest stay lazy.
 */
import { render, screen } from '@testing-library/react'
import { MenuGrid, ABOVE_THE_FOLD_CARD_COUNT } from '@/components/customer/menu-grid'
import { ClassicCard } from '@/components/customer/card-templates/classic-card'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

jest.mock('@/components/customer/prefetching-card', () => ({
  __esModule: true,
  PrefetchingCard: ({ item, priority }: { item: { id: string }; priority?: boolean }) => (
    <div data-testid={`card-${item.id}`} data-priority={String(Boolean(priority))} />
  ),
}))

const branding = {
  primary: '#ff5500',
  cardsBackground: '#fff',
  cardsBorder: '#eee',
  textPrimary: '#111',
  textMuted: '#777',
} as unknown as BrandingColors

const item = (id: string): MenuItem =>
  ({
    id,
    tenant_id: 't-1',
    category_id: 'c-1',
    name: `Item ${id}`,
    description: '',
    price: 100,
    image_url: `https://cdn.test/${id}.png`,
    variations: [],
    addons: [],
    is_available: true,
  }) as unknown as MenuItem

describe('MenuGrid above-the-fold priority', () => {
  it('marks the first ABOVE_THE_FOLD_CARD_COUNT cards as priority and the rest as not', () => {
    // Arrange
    const items = Array.from({ length: ABOVE_THE_FOLD_CARD_COUNT + 2 }, (_, i) => item(`i${i}`))

    // Act
    render(<MenuGrid items={items} onItemSelect={jest.fn()} tenantSlug="seacook" branding={branding} />)

    // Assert
    items.forEach((it, index) => {
      const expected = String(index < ABOVE_THE_FOLD_CARD_COUNT)
      expect(screen.getByTestId(`card-${it.id}`).getAttribute('data-priority')).toBe(expected)
    })
  })

  it('exposes a small named constant for the fold', () => {
    expect(ABOVE_THE_FOLD_CARD_COUNT).toBe(4)
  })
})

describe('card template image loading', () => {
  it('loads eagerly with high fetch priority when the card is above the fold', () => {
    render(<ClassicCard isOrderable item={item('a')} onSelect={jest.fn()} branding={branding} priority />)

    const img = screen.getByRole('img')
    expect(img.getAttribute('loading')).toBe('eager')
    expect(img.getAttribute('fetchpriority')).toBe('high')
  })

  it('stays lazy without priority', () => {
    render(<ClassicCard isOrderable item={item('b')} onSelect={jest.fn()} branding={branding} />)

    const img = screen.getByRole('img')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('fetchpriority')).toBeNull()
  })
})
