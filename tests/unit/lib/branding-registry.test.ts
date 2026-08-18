/**
 * Branding Studio field registry + cascade resolver.
 *
 * The registry is the single source of truth for the new /admin/branding
 * editor: which surfaces exist, which tenant columns each field maps to,
 * and how unset fields inherit values (draft → tenant column → inherit
 * chain → registry default) — mirroring getTenantBranding's fallbacks.
 */
import {
  BRANDING_SURFACES,
  BRANDING_FIELD_INDEX,
  resolveFieldValue,
  isFieldSet,
  getInheritSourceLabel,
  getSurfaceFieldIds,
  buildPublishPayload,
  BRANDING_PRESETS,
  generatePaletteFromColor,
} from '@/lib/branding-registry'

describe('branding registry structure', () => {
  it('defines the nine editor surfaces in rail order', () => {
    // Arrange / Act
    const ids = BRANDING_SURFACES.map((s) => s.id)

    // Assert
    expect(ids).toEqual([
      'global',
      'storefront',
      'welcome',
      'cart',
      'checkout',
      'upsell',
      'product',
      'footer',
      'flash',
    ])
  })

  it('every surface has a label, glyph, description and at least one section with fields', () => {
    for (const surface of BRANDING_SURFACES) {
      expect(surface.label.length).toBeGreaterThan(0)
      expect(surface.glyph.length).toBeGreaterThan(0)
      expect(surface.description.length).toBeGreaterThan(0)
      expect(surface.sections.length).toBeGreaterThan(0)
      for (const section of surface.sections) {
        expect(section.title.length).toBeGreaterThan(0)
        expect(section.fields.length).toBeGreaterThan(0)
      }
    }
  })

  it('field ids are unique snake_case column names across all surfaces', () => {
    const seen = new Set<string>()
    for (const surface of BRANDING_SURFACES) {
      for (const section of surface.sections) {
        for (const field of section.fields) {
          if (field.type === 'note') continue
          expect(field.id).toMatch(/^[a-z][a-z0-9_]*$/)
          expect(seen.has(field.id)).toBe(false)
          seen.add(field.id)
        }
      }
    }
    expect(seen.size).toBeGreaterThan(80)
  })

  it('indexes every non-note field by id', () => {
    expect(BRANDING_FIELD_INDEX['card_price_color']).toBeDefined()
    expect(BRANDING_FIELD_INDEX['card_price_color'].type).toBe('color')
    expect(BRANDING_FIELD_INDEX['header_template'].type).toBe('select')
    expect(BRANDING_FIELD_INDEX['header_template'].options).toContain('classic')
    expect(BRANDING_FIELD_INDEX['search_bar_enabled'].type).toBe('toggle')
  })

  it('exposes a hero_section_enabled toggle so a disabled hero can be re-enabled', () => {
    expect(BRANDING_FIELD_INDEX['hero_section_enabled']).toBeDefined()
    expect(BRANDING_FIELD_INDEX['hero_section_enabled'].type).toBe('toggle')
    expect(BRANDING_FIELD_INDEX['hero_section_enabled'].default).toBe(true)
  })

  it('covers the full footer field set — logo, contact, all socials + labels, and pages', () => {
    for (const id of [
      'footer_logo_url', 'footer_powered_by_text',
      'footer_whatsapp', 'footer_viber',
      'footer_twitter_url', 'footer_youtube_url',
      'footer_facebook_name', 'footer_instagram_name', 'footer_tiktok_name',
      'footer_twitter_name', 'footer_youtube_name',
      'footer_about_us', 'footer_terms_of_service', 'footer_refund_policy', 'footer_privacy_policy',
    ]) {
      expect(BRANDING_FIELD_INDEX[id]).toBeDefined()
    }
  })

  it('exposes the flash feature toggle, image and promotion toggle', () => {
    expect(BRANDING_FIELD_INDEX['flash_screen_feature_enabled'].type).toBe('toggle')
    expect(BRANDING_FIELD_INDEX['flash_screen_image_url']).toBeDefined()
    expect(BRANDING_FIELD_INDEX['is_promotion_visible'].type).toBe('toggle')
  })

  it('every inheritsFrom points at a real registry field', () => {
    for (const field of Object.values(BRANDING_FIELD_INDEX)) {
      if (field.inheritsFrom) {
        expect(BRANDING_FIELD_INDEX[field.inheritsFrom]).toBeDefined()
      }
    }
  })

  it('exposes select options matching the storefront template systems', () => {
    expect(BRANDING_FIELD_INDEX['card_template'].options).toEqual(
      expect.arrayContaining(['classic', 'minimal', 'modern', 'glass', 'neon'])
    )
    expect(BRANDING_FIELD_INDEX['cart_template'].options).toEqual(
      expect.arrayContaining(['classic', 'modern', 'wizard', 'minimal', 'express'])
    )
    expect(BRANDING_FIELD_INDEX['checkout_template'].options).toEqual(
      expect.arrayContaining(['classic', 'modern', 'wizard', 'minimal', 'express'])
    )
    expect(BRANDING_FIELD_INDEX['hero_preset'].options).toEqual(
      expect.arrayContaining(['theme', 'centered', 'editorial', 'split', 'banner', 'collage', 'minimal'])
    )
    expect(BRANDING_FIELD_INDEX['category_nav_style'].options).toEqual(
      expect.arrayContaining(['theme', 'pills', 'chips', 'underline'])
    )
  })
})

