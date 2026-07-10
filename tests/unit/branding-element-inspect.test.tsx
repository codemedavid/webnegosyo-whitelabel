import { render, screen } from '@testing-library/react'
import {
  HeaderLogo,
  HeaderTitle,
  HeaderCartButton,
} from '@/components/customer/header-templates/header-parts'
import { HeroPresetSection } from '@/components/customer/hero-preset'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { getTenantBranding } from '@/lib/branding-utils'

/**
 * Click-to-inspect element tagging.
 *
 * Inspect mode can only highlight elements that carry a data-branding-scope
 * attribute, so each specific storefront element (not just its section
 * wrapper) must be tagged with its element-level scope. These tests cover the
 * shared header parts and the hero (all presets render title/description
 * through the same tagged pieces); the cart drawer, quick-view modal and
 * product-detail page are tagged in their own components and guarded by the
 * scope-map tests in branding-inspect.test.ts.
 */

const branding = getTenantBranding(null)

function scoped(container: HTMLElement, scope: string): Element | null {
  return container.querySelector(`[data-branding-scope="${scope}"]`)
}

describe('header element tags', () => {
  it('tags the logo with the header-logo scope', () => {
    const { container } = render(
      <HeaderLogo tenant={null} tenantSlug="demo" branding={branding} shape="circle" />
    )
    expect(scoped(container, 'storefront/header-logo')).not.toBeNull()
  })

  it('tags the business name and tagline with their own scopes', () => {
    const { container } = render(
      <HeaderTitle
        name="Sunset Kitchen"
        tagline="Fresh daily"
        taglineColor="#999999"
        titleColor="#111111"
      />
    )
    expect(scoped(container, 'storefront/header-title')).not.toBeNull()
    expect(scoped(container, 'storefront/header-tagline')).not.toBeNull()
  })

  it('tags the cart button with the header-cart scope', () => {
    const { container } = render(
      <HeaderCartButton itemCount={2} onClick={jest.fn()} branding={branding} />
    )
    expect(scoped(container, 'storefront/header-cart')).not.toBeNull()
  })
})

describe('hero element tags', () => {
  const baseProps = {
    title: 'Sunset Kitchen',
    description: 'Fresh plates, wood-fired daily.',
    titleColor: '#1D1815',
    descriptionColor: '#8A7B70',
    accentColor: '#E4572E',
  }

  it.each(['editorial', 'centered', 'split', 'banner', 'collage', 'minimal'] as const)(
    '%s preset tags its title and description elements',
    (preset) => {
      const { container } = render(<HeroPresetSection {...baseProps} preset={preset} />)
      expect(scoped(container, 'storefront/hero-title')).not.toBeNull()
      expect(scoped(container, 'storefront/hero-description')).not.toBeNull()
    }
  )

  it('plain fallback hero tags its title and description', () => {
    const { container } = render(
      <StorefrontHero tenant={null} branding={branding} />
    )
    expect(scoped(container, 'storefront/hero-title')).not.toBeNull()
    expect(scoped(container, 'storefront/hero-description')).not.toBeNull()
    expect(screen.getByText('Our Menu')).toBeInTheDocument()
  })
})
