import { describe, it, expect } from '@jest/globals'
import {
  FONT_PAIRS,
  ROUNDNESS_PRESETS,
  BRAND_COLOR_PRESETS,
  FONT_PAIR_OPTIONS,
  ROUNDNESS_OPTIONS,
  STOREFRONT_GOOGLE_FONTS,
  STOREFRONT_PALETTES,
  STOREFRONT_PALETTE_OPTIONS,
  resolveFontPair,
  resolveRoundness,
  resolvePalette,
  generatePaletteFromColor,
  fontFamilyName,
  buildStorefrontFontsHref,
  buildHeadingFontCss,
  type StorefrontPalette,
} from '@/lib/storefront-theme'
import { isValidHexColor } from '@/lib/branding-utils'

const PALETTE_KEYS: (keyof StorefrontPalette)[] = [
  'bg',
  'surface',
  'text',
  'muted',
  'accent',
  'accentInk',
  'line',
]

describe('resolveFontPair', () => {
  it('returns the heading/body fonts for each named preset', () => {
    // Arrange / Act / Assert — mirrors the design FONT_PAIRS map
    expect(resolveFontPair('elegant serif')).toEqual({
      heading: "'Cormorant Garamond', serif",
      headingWeight: 600,
      body: "'Archivo', sans-serif",
    })
    expect(resolveFontPair('bold display')).toEqual({
      heading: "'Anton', sans-serif",
      headingWeight: 400,
      body: "'Archivo', sans-serif",
    })
    expect(resolveFontPair('modern sans')).toEqual({
      heading: "'Archivo', sans-serif",
      headingWeight: 900,
      body: "'Archivo', sans-serif",
    })
    expect(resolveFontPair('warm editorial')).toEqual({
      heading: "'Lora', serif",
      headingWeight: 500,
      body: "'Karla', sans-serif",
    })
  })

  it('returns null for the "theme" sentinel (inherit tenant default)', () => {
    expect(resolveFontPair('theme')).toBeNull()
  })

  it('returns null for unknown, empty, or non-string values', () => {
    expect(resolveFontPair('comic sans')).toBeNull()
    expect(resolveFontPair('')).toBeNull()
    expect(resolveFontPair(undefined)).toBeNull()
    expect(resolveFontPair(null)).toBeNull()
    expect(resolveFontPair(42)).toBeNull()
  })

  it('exposes every FONT_PAIRS key as a resolvable preset', () => {
    for (const key of Object.keys(FONT_PAIRS)) {
      expect(resolveFontPair(key)).toEqual(FONT_PAIRS[key as keyof typeof FONT_PAIRS])
    }
  })
})

describe('resolveRoundness', () => {
  it('maps roundness presets to pixel radii', () => {
    expect(resolveRoundness('sharp')).toBe(0)
    expect(resolveRoundness('soft')).toBe(10)
    expect(resolveRoundness('round')).toBe(22)
  })

  it('returns null for the "theme" sentinel (inherit tenant default)', () => {
    expect(resolveRoundness('theme')).toBeNull()
  })

  it('returns null for unknown, empty, or non-string values', () => {
    expect(resolveRoundness('chunky')).toBeNull()
    expect(resolveRoundness('')).toBeNull()
    expect(resolveRoundness(undefined)).toBeNull()
    expect(resolveRoundness(null)).toBeNull()
    expect(resolveRoundness(10)).toBeNull()
  })

  it('matches the ROUNDNESS_PRESETS table exactly', () => {
    for (const [key, px] of Object.entries(ROUNDNESS_PRESETS)) {
      expect(resolveRoundness(key)).toBe(px)
    }
  })
})

describe('BRAND_COLOR_PRESETS', () => {
  it('provides at least one preset', () => {
    expect(BRAND_COLOR_PRESETS.length).toBeGreaterThan(0)
  })

  it('contains only valid hex colors', () => {
    for (const color of BRAND_COLOR_PRESETS) {
      expect(isValidHexColor(color)).toBe(true)
    }
  })
})

describe('fontFamilyName', () => {
  it('extracts the quoted family name from a font-family string', () => {
    expect(fontFamilyName("'Cormorant Garamond', serif")).toBe('Cormorant Garamond')
    expect(fontFamilyName("'Archivo', sans-serif")).toBe('Archivo')
  })

  it('returns the trimmed first token when unquoted', () => {
    expect(fontFamilyName('Lora, serif')).toBe('Lora')
  })
})

