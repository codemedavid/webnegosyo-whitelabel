/**
 * The list layout's compact row is a fourteenth card surface.
 *
 * It is not one of the thirteen registered card templates, so
 * `card-template-orderability.test.tsx` never saw it — and it hand-rolled its
 * own thumbnail/price/"+" markup without ever asking whether the dish could be
 * ordered. An out-of-stock dish rendered a live "+" on the list layout while
 * every other layout greyed it out, and `is_available: undefined` (a dropped
 * column projection) was indistinguishable from in stock only by luck.
 *
 * Same contract as the card templates, asserted on the extracted row.
 */

import { render, screen } from '@testing-library/react'
import { MenuListRow } from '@/components/customer/layouts/menu-list-row'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

const MOCK_REFUSED_ITEM_ID = 'refused-for-another-reason'

jest.mock('@/lib/menu-item-availability', () => ({
  isMenuItemOrderable: (item: { id?: string; is_available?: boolean | null }) =>
    item.id !== MOCK_REFUSED_ITEM_ID && item.is_available !== false,
}))

const branding = {
  primary: '#111111',
  cards: '#ffffff',
  cardTitle: '#111111',
  cardDescription: '#666666',
  cardPrice: '#111111',
  textMuted: '#888888',
  border: '#eeeeee',
} as unknown as BrandingColors

const buildItem = (overrides: Partial<MenuItem> = {}): MenuItem =>
  ({
    id: 'orderable-item',
    tenant_id: 'tenant-1',
    category_id: 'category-1',
    name: 'Adobo Rice Bowl',
    description: 'House adobo over garlic rice',
    price: 180,
    discounted_price: null,
    image_url: null,
    is_featured: false,
    variations: [],
    badge_text: null,
    ...overrides,
  }) as unknown as MenuItem

const renderRow = (item: MenuItem, props: Record<string, unknown> = {}) =>
  render(
    <MenuListRow
      item={item}
      onSelect={jest.fn()}
      branding={branding}
      formatPrice={(value: number) => `₱${value}`}
      {...props}
    />,
  )

describe('MenuListRow', () => {
  it('offers a dish whose availability flag was never set', () => {
    renderRow(buildItem({ is_available: undefined }))

    expect(screen.queryByText('Unavailable')).toBeNull()
    expect(screen.getByLabelText(/add adobo rice bowl/i)).toBeInTheDocument()
  })

  it('refuses a dish the availability rule rejects for a reason other than the flag', () => {
    renderRow(buildItem({ id: MOCK_REFUSED_ITEM_ID, is_available: true }))

    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByLabelText(/add adobo rice bowl/i)).toBeNull()
  })

  it('marks an explicitly out-of-stock dish rather than hiding it', () => {
    renderRow(buildItem({ is_available: false }))

    // Still listed — `is_available: false` means out of stock, not deleted.
    expect(screen.getByText('Adobo Rice Bowl')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('shows the sale price with the original struck through', () => {
    renderRow(buildItem({ price: 180, discounted_price: 150 }))

    expect(screen.getByText('₱150')).toBeInTheDocument()
    expect(screen.getByText('₱180')).toBeInTheDocument()
  })

  it('ignores a discounted_price that is not actually a discount', () => {
    renderRow(buildItem({ price: 180, discounted_price: 200 }))

    expect(screen.getByText('₱180')).toBeInTheDocument()
    expect(screen.queryByText('₱200')).toBeNull()
  })

  it('shows the menu-engineering badge only when the feature is on', () => {
    const item = buildItem({ badge_text: 'Chef pick' })

    const { unmount } = renderRow(item, { menuEngineeringEnabled: false })
    expect(screen.queryByText('Chef pick')).toBeNull()
    unmount()

    renderRow(item, { menuEngineeringEnabled: true })
    expect(screen.getByText('Chef pick')).toBeInTheDocument()
  })
})
