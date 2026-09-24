/**
 * The BiteSpeed pack draws with its own token set (surface tiers, an accent
 * fill, display + body fonts), but every token is derived from the tenant's
 * branding — so a merchant's colors and font pairing still apply.
 */
import { DEFAULT_BRANDING, type BrandingColors } from '@/lib/branding-utils'
import { BITESPEED_BODY_FONT, BITESPEED_DISPLAY_FONT, bitespeedTokens } from '@/storefront/packs/bitespeed/tokens'

const branding: BrandingColors = {
  ...DEFAULT_BRANDING,
  buttonPrimary: '#ff6b00',
  buttonPrimaryText: '#ffffff',
  primary: '#a04100',
  background: '#f8f9fa',
  cards: '#ffffff',
  textPrimary: '#191c1d',
  textSecondary: '#5f5e5e',
  border: '#e2bfb0',
  headingFont: null,
  bodyFont: null,
  radius: null,
}

describe('bitespeedTokens', () => {
  it('emits only --bs-* custom properties', () => {
    for (const key of Object.keys(bitespeedTokens(branding))) expect(key).toMatch(/^--bs-/)
  })

  it('takes its accent fill, ink and page colors from the tenant branding', () => {
    const tokens = bitespeedTokens(branding)
    expect(tokens['--bs-accent']).toBe('#ff6b00')
    expect(tokens['--bs-on-accent']).toBe('#ffffff')
    expect(tokens['--bs-accent-ink']).toBe('#a04100')
    expect(tokens['--bs-bg']).toBe('#f8f9fa')
    expect(tokens['--bs-surface']).toBe('#ffffff')
    expect(tokens['--bs-text']).toBe('#191c1d')
    expect(tokens['--bs-text-muted']).toBe('#5f5e5e')
  })

  it('derives the tinted surface tiers from the tenant colors', () => {
    const tokens = bitespeedTokens(branding)
    for (const key of ['--bs-surface-low', '--bs-surface-high', '--bs-accent-soft'] as const) {
      expect(tokens[key]).toMatch(/^color-mix\(in srgb, /)
    }
    expect(tokens['--bs-accent-soft']).toContain('#ff6b00')
    expect(tokens['--bs-surface-low']).toContain('#f8f9fa')
  })

  it('uses its own display and body fonts until the tenant picks a font pairing', () => {
    expect(bitespeedTokens(branding)['--bs-font-display']).toBe(BITESPEED_DISPLAY_FONT)
    expect(bitespeedTokens(branding)['--bs-font-body']).toBe(BITESPEED_BODY_FONT)

    const paired = bitespeedTokens({ ...branding, headingFont: '"Fraunces", serif', bodyFont: '"Inter", sans-serif' })
    expect(paired['--bs-font-display']).toBe('"Fraunces", serif')
    expect(paired['--bs-font-body']).toBe('"Inter", sans-serif')
  })

  it('follows the tenant corner style when one is set', () => {
    expect(bitespeedTokens(branding)['--bs-radius']).toBe('1rem')
    expect(bitespeedTokens({ ...branding, radius: '4px' })['--bs-radius']).toBe('4px')
  })

  it('keeps a bright accent for the hero, where it sits on a dark photo scrim', () => {
    const tokens = bitespeedTokens(branding)
    expect(tokens['--bs-hero-accent']).toBe('#ff6b00')
    expect(tokens['--bs-on-hero-accent']).toBe('#ffffff')
  })

  it('lightens a dark brand accent for the hero so it stays readable on the scrim', () => {
    const tokens = bitespeedTokens({ ...branding, buttonPrimary: '#111111', buttonPrimaryText: '#ffffff' })
    expect(tokens['--bs-hero-accent']).toBe('color-mix(in srgb, #111111 18%, #ffffff)')
    expect(tokens['--bs-on-hero-accent']).toBe('#111111')
  })
})