describe('resolveFieldValue cascade', () => {
  const tenant = {
    primary_color: '#111111',
    card_price_color: '',
    text_primary_color: '#222222',
    search_bar_enabled: true,
  }

  it('returns the draft value when the draft sets the field', () => {
    const draft = { card_price_color: '#ff0000' }
    expect(resolveFieldValue('card_price_color', draft, tenant)).toBe('#ff0000')
  })

  it('falls back to the saved tenant column when the draft has no entry', () => {
    expect(resolveFieldValue('text_primary_color', {}, tenant)).toBe('#222222')
  })

  it('treats an empty-string draft value as cleared and walks the inherit chain', () => {
    // card_price_color inherits primary_color in the storefront cascade
    const draft = { card_price_color: '' }
    expect(resolveFieldValue('card_price_color', draft, tenant)).toBe('#111111')
  })

  it('walks the inherit chain when neither draft nor tenant set the field', () => {
    expect(resolveFieldValue('card_price_color', {}, tenant)).toBe('#111111')
  })

  it('returns the registry default when nothing in the chain is set', () => {
    expect(resolveFieldValue('card_price_color', {}, {})).toBe('#111111')
    expect(resolveFieldValue('search_bar_radius', {}, {})).toBe('pill')
  })

  it('resolves toggle values with draft priority over tenant', () => {
    expect(resolveFieldValue('search_bar_enabled', { search_bar_enabled: false }, tenant)).toBe(false)
    expect(resolveFieldValue('search_bar_enabled', {}, tenant)).toBe(true)
    expect(resolveFieldValue('search_bar_enabled', {}, {})).toBe(true)
  })

  it('supports multi-hop inheritance (cart button → cart accent → button primary)', () => {
    const t = { button_primary_color: '#00aa00' }
    expect(resolveFieldValue('cart_button_color', {}, t)).toBe('#00aa00')
  })
})

describe('isFieldSet + inherit source label', () => {
  it('reports set when the draft or tenant holds a non-empty value', () => {
    expect(isFieldSet('card_price_color', { card_price_color: '#f00' }, {})).toBe(true)
    expect(isFieldSet('card_price_color', {}, { card_price_color: '#f00' })).toBe(true)
  })

  it('reports unset when cleared in draft even if the tenant column is set', () => {
    expect(isFieldSet('card_price_color', { card_price_color: '' }, { card_price_color: '#f00' })).toBe(false)
  })

  it('labels the nearest set ancestor in the inherit chain', () => {
    const tenant = { primary_color: '#111111' }
    expect(getInheritSourceLabel('card_price_color', {}, tenant)).toBe(
      BRANDING_FIELD_INDEX['primary_color'].label
    )
  })

  it('labels Default when no ancestor is set', () => {
    expect(getInheritSourceLabel('card_price_color', {}, {})).toBe('Default')
  })
})

