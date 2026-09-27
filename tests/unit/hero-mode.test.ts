import { shouldUseCustomHero, isConcreteHeroPreset, isFullBleedHeroBand } from '@/lib/hero-mode'

/**
 * The Branding Studio exposes hero styles as a single dropdown. Alongside the
 * built-in presets (centered, editorial, split, …) merchants can now pick
 * "custom" to render the layout they built in the Hero Designer
 * (tenant.hero_design). shouldUseCustomHero is the pure decision that the
 * storefront hero uses to choose between the custom design and a preset.
 *
 * Backward-compat requirement: tenants who built a custom hero BEFORE this
 * feature never touched hero_preset (it stays 'theme'/null). Their saved
 * hero_design must keep rendering, so a design + default preset still counts
 * as custom.
 */
describe('isConcreteHeroPreset', () => {
  it('is true for the named rich presets', () => {
    expect(isConcreteHeroPreset('centered')).toBe(true)
    expect(isConcreteHeroPreset('editorial')).toBe(true)
    expect(isConcreteHeroPreset('minimal')).toBe(true)
  })

  it('is false for the theme default, custom, and unknown values', () => {
    expect(isConcreteHeroPreset('theme')).toBe(false)
    expect(isConcreteHeroPreset('custom')).toBe(false)
    expect(isConcreteHeroPreset('nonsense')).toBe(false)
    expect(isConcreteHeroPreset(undefined)).toBe(false)
    expect(isConcreteHeroPreset(null)).toBe(false)
  })
})

describe('shouldUseCustomHero', () => {
  const design = { version: 3, elements: [{ id: 'e1' }] }

  it('returns false for a null/undefined tenant', () => {
    expect(shouldUseCustomHero(null)).toBe(false)
    expect(shouldUseCustomHero(undefined)).toBe(false)
  })

  it('returns false when there is no hero_design, even if "custom" is selected', () => {
    expect(shouldUseCustomHero({ hero_preset: 'custom', hero_design: null })).toBe(false)
    expect(shouldUseCustomHero({ hero_preset: 'custom', hero_design: {} })).toBe(false)
  })

  it('returns true when "custom" is explicitly selected and a design exists', () => {
    expect(shouldUseCustomHero({ hero_preset: 'custom', hero_design: design })).toBe(true)
  })

  it('returns false when a concrete preset is chosen — the template beats a lingering design', () => {
    expect(shouldUseCustomHero({ hero_preset: 'centered', hero_design: design })).toBe(false)
    expect(shouldUseCustomHero({ hero_preset: 'split', hero_design: design })).toBe(false)
  })

  it('returns true for the legacy case: a saved design with the default/blank preset', () => {
    expect(shouldUseCustomHero({ hero_preset: 'theme', hero_design: design })).toBe(true)
    expect(shouldUseCustomHero({ hero_preset: null, hero_design: design })).toBe(true)
    expect(shouldUseCustomHero({ hero_design: design })).toBe(true)
  })
})

/**
 * A preset hero with a background color renders as a full-bleed band flush
 * under the header, so the storefront drops <main>'s top padding for it.
 */
describe('isFullBleedHeroBand', () => {
  const colored = { hero_preset: 'editorial', hero_background_color: '#2A6FDB' }

  it('is true for a concrete preset with a background color', () => {
    expect(isFullBleedHeroBand(colored)).toBe(true)
    expect(isFullBleedHeroBand({ ...colored, hero_preset: 'centered' })).toBe(true)
  })

  it('is false without a background color', () => {
    expect(isFullBleedHeroBand({ ...colored, hero_background_color: null })).toBe(false)
    expect(isFullBleedHeroBand({ ...colored, hero_background_color: '' })).toBe(false)
  })

  it('is false for the banner card, the theme default, and custom designs', () => {
    expect(isFullBleedHeroBand({ ...colored, hero_preset: 'banner' })).toBe(false)
    expect(isFullBleedHeroBand({ ...colored, hero_preset: 'theme' })).toBe(false)
    expect(isFullBleedHeroBand({ ...colored, hero_preset: 'custom', hero_design: { version: 4 } })).toBe(false)
  })

  it('is false when the hero is disabled or there is no tenant', () => {
    expect(isFullBleedHeroBand({ ...colored, hero_section_enabled: false })).toBe(false)
    expect(isFullBleedHeroBand(null)).toBe(false)
  })
})
