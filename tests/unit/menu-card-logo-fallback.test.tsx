import { render, screen } from '@testing-library/react'
import { ClassicCard } from '@/components/customer/card-templates/classic-card'
import { ModernCard } from '@/components/customer/card-templates/modern-card'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

/**
 * Menu item cards must show the tenant logo as the image fallback when an
 * item has no image_url. This is verified on two template shapes:
 *  - ClassicCard: renders the image via a `&&` guard (no explicit placeholder)
 *  - ModernCard:  renders the image via a ternary with an SVG placeholder else-branch
 */

const branding = getTenantBranding({ logo_url: 'https://cdn.test/tenant-logo.png' })

function makeItem(overrides: Partial<MenuItem>): MenuItem {
  return {
    id: 'item-1',
    tenant_id: 't-1',
    category_id: 'c-1',
    name: 'Test Burger',
    description: 'Juicy',
    price: 99,
    image_url: '',
    is_available: true,
    is_featured: false,
    order: 1,
    variations: [],
    addons: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  } as MenuItem
}

function imgSrc(): string {
  return decodeURIComponent(screen.getByRole('img').getAttribute('src') || '')
}

const noop = () => {}

describe('menu card logo fallback', () => {
  describe('ClassicCard', () => {
    it('shows the tenant logo when the item has no image', () => {
      render(<ClassicCard item={makeItem({ image_url: '' })} onSelect={noop} branding={branding} />)
      expect(imgSrc()).toContain('cdn.test/tenant-logo.png')
    })

    it('shows the item image when present', () => {
      render(
        <ClassicCard
          item={makeItem({ image_url: 'https://cdn.test/burger.png' })}
          onSelect={noop}
          branding={branding}
        />
      )
      expect(imgSrc()).toContain('cdn.test/burger.png')
    })
  })

  describe('ModernCard', () => {
    it('shows the tenant logo when the item has no image', () => {
      render(<ModernCard item={makeItem({ image_url: '' })} onSelect={noop} branding={branding} />)
      expect(imgSrc()).toContain('cdn.test/tenant-logo.png')
    })

    it('shows the item image when present', () => {
      render(
        <ModernCard
          item={makeItem({ image_url: 'https://cdn.test/burger.png' })}
          onSelect={noop}
          branding={branding}
        />
      )
      expect(imgSrc()).toContain('cdn.test/burger.png')
    })
  })
})
