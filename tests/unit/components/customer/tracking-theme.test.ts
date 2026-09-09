/**
 * The order-tracking page's theme: the tenant's branding turned into the CSS
 * variables the tracking dashboard paints with. Every colour on the page must
 * trace back to a tenant field, so a merchant's storefront and their tracking
 * page read as one product.
 */
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { DEFAULT_BRANDING, type BrandingColors } from '@/lib/branding-utils'

function branding(overrides: Partial<BrandingColors> = {}): BrandingColors {
  return { ...DEFAULT_BRANDING, ...overrides }
}

describe('buildTrackingTheme', () => {
  it('uses the tenant primary colour as the page accent', () => {
    const theme = buildTrackingTheme(branding({ primary: '#c2410c' })) as Record<string, string>
    expect(theme['--trk-accent']).toBe('#c2410c')
    expect(theme['--trk-accent-soft']).toMatch(/^rgba\(194, 65, 12, /)
    expect(theme['--trk-accent-strong']).not.toBe('#c2410c')
  })

  it('picks readable text for content painted on the accent', () => {
    expect((buildTrackingTheme(branding({ primary: '#111111' })) as Record<string, string>)['--trk-on-accent']).toBe('#ffffff')
    expect((buildTrackingTheme(branding({ primary: '#fde68a' })) as Record<string, string>)['--trk-on-accent']).toBe('#000000')
  })

  it('carries the storefront surface and text colours through', () => {
    const theme = buildTrackingTheme(
      branding({ background: '#fff7ed', cards: '#ffffff', cardsBorder: '#fed7aa', textPrimary: '#431407', textSecondary: '#9a3412' }),
    ) as Record<string, string>
    expect(theme['--trk-bg']).toBe('#fff7ed')
    expect(theme['--trk-card']).toBe('#ffffff')
    expect(theme['--trk-card-border']).toBe('#fed7aa')
    expect(theme['--trk-text']).toBe('#431407')
    expect(theme['--trk-text-muted']).toBe('#9a3412')
  })

  it('uses the tenant button colours for the call to action', () => {
    const theme = buildTrackingTheme(branding({ buttonPrimary: '#0f766e', buttonPrimaryText: '#ecfeff' })) as Record<string, string>
    expect(theme['--trk-cta']).toBe('#0f766e')
    expect(theme['--trk-on-cta']).toBe('#ecfeff')
  })

  it('still emits every storefront brand variable', () => {
    const theme = buildTrackingTheme(branding()) as Record<string, string>
    expect(theme['--brand-primary']).toBe(DEFAULT_BRANDING.primary)
    expect(theme['--brand-success']).toBe(DEFAULT_BRANDING.success)
  })
})