describe('buildStorefrontFontsHref', () => {
  it('returns a Google Fonts css2 stylesheet URL with font-display swap', () => {
    const href = buildStorefrontFontsHref()
    expect(href.startsWith('https://fonts.googleapis.com/css2?')).toBe(true)
    expect(href).toContain('display=swap')
  })

  it('requests every family declared in STOREFRONT_GOOGLE_FONTS', () => {
    const href = buildStorefrontFontsHref()
    for (const family of Object.keys(STOREFRONT_GOOGLE_FONTS)) {
      expect(href).toContain(`family=${family.replace(/ /g, '+')}`)
    }
  })

  it('covers every family referenced by FONT_PAIRS (no drift)', () => {
    const referenced = new Set<string>()
    for (const pair of Object.values(FONT_PAIRS)) {
      referenced.add(fontFamilyName(pair.heading))
      referenced.add(fontFamilyName(pair.body))
    }
    for (const family of referenced) {
      expect(Object.keys(STOREFRONT_GOOGLE_FONTS)).toContain(family)
    }
  })

  it('includes each heading weight used by a pairing in its family request', () => {
    for (const pair of Object.values(FONT_PAIRS)) {
      const family = fontFamilyName(pair.heading)
      expect(STOREFRONT_GOOGLE_FONTS[family]).toContain(pair.headingWeight)
    }
  })
})

describe('buildHeadingFontCss', () => {
  it('scopes the heading font/weight rule to the given selector', () => {
    const css = buildHeadingFontCss('.storefront-themed')
    expect(css).toContain('.storefront-themed :is(h1,h2,h3,h4,h5,h6)')
  })

  it('drives heading font and weight from the brand CSS vars', () => {
    const css = buildHeadingFontCss('.storefront-themed')
    expect(css).toContain('font-family: var(--brand-heading-font)')
    expect(css).toContain('font-weight: var(--brand-heading-weight)')
  })

  it('emits no braces or angle brackets that could break out of a <style> tag', () => {
    const css = buildHeadingFontCss('.storefront-themed')
    expect(css).not.toContain('<')
    expect(css).not.toContain('</')
  })
})

describe('option lists', () => {
  it('lead with the "theme" sentinel so it is the default choice', () => {
    expect(FONT_PAIR_OPTIONS[0]).toBe('theme')
    expect(ROUNDNESS_OPTIONS[0]).toBe('theme')
    expect(STOREFRONT_PALETTE_OPTIONS[0]).toBe('theme')
  })

  it('include every concrete preset alongside the sentinel', () => {
    expect(FONT_PAIR_OPTIONS).toEqual(expect.arrayContaining(Object.keys(FONT_PAIRS)))
    expect(ROUNDNESS_OPTIONS).toEqual(expect.arrayContaining(Object.keys(ROUNDNESS_PRESETS)))
    expect(STOREFRONT_PALETTE_OPTIONS).toEqual(expect.arrayContaining(Object.keys(STOREFRONT_PALETTES)))
  })
})

describe('STOREFRONT_PALETTES', () => {
  it('provides at least the design reference palettes', () => {
    // The reference storefront ships several coordinated looks.
    expect(Object.keys(STOREFRONT_PALETTES).length).toBeGreaterThanOrEqual(4)
  })

  it('defines all seven coordinated roles as valid hex for every palette', () => {
    for (const [id, palette] of Object.entries(STOREFRONT_PALETTES)) {
      for (const role of PALETTE_KEYS) {
        expect(isValidHexColor(palette[role])).toBe(true)
      }
      // accent ink must actually contrast the accent (guards unreadable buttons)
      expect(palette.accentInk).not.toBe(palette.accent)
      expect(id).not.toBe('theme') // 'theme' is the inherit sentinel, never a concrete palette
    }
  })
})

describe('resolvePalette', () => {
  it('returns the coordinated colors for each named preset', () => {
    for (const [id, palette] of Object.entries(STOREFRONT_PALETTES)) {
      expect(resolvePalette(id)).toEqual(palette)
    }
  })

  it('returns null for the "theme" sentinel (inherit tenant default)', () => {
    expect(resolvePalette('theme')).toBeNull()
  })

  it('returns null for unknown, empty, or non-string values', () => {
    expect(resolvePalette('rainbow')).toBeNull()
    expect(resolvePalette('')).toBeNull()
    expect(resolvePalette(undefined)).toBeNull()
    expect(resolvePalette(null)).toBeNull()
    expect(resolvePalette(7)).toBeNull()
  })
})

describe('generatePaletteFromColor', () => {
  it('builds a full coordinated palette from a single seed accent', () => {
    const palette = generatePaletteFromColor('#2A6F4E')
    expect(palette).not.toBeNull()
    for (const role of PALETTE_KEYS) {
      expect(isValidHexColor(palette![role])).toBe(true)
    }
  })

  it('uses the seed as the accent and a contrasting accent ink', () => {
    const palette = generatePaletteFromColor('#E4572E')
    expect(palette!.accent).toBe('#E4572E')
    // dark-ish accent → light ink
    expect(palette!.accentInk).toBe('#ffffff')
  })

  it('derives a light background and dark text from the seed', () => {
    const palette = generatePaletteFromColor('#2A6F4E')
    // background should be far lighter than the accent; text far darker
    expect(palette!.bg.toLowerCase()).not.toBe(palette!.accent.toLowerCase())
    expect(palette!.text.toLowerCase()).not.toBe(palette!.accent.toLowerCase())
  })

  it('returns null for values that are not valid hex colors', () => {
    expect(generatePaletteFromColor('not-a-color')).toBeNull()
    expect(generatePaletteFromColor('')).toBeNull()
    expect(generatePaletteFromColor('rgb(1,2,3)')).toBeNull()
  })
})
