import { describe, it, expect } from '@jest/globals'
import { STORE_TYPES, isStoreType, buildLaunchBranding, type StoreType } from '@/lib/onboarding/store-type'
import { brandingPatchSchema } from '@/lib/branding-service'
import { assertKnownDesignIds } from '@/lib/mcp/design-catalog'
import { CARD_TEMPLATE_IDS } from '@/lib/card-templates'
import { PAGE_LAYOUT_IDS } from '@/lib/page-layouts'

const TYPES = Object.keys(STORE_TYPES) as StoreType[]

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('STORE_TYPES', () => {
  it('offers the five store types', () => {
    expect(TYPES).toEqual(['restaurant', 'cafe', 'milk_tea', 'bakery', 'other'])
  })

  it.each(TYPES)('%s has a label, emoji and a hex default color', (type) => {
    const def = STORE_TYPES[type]
    expect(def.label.length).toBeGreaterThan(0)
    expect(def.emoji.length).toBeGreaterThan(0)
    expect(def.defaultColor).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('isStoreType', () => {
  it('accepts known types and refuses everything else', () => {
    expect(isStoreType('cafe')).toBe(true)
    expect(isStoreType('pizza')).toBe(false)
    expect(isStoreType(undefined)).toBe(false)
    expect(isStoreType('constructor')).toBe(false)
    expect(isStoreType('__proto__')).toBe(false)
  })
})

describe('buildLaunchBranding', () => {
  const combos = TYPES.flatMap((storeType) =>
    [true, false].flatMap((hasItemPhotos) =>
      ['#c0392b', null].map((brandColor) => ({ storeType, hasItemPhotos, brandColor })),
    ),
  )

  it.each(combos)('passes brandingPatchSchema and the design registries: %o', ({ storeType, hasItemPhotos, brandColor }) => {
    const patch = buildLaunchBranding({ storeType, storeName: 'Kape ni Juan', brandColor, hasItemPhotos })
    expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    expect(() => assertKnownDesignIds(patch as Record<string, unknown>)).not.toThrow()
    expect(CARD_TEMPLATE_IDS).toContain(patch.card_template)
    expect(PAGE_LAYOUT_IDS).toContain(patch.page_layout)
    expect(patch.hero_preset).not.toBe('custom')
  })

  it('uses the text-first menuboard card when no item has a photo', () => {
    for (const storeType of TYPES) {
      const patch = buildLaunchBranding({ storeType, storeName: 'X', brandColor: null, hasItemPhotos: false })
      expect(patch.card_template).toBe('menuboard')
    }
  })

  it('uses a photo-forward card when items have photos', () => {
    for (const storeType of TYPES) {
      const patch = buildLaunchBranding({ storeType, storeName: 'X', brandColor: null, hasItemPhotos: true })
      expect(patch.card_template).not.toBe('menuboard')
    }
  })

  it('builds the palette from the logo color', () => {
    const patch = buildLaunchBranding({ storeType: 'cafe', storeName: 'X', brandColor: '#2a6fdb', hasItemPhotos: true })
    expect(patch.accent_color).toBe('#2a6fdb')
    expect(patch.brand_color).toBe('#2a6fdb')
    expect(patch.button_primary_color).toBe('#2a6fdb')
  })

  it("falls back to the store type's default color", () => {
    const patch = buildLaunchBranding({ storeType: 'bakery', storeName: 'X', brandColor: null, hasItemPhotos: true })
    expect(patch.accent_color).toBe(STORE_TYPES.bakery.defaultColor)
  })

  it('ignores a malformed brand color', () => {
    const patch = buildLaunchBranding({ storeType: 'cafe', storeName: 'X', brandColor: 'red;}', hasItemPhotos: true })
    expect(patch.accent_color).toBe(STORE_TYPES.cafe.defaultColor)
  })

  it.each(['#ffd400', '#0a0a40', '#2a6fdb', '#f5f5dc'])('keeps button text readable on %s', (brandColor) => {
    const patch = buildLaunchBranding({ storeType: 'restaurant', storeName: 'X', brandColor, hasItemPhotos: true })
    expect(contrast(patch.button_primary_color!, patch.button_primary_text_color!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['#ffd400', '#f5f5dc'])('keeps the card price readable on white for a pale brand color %s', (brandColor) => {
    const patch = buildLaunchBranding({ storeType: 'restaurant', storeName: 'X', brandColor, hasItemPhotos: true })
    expect(contrast(patch.card_price_color!, patch.cards_color!)).toBeGreaterThanOrEqual(3)
  })

  it('titles the hero with the store name and uses the tagline when given', () => {
    const patch = buildLaunchBranding({
      storeType: 'cafe', storeName: 'Kape ni Juan', brandColor: null, hasItemPhotos: true, tagline: 'Brewed slow in Cebu',
    })
    expect(patch.hero_title).toBe('Kape ni Juan')
    expect(patch.hero_description).toBe('Brewed slow in Cebu')
  })

  it('writes a type-appropriate hero line when there is no tagline', () => {
    const patch = buildLaunchBranding({ storeType: 'cafe', storeName: 'X', brandColor: null, hasItemPhotos: true, tagline: '  ' })
    expect(patch.hero_description).toBe(STORE_TYPES.cafe.heroLine)
  })

  it('caps an over-long store name and tagline to the schema limits', () => {
    const patch = buildLaunchBranding({
      storeType: 'other', storeName: 'N'.repeat(500), brandColor: null, hasItemPhotos: false, tagline: 'T'.repeat(5000),
    })
    expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
  })
})
