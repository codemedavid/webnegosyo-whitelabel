import { describe, it, expect } from '@jest/globals'
import { assertKnownDesignIds, describeDesignCatalog } from '@/lib/mcp/design-catalog'

describe('describeDesignCatalog', () => {
  const catalog = describeDesignCatalog()

  it('lists every flexible card template, flagged as flexible, with a description', () => {
    const flexible = catalog.cardTemplates.filter((t) => t.flexible).map((t) => t.id)
    expect(flexible).toEqual(['showcase', 'atelier', 'kiosk', 'sticker', 'menuboard', 'arch', 'bistro'])
    for (const template of catalog.cardTemplates) {
      expect(template.description.length).toBeGreaterThan(0)
    }
  })

  it('no longer offers the retired compact card', () => {
    expect(catalog.cardTemplates.map((t) => t.id)).not.toContain('compact')
  })

  it('lists every page layout, including the scroll catalogs', () => {
    expect(catalog.pageLayouts.map((l) => l.id)).toEqual([
      'default', 'sidebar', 'magazine', 'grid-focus', 'list', 'mosaic',
      'storefront', 'kiosk', 'rails', 'lookbook',
    ])
  })

  it('describes the card-style knobs with their allowed values', () => {
    const density = catalog.cardStyleKnobs.find((k) => k.field === 'card_density')
    expect(density?.options).toEqual(['auto', 'compact', 'comfortable', 'spacious'])
    expect(catalog.cardStyleKnobs.map((k) => k.field)).toEqual([
      'card_image_ratio', 'card_image_fit', 'card_add_button', 'card_text_align', 'card_description', 'card_density',
    ])
  })
})

describe('assertKnownDesignIds', () => {
  it('accepts known templates and layouts on desktop and phone fields', () => {
    expect(() => assertKnownDesignIds({
      card_template: 'atelier',
      page_layout: 'rails',
      mobile_card_template: 'menuboard',
      mobile_page_layout: 'lookbook',
      mobile_overrides: { card_template: 'kiosk', page_layout: 'storefront' },
    })).not.toThrow()
  })

  it('ignores absent fields and cleared phone values', () => {
    expect(() => assertKnownDesignIds({ header_color: '#111111' })).not.toThrow()
    expect(() => assertKnownDesignIds({ mobile_card_template: null, mobile_page_layout: null })).not.toThrow()
  })

  it('refuses the retired compact card and points at Menu Board', () => {
    expect(() => assertKnownDesignIds({ card_template: 'compact' })).toThrow(/menuboard/)
  })

  it('refuses an unknown layout inside mobile_overrides, naming the field', () => {
    expect(() => assertKnownDesignIds({ mobile_overrides: { page_layout: 'carousel' } }))
      .toThrow(/mobile_overrides\.page_layout.*carousel/)
  })

  it('refuses an unknown mobile card template', () => {
    expect(() => assertKnownDesignIds({ mobile_card_template: 'fancy' })).toThrow(/mobile_card_template/)
  })
})
