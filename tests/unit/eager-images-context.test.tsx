/**
 * The menu client draws the layout twice when a tenant has a different card
 * template for phones — one copy hidden on desktop, the other on mobile. An
 * eager image inside a display:none copy still downloads, so marking the first
 * cards as priority in both copies would fetch four hidden images on every
 * device. The copy that is hidden on phones opts out through context; the
 * card itself is where every layout converges, so the rule cannot be skipped.
 */
import { render, screen } from '@testing-library/react'
import { MenuItemCard } from '@/components/customer/menu-item-card'
import { EagerImagesProvider } from '@/components/customer/eager-images-context'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

jest.mock('@/components/customer/card-templates', () => ({
  __esModule: true,
  CardTemplateRenderer: ({ priority }: { priority?: boolean }) => (
    // Test double exposes loading behavior without fetching an image.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="card" loading={priority ? 'eager' : 'lazy'} />
  ),
}))

const branding = { primary: '#f00' } as unknown as BrandingColors
const item = {
  id: 'a',
  name: 'Item',
  price: 1,
  variations: [],
  addons: [],
  is_available: true,
} as unknown as MenuItem

describe('MenuItemCard eager images', () => {
  it('honours priority by default', () => {
    render(<MenuItemCard item={item} onSelect={jest.fn()} branding={branding} priority />)
    expect(screen.getByRole('img').getAttribute('loading')).toBe('eager')
  })

  it('stays lazy inside a copy that opted out', () => {
    render(
      <EagerImagesProvider enabled={false}>
        <MenuItemCard item={item} onSelect={jest.fn()} branding={branding} priority />
      </EagerImagesProvider>,
    )
    expect(screen.getByRole('img').getAttribute('loading')).toBe('lazy')
  })
})
