import { render, screen } from '@testing-library/react'
import { HeroPresetSection } from '@/components/customer/hero-preset'
import { StorefrontHero } from '@/components/customer/storefront-hero'
import { getTenantBranding } from '@/lib/branding-utils'
import {
  BRANDING_SURFACES,
  BRANDING_FIELD_INDEX,
  resolveFieldValue,
} from '@/lib/branding-registry'
import { resolveBrandingScope, getScopeSectionIndex } from '@/lib/branding-inspect'
import type { Tenant } from '@/types/database'

/**
 * Hero element colors: the kicker, CTA buttons and the hero section
 * background were hardwired to the global accent palette, so merchants could
 * not style them individually. Each element gets its own tenant column,
 * editable in the Branding Studio's Hero section and clickable in inspect
 * mode.
 */

const NEW_FIELDS: Record<string, string | undefined> = {
  hero_background_color: undefined,
  hero_kicker_color: 'accent_color',
  hero_cta_primary_color: 'accent_color',
  hero_cta_primary_text_color: 'button_primary_text_color',
  hero_cta_secondary_text_color: 'hero_title_color',
}

describe('hero element fields in the branding registry', () => {
  const heroSection = BRANDING_SURFACES.find((s) => s.id === 'storefront')!.sections.find(
    (s) => s.title === 'Hero'
  )!

  it.each(Object.entries(NEW_FIELDS))(
    '%s is an editable Hero color field inheriting from %s',
    (fieldId, inheritsFrom) => {
      const field = BRANDING_FIELD_INDEX[fieldId]
      expect(field).toBeDefined()
      expect(field.type).toBe('color')
      expect(field.inheritsFrom).toBe(inheritsFrom)
      expect(heroSection.fields.some((f) => f.id === fieldId)).toBe(true)
    }
  )

  it('falls back through the inherit chain when unset', () => {
    // Nothing set anywhere → accent default.
    expect(resolveFieldValue('hero_cta_primary_color', {}, {})).toBe('#ffd700')
    // Tenant accent set → CTA inherits it.
    expect(resolveFieldValue('hero_cta_primary_color', {}, { accent_color: '#123456' })).toBe(
      '#123456'
    )
    // Explicit CTA color wins.
    expect(
      resolveFieldValue('hero_cta_primary_color', { hero_cta_primary_color: '#ff0000' }, {})
    ).toBe('#ff0000')
  })
})

describe('hero element inspect scopes', () => {
  it.each([
    ['storefront/hero-kicker', 'hero_kicker_color'],
    ['storefront/hero-cta-primary', 'hero_cta_primary_color'],
    ['storefront/hero-cta-secondary', 'hero_cta_secondary_text_color'],
  ])('%s resolves to the Hero section and %s', (scopeKey, fieldId) => {
    const target = resolveBrandingScope(scopeKey)
    expect(target).not.toBeNull()
    expect(target?.sectionTitle).toBe('Hero')
    expect(target?.fieldId).toBe(fieldId)
    expect(getScopeSectionIndex(target!)).toBeGreaterThanOrEqual(0)
  })
})

describe('HeroPresetSection element color overrides', () => {
  const baseProps = {
    title: 'Sunset Kitchen',
    description: 'Fresh plates, wood-fired daily.',
    titleColor: '#1D1815',
    descriptionColor: '#8A7B70',
    accentColor: '#E4572E',
  }

  it('applies kicker, CTA and background overrides on the editorial preset', () => {
    const { container } = render(
      <HeroPresetSection
        {...baseProps}
        preset="editorial"
        kicker="Now serving"
        ctaPrimaryLabel="Order Now"
        ctaSecondaryLabel="View Menu"
        kickerColor="#00ff00"
        ctaPrimaryColor="#111199"
        ctaPrimaryTextColor="#ffeeee"
        ctaSecondaryTextColor="#995500"
        sectionBackground="#fafafa"
      />
    )
    expect(screen.getByText('Now serving')).toHaveStyle({ color: '#00ff00' })
    expect(screen.getByRole('button', { name: 'Order Now' })).toHaveStyle({
      background: '#111199',
      color: '#ffeeee',
    })
    expect(screen.getByRole('button', { name: 'View Menu' })).toHaveStyle({ color: '#995500' })
    expect(container.querySelector('[data-branding-scope="storefront/hero-kicker"]')).not.toBeNull()
    expect(
      container.querySelector('[data-branding-scope="storefront/hero-cta-primary"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-branding-scope="storefront/hero-cta-secondary"]')
    ).not.toBeNull()
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveStyle({ background: '#fafafa' })
  })

  it('keeps the accent-driven defaults when no overrides are set', () => {
    render(
      <HeroPresetSection {...baseProps} preset="editorial" kicker="Now serving" ctaPrimaryLabel="Order Now" />
    )
    expect(screen.getByText('Now serving')).toHaveStyle({ color: '#E4572E' })
    expect(screen.getByRole('button', { name: 'Order Now' })).toHaveStyle({
      background: '#E4572E',
    })
  })
})

describe('StorefrontHero passes tenant hero element colors through', () => {
  const tenant = {
    hero_section_enabled: true,
    hero_preset: 'editorial',
    hero_kicker: 'Now serving',
    hero_title: 'Sunset Kitchen',
    hero_description: 'Fresh plates.',
    hero_cta_primary_label: 'Order Now',
    hero_cta_secondary_label: 'View Menu',
    hero_background_color: '#fff7ef',
    hero_kicker_color: '#00aa00',
    hero_cta_primary_color: '#222299',
    hero_cta_primary_text_color: '#f0f0f0',
    hero_cta_secondary_text_color: '#884400',
  } as unknown as Tenant

  it('renders the preset with the tenant overrides applied', () => {
    const { container } = render(
      <StorefrontHero tenant={tenant} branding={getTenantBranding(null)} />
    )
    expect(screen.getByText('Now serving')).toHaveStyle({ color: '#00aa00' })
    expect(screen.getByRole('button', { name: 'Order Now' })).toHaveStyle({
      background: '#222299',
      color: '#f0f0f0',
    })
    expect(screen.getByRole('button', { name: 'View Menu' })).toHaveStyle({ color: '#884400' })
    const wrapper = container.querySelector('[data-branding-scope="storefront/hero"]')
    expect(wrapper).not.toBeNull()
    const presetRoot = wrapper!.firstElementChild as HTMLElement
    expect(presetRoot).toHaveStyle({ background: '#fff7ef' })
  })
})
