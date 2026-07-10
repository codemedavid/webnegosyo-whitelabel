import { render } from '@testing-library/react'
import { MenuItemCard } from '@/components/customer/menu-item-card'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

/**
 * Regression test for click-to-inspect on menu cards.
 *
 * Only the default/sidebar layouts render cards through the tagged MenuGrid;
 * grid-focus, magazine, mosaic and the horizontal-scroll sections render
 * MenuItemCard directly, so the inspector found no data-branding-scope
 * ancestor and clicking a card opened nothing. The tag must live on
 * MenuItemCard's own wrapper so every layout is covered.
 */

const item: MenuItem = {
  id: 'item-1',
  tenant_id: 't-1',
  category_id: 'c-1',
  name: 'Test Burger',
  description: 'Juicy',
  base_price: 99,
  image_url: null,
  is_available: true,
  is_featured: false,
  order: 1,
  variations: [],
  addons: [],
  created_at: '',
  updated_at: '',
} as unknown as MenuItem

describe('MenuItemCard click-to-inspect tag', () => {
  it('tags its wrapper with the cards scope regardless of layout', () => {
    const { container } = render(
      <MenuItemCard
        item={item}
        onSelect={jest.fn()}
        branding={getTenantBranding(null)}
        template="classic"
      />
    )

    expect(
      container.querySelector('[data-branding-scope="storefront/cards"]')
    ).not.toBeNull()
  })
})
