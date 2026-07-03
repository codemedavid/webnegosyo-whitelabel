import { describe, it, expect } from '@jest/globals'
import {
  FONT_PAIRS,
  ROUNDNESS_PRESETS,
  BRAND_COLOR_PRESETS,
  FONT_PAIR_OPTIONS,
  ROUNDNESS_OPTIONS,
  resolveFontPair,
  resolveRoundness,
} from '@/lib/storefront-theme'
import { isValidHexColor } from '@/lib/branding-utils'

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

describe('option lists', () => {
  it('lead with the "theme" sentinel so it is the default choice', () => {
    expect(FONT_PAIR_OPTIONS[0]).toBe('theme')
    expect(ROUNDNESS_OPTIONS[0]).toBe('theme')
  })

  it('include every concrete preset alongside the sentinel', () => {
    expect(FONT_PAIR_OPTIONS).toEqual(expect.arrayContaining(Object.keys(FONT_PAIRS)))
    expect(ROUNDNESS_OPTIONS).toEqual(expect.arrayContaining(Object.keys(ROUNDNESS_PRESETS)))
  })
})
