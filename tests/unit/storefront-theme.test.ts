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
  CATEGORY_NAV_STYLES,
  CATEGORY_NAV_STYLE_OPTIONS,
  HERO_PRESETS,
  HERO_PRESET_OPTIONS,
  resolveFontPair,
  resolveRoundness,
  resolvePalette,
  resolveCategoryNavStyle,
  resolveHeroPreset,
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

describe('CATEGORY_NAV_STYLES', () => {
  it('defines at least the pills, chips, and underline variants', () => {
    expect(Object.keys(CATEGORY_NAV_STYLES)).toEqual(
      expect.arrayContaining(['pills', 'chips', 'underline'])
    )
  })

  it('does not include the theme sentinel as a concrete style', () => {
    expect(Object.keys(CATEGORY_NAV_STYLES)).not.toContain('theme')
  })
})

describe('CATEGORY_NAV_STYLE_OPTIONS', () => {
  it('leads with the theme inherit sentinel', () => {
    expect(CATEGORY_NAV_STYLE_OPTIONS[0]).toBe('theme')
  })

  it('contains every concrete style after the sentinel', () => {
    expect(CATEGORY_NAV_STYLE_OPTIONS).toEqual([
      'theme',
      ...Object.keys(CATEGORY_NAV_STYLES),
    ])
  })
})

describe('resolveCategoryNavStyle', () => {
  it('resolves each concrete style to its own variant token', () => {
    expect(resolveCategoryNavStyle('pills')).toBe('pills')
    expect(resolveCategoryNavStyle('chips')).toBe('chips')
    expect(resolveCategoryNavStyle('underline')).toBe('underline')
  })

  it('returns null for the theme sentinel so the current pills stay byte-identical', () => {
    expect(resolveCategoryNavStyle('theme')).toBeNull()
  })

  it('returns null for unknown, empty, or non-string values', () => {
    expect(resolveCategoryNavStyle('rainbow')).toBeNull()
    expect(resolveCategoryNavStyle('')).toBeNull()
    expect(resolveCategoryNavStyle(undefined)).toBeNull()
    expect(resolveCategoryNavStyle(null)).toBeNull()
    expect(resolveCategoryNavStyle(7)).toBeNull()
  })
})

describe('HERO_PRESETS', () => {
  it('defines the six additive hero layouts', () => {
    expect(Object.keys(HERO_PRESETS)).toEqual(
      expect.arrayContaining([
        'centered',
        'editorial',
        'split',
        'banner',
        'collage',
        'minimal',
      ])
    )
  })

  it('does not include the theme sentinel as a concrete preset', () => {
    expect(Object.keys(HERO_PRESETS)).not.toContain('theme')
  })
})

describe('HERO_PRESET_OPTIONS', () => {
  it('leads with the theme inherit sentinel', () => {
    expect(HERO_PRESET_OPTIONS[0]).toBe('theme')
  })

  it('contains every concrete preset after the sentinel', () => {
    expect(HERO_PRESET_OPTIONS).toEqual([
      'theme',
      ...Object.keys(HERO_PRESETS),
    ])
  })
})

describe('resolveHeroPreset', () => {
  it('resolves each concrete preset to its own layout token', () => {
    expect(resolveHeroPreset('centered')).toBe('centered')
    expect(resolveHeroPreset('editorial')).toBe('editorial')
    expect(resolveHeroPreset('split')).toBe('split')
    expect(resolveHeroPreset('banner')).toBe('banner')
    expect(resolveHeroPreset('collage')).toBe('collage')
    expect(resolveHeroPreset('minimal')).toBe('minimal')
  })

  it('returns null for the theme sentinel so the current hero stays byte-identical', () => {
    expect(resolveHeroPreset('theme')).toBeNull()
  })

  it('returns null for unknown, empty, or non-string values', () => {
    expect(resolveHeroPreset('splash')).toBeNull()
    expect(resolveHeroPreset('')).toBeNull()
    expect(resolveHeroPreset(undefined)).toBeNull()
    expect(resolveHeroPreset(null)).toBeNull()
    expect(resolveHeroPreset(9)).toBeNull()
  })
})
