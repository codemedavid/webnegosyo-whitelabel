import { render, screen } from '@testing-library/react'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import type { Tenant } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'

/**
 * The hero decision must be identical across every page layout: a selected
 * hero_preset renders the rich preset regardless of layout. Before this
 * component existed the preset only rendered on the `default` layout, so a
 * tenant on sidebar/mosaic/etc. saw nothing when they picked a preset.
 */

const branding = {
  textPrimary: '#111111',
  textSecondary: '#666666',
  accent: '#E4572E',
  primary: '#1D1815',
  buttonPrimaryText: '#ffffff',
} as unknown as BrandingColors

const tenant = (overrides: Partial<Tenant>): Tenant =>
  ({ id: 't1', name: 'Sunset Kitchen', ...overrides } as Tenant)

describe('StorefrontHero — layout-independent hero decision', () => {
  it('renders the selected preset (split shows a brand-initial tile)', () => {
    render(
      <StorefrontHero
        tenant={tenant({ hero_preset: 'split', hero_section_enabled: true })}
        branding={branding}
        allMenuItems={[]}
        defaultTitle="Our Menu"
      />
    )
    expect(screen.getByTestId('hero-tile-initial')).toBeInTheDocument()
  })

  it('renders the plain hero (default title) when preset is theme/unset', () => {
    render(
      <StorefrontHero
        tenant={tenant({ hero_preset: 'theme', hero_section_enabled: true })}
        branding={branding}
        allMenuItems={[]}
        defaultTitle="Our Menu"
      />
    )
    expect(screen.getByRole('heading', { name: 'Our Menu' })).toBeInTheDocument()
    expect(screen.queryByTestId('hero-tile-initial')).not.toBeInTheDocument()
  })

  it('renders nothing when the hero is disabled', () => {
    const { container } = render(
      <StorefrontHero
        tenant={tenant({ hero_preset: 'split', hero_section_enabled: false })}
        branding={branding}
        allMenuItems={[]}
        defaultTitle="Our Menu"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a v4 block-hero design (handled at the page top level)', () => {
    const { container } = render(
      <StorefrontHero
        tenant={tenant({ hero_section_enabled: true, hero_design: { version: 4 } as unknown as Record<string, unknown> })}
        branding={branding}
        allMenuItems={[]}
        defaultTitle="Our Menu"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('requireExplicit suppresses the plain fallback but still shows a chosen preset', () => {
    const { container, rerender } = render(
      <StorefrontHero
        tenant={tenant({ hero_preset: 'theme', hero_section_enabled: true })}
        branding={branding}
        allMenuItems={[]}
        defaultTitle="Our Menu"
        requireExplicit
      />
    )
    // No explicit hero choice → nothing (layouts that historically had no hero).
    expect(container).toBeEmptyDOMElement()

    rerender(
      <StorefrontHero
        tenant={tenant({ hero_preset: 'split', hero_section_enabled: true })}
        branding={branding}
        allMenuItems={[]}
        defaultTitle="Our Menu"
        requireExplicit
      />
    )
    // Explicit preset chosen → it renders even under requireExplicit.
    expect(screen.getByTestId('hero-tile-initial')).toBeInTheDocument()
  })
})
