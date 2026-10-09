import { describe, it, expect } from '@jest/globals'
import { STORE_LOOKS, STORE_LOOK_IDS, STORE_TYPES, isStoreLook, isStoreType, buildLaunchBranding, buildLaunchDesign, toStoreLook, type StoreLook, type StoreType } from '@/lib/onboarding/store-type'
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

  it('without dish photos, each store type starts on its own look (card, layout and hero)', () => {
    for (const storeType of TYPES) {
      const look = STORE_LOOKS[STORE_TYPES[storeType].look]
      const patch = buildLaunchBranding({ storeType, storeName: 'X', brandColor: null, hasItemPhotos: false })
      expect(patch).toMatchObject({ card_template: look.card, page_layout: look.layout, hero_preset: look.hero })
    }
  })

  it('the look the owner picked in the wizard wins over the store type default', () => {
    const patch = buildLaunchBranding({ storeType: 'restaurant', storeName: 'X', brandColor: null, hasItemPhotos: false, look: 'kiosk' })
    expect(patch).toMatchObject({ card_template: STORE_LOOKS.kiosk.card, page_layout: STORE_LOOKS.kiosk.layout, hero_preset: STORE_LOOKS.kiosk.hero })
  })

  it('never launches on the retired menu board or the default layout', () => {
    for (const look of Object.values(STORE_LOOKS)) {
      expect(look.card).not.toBe('menuboard')
      expect(look.layout).not.toBe('default')
    }
  })

  it('switches the branded loading screen on, named and colored for the store', () => {
    const patch = buildLaunchBranding({ storeType: 'cafe', storeName: '  Kape ni Juan ', brandColor: '#2a6fdb', hasItemPhotos: false, tagline: 'Brewed slow' })
    expect(patch).toMatchObject({
      flash_screen_feature_enabled: true,
      flash_screen_is_active: true,
      flash_screen_title: 'Kape ni Juan',
      flash_screen_subtitle: 'Brewed slow',
      flash_screen_background_color: patch.button_primary_color,
      flash_screen_text_color: patch.button_primary_text_color,
    })
    // No image: the loading screen shows the logo and follows a later logo change.
    expect(patch.flash_screen_image_url).toBeUndefined()
  })
})

describe('toStoreLook', () => {
  it('maps every look an older wizard saved to a current one', () => {
    expect(toStoreLook('board')).toBe('sidebar')
    expect(toStoreLook('chapters')).toBe('cafe')
    expect(toStoreLook('tiles')).toBe('kiosk')
    expect(toStoreLook('cards')).toBe('bistro')
    expect(toStoreLook('shop')).toBe('shop')
    expect(toStoreLook('constructor')).toBeNull()
    expect(toStoreLook(undefined)).toBeNull()
  })
})

describe('buildLaunchDesign', () => {
  it.each(STORE_LOOK_IDS)('look %s passes the branding schema and the design registries', (look) => {
    const patch = buildLaunchDesign('restaurant', { look, fontPair: 'elegant serif' })
    expect(() => brandingPatchSchema.parse(patch)).not.toThrow()
    expect(() => assertKnownDesignIds(patch as Record<string, unknown>)).not.toThrow()
    expect(patch).toEqual({ card_template: STORE_LOOKS[look].card, page_layout: STORE_LOOKS[look].layout, hero_preset: STORE_LOOKS[look].hero, font_pair: 'elegant serif' })
  })

  it("keeps the store type's font pairing when none (or a bogus one) is given", () => {
    expect(buildLaunchDesign('cafe', { look: 'cafe' }).font_pair).toBe(STORE_TYPES.cafe.fontPair)
    expect(buildLaunchDesign('cafe', { look: 'cafe', fontPair: 'Comic Sans' as never }).font_pair).toBe(STORE_TYPES.cafe.fontPair)
  })

  it('only touches the layout: colors and hero copy stay as the branding step set them', () => {
    const keys = Object.keys(buildLaunchDesign('bakery', { look: 'shop' })).sort()
    expect(keys).toEqual(['card_template', 'font_pair', 'hero_preset', 'page_layout'])
  })

  it.each(Object.keys(STORE_LOOKS) as StoreLook[])('look %s is photo-free: no hero that draws a picture panel, known design ids', (id) => {
    const look = STORE_LOOKS[id]
    expect(['split', 'collage', 'centered', 'custom']).not.toContain(look.hero)
    expect(CARD_TEMPLATE_IDS).toContain(look.card)
    expect(PAGE_LAYOUT_IDS).toContain(look.layout)
  })

  it('offers at least three looks so the wizard has a real choice', () => {
    expect(Object.keys(STORE_LOOKS).length).toBeGreaterThanOrEqual(3)
    expect(isStoreLook('shop')).toBe(true)
    expect(isStoreLook('board')).toBe(false)
    expect(isStoreLook('constructor')).toBe(false)
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