describe('getSurfaceFieldIds', () => {
  it('returns every editable field id for a surface', () => {
    const ids = getSurfaceFieldIds('cart')
    expect(ids).toEqual(expect.arrayContaining(['cart_template', 'cart_background_color', 'cart_button_color']))
    expect(ids).not.toContain('checkout_background_color')
  })

  it('keeps the menu-grid quick-view modal fields on the storefront surface', () => {
    // These are tenant columns for the menu-card popup, distinct from the
    // product_detail_settings-backed product page (its own registry).
    const ids = getSurfaceFieldIds('storefront')
    expect(ids).toEqual(
      expect.arrayContaining(['modal_background_color', 'modal_title_color', 'modal_price_color', 'modal_description_color'])
    )
  })

  it('leaves the product surface with no tenant-column fields — it uses the product_detail_settings store', () => {
    expect(getSurfaceFieldIds('product')).toEqual([])
  })
})

describe('buildPublishPayload', () => {
  it('merges saved tenant values with the draft and always carries required core colors', () => {
    const tenant = { primary_color: '#111111', secondary_color: '#666666', cards_color: '#ffffff' }
    const draft = { card_price_color: '#ff0000' }

    const payload = buildPublishPayload(draft, tenant)

    expect(payload.primary_color).toBe('#111111')
    expect(payload.secondary_color).toBe('#666666')
    expect(payload.cards_color).toBe('#ffffff')
    expect(payload.card_price_color).toBe('#ff0000')
  })

  it('passes empty strings through so a cleared override erases the saved column', () => {
    const tenant = { primary_color: '#111111', secondary_color: '#666666', card_price_color: '#f00' }
    const payload = buildPublishPayload({ card_price_color: '' }, tenant)
    expect(payload.card_price_color).toBe('')
  })

  it('defaults required core colors when the tenant never set them', () => {
    const payload = buildPublishPayload({}, {})
    expect(typeof payload.primary_color).toBe('string')
    expect((payload.primary_color as string).length).toBeGreaterThan(0)
    expect(typeof payload.secondary_color).toBe('string')
    expect((payload.secondary_color as string).length).toBeGreaterThan(0)
  })

  it('ignores keys that are not registry fields', () => {
    const payload = buildPublishPayload({ evil_column: 'x' } as Record<string, unknown>, {})
    expect('evil_column' in payload).toBe(false)
  })
})

describe('palette presets + generate from logo color', () => {
  it('ships at least four named presets that set explicit color columns', () => {
    expect(BRANDING_PRESETS.length).toBeGreaterThanOrEqual(4)
    for (const preset of BRANDING_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.values.primary_color).toMatch(/^#/)
      expect(preset.values.accent_color).toMatch(/^#/)
      expect(preset.values.background_color).toMatch(/^#/)
    }
  })

  it('derives a full palette from a single brand color', () => {
    const palette = generatePaletteFromColor('#E4572E')

    expect(palette.accent_color).toBe('#E4572E')
    for (const key of [
      'primary_color',
      'background_color',
      'border_color',
      'text_primary_color',
      'text_secondary_color',
      'text_muted_color',
    ] as const) {
      expect(palette[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
    // Background must stay light, primary/text dark — basic contrast sanity.
    expect(palette.background_color).not.toBe(palette.text_primary_color)
  })

  it('every preset value key is a known registry color field', () => {
    for (const preset of BRANDING_PRESETS) {
      for (const key of Object.keys(preset.values)) {
        expect(BRANDING_FIELD_INDEX[key]).toBeDefined()
        expect(BRANDING_FIELD_INDEX[key].type).toBe('color')
      }
    }
  })

  it('registers editable hero content fields for the rich hero presets', () => {
    expect(BRANDING_FIELD_INDEX.hero_kicker?.type).toBe('text')
    expect(BRANDING_FIELD_INDEX.hero_cta_primary_label?.type).toBe('text')
    expect(BRANDING_FIELD_INDEX.hero_cta_secondary_label?.type).toBe('text')
    expect(BRANDING_FIELD_INDEX.hero_featured_product_id?.type).toBe('product')
    // Hero content belongs to the storefront surface.
    const storefrontIds = getSurfaceFieldIds('storefront')
    expect(storefrontIds).toEqual(
      expect.arrayContaining([
        'hero_kicker',
        'hero_cta_primary_label',
        'hero_cta_secondary_label',
        'hero_featured_product_id',
      ])
    )
  })
})
