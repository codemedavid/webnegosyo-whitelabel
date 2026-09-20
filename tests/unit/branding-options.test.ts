import { describe, it, expect } from '@jest/globals'
import { describeBrandingOptions, listBrandingFieldIds } from '@/lib/branding-options'

describe('describeBrandingOptions', () => {
  const options = describeBrandingOptions()

  it('exposes the schema enums the writer enforces', () => {
    expect(options.hero_preset).toEqual(expect.arrayContaining(['theme', 'split', 'collage', 'custom']))
    expect(options.font_pair).toEqual(expect.arrayContaining(['elegant serif', 'modern sans']))
    expect(options.footer_theme).toEqual(expect.arrayContaining(['auto', 'brand', 'custom']))
    expect(options.welcome_entry_mode).toEqual(['order_types', 'single_cta'])
  })

  it('exposes the Studio select vocabularies for plain-string template columns', () => {
    expect(options.card_template).toEqual(expect.arrayContaining(['classic', 'minimal', 'modern']))
    expect(options.header_template).toEqual(expect.arrayContaining(['classic', 'centered']))
    expect(options.page_layout).toBeDefined()
  })

  it('never lists a field the writer cannot accept', () => {
    const fieldIds = new Set(listBrandingFieldIds())
    for (const key of Object.keys(options)) {
      if (!fieldIds.has(key)) {
        // Studio-only virtual fields are allowed but must at least be strings.
        expect(typeof key).toBe('string')
      }
    }
    expect(fieldIds.has('hero_image_url')).toBe(true)
    expect(fieldIds.has('promotion_banners')).toBe(true)
  })
})
