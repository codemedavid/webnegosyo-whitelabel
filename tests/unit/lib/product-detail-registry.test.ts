/**
 * Product Detail registry — the ~96-field editor surface backed by the
 * dedicated `product_detail_settings` table (not the `tenants` columns).
 *
 * Kept in its own index so product-detail columns that share a name with a
 * tenant column (modal_background_color, footer_background_color,
 * checkout_modal_*, page_background_color, card_border_radius…) never collide
 * with the global branding draft.
 */
import {
  PRODUCT_DETAIL_SECTIONS,
  PRODUCT_DETAIL_FIELD_INDEX,
  getProductDetailFieldIds,
  resolveProductField,
  isProductFieldSet,
  buildProductSettingsPayload,
} from '@/lib/product-detail-registry'
import { VALID_DB_COLUMNS } from '@/lib/product-detail-settings-utils'

describe('product detail registry structure', () => {
  it('groups fields into sections that each have a title and at least one field', () => {
    expect(PRODUCT_DETAIL_SECTIONS.length).toBeGreaterThan(5)
    for (const section of PRODUCT_DETAIL_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0)
      expect(section.fields.length).toBeGreaterThan(0)
    }
  })

  it('exposes near-complete parity — 80+ editable product-detail fields', () => {
    const ids = getProductDetailFieldIds()
    expect(ids.length).toBeGreaterThanOrEqual(80)
    // no duplicates
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every editable field id is a real product_detail_settings column', () => {
    for (const id of getProductDetailFieldIds()) {
      expect(VALID_DB_COLUMNS.has(id)).toBe(true)
    }
  })

  it('indexes representative fields with the right type', () => {
    expect(PRODUCT_DETAIL_FIELD_INDEX['product_name_color'].type).toBe('color')
    expect(PRODUCT_DETAIL_FIELD_INDEX['product_name_font_size'].type).toBe('text')
    expect(PRODUCT_DETAIL_FIELD_INDEX['buy_now_button_label'].type).toBe('text')
    expect(PRODUCT_DETAIL_FIELD_INDEX['enable_animations'].type).toBe('toggle')
    expect(PRODUCT_DETAIL_FIELD_INDEX['animation_speed'].type).toBe('select')
    expect(PRODUCT_DETAIL_FIELD_INDEX['animation_speed'].options).toEqual(
      expect.arrayContaining(['slow', 'normal', 'fast'])
    )
  })

  it('covers the upsell bottom-sheet modal fields (popup + checkout)', () => {
    for (const id of [
      'popup_modal_background_color',
      'popup_modal_button_color',
      'checkout_modal_background_color',
      'checkout_modal_button_text_color',
    ]) {
      expect(PRODUCT_DETAIL_FIELD_INDEX[id]).toBeDefined()
    }
  })
})

describe('resolveProductField cascade', () => {
  const saved = { product_name_color: '#222222', addon_price_free_text: 'On us' }

  it('returns the draft value when the draft sets the field', () => {
    expect(resolveProductField('product_name_color', { product_name_color: '#ff0000' }, saved)).toBe('#ff0000')
  })

  it('falls back to the saved setting when the draft has no entry', () => {
    expect(resolveProductField('addon_price_free_text', {}, saved)).toBe('On us')
  })

  it('treats an empty-string draft value as cleared and returns the registry default', () => {
    // product_name_color default is #111827
    expect(resolveProductField('product_name_color', { product_name_color: '' }, saved)).toBe('#111827')
  })

  it('returns the registry default when nothing is set', () => {
    expect(resolveProductField('product_name_font_size', {}, {})).toBe('24px')
  })
})

describe('isProductFieldSet', () => {
  it('reports set from draft or saved and unset when cleared in draft', () => {
    expect(isProductFieldSet('product_name_color', { product_name_color: '#f00' }, {})).toBe(true)
    expect(isProductFieldSet('product_name_color', {}, { product_name_color: '#f00' })).toBe(true)
    expect(isProductFieldSet('product_name_color', { product_name_color: '' }, { product_name_color: '#f00' })).toBe(false)
  })
})

describe('buildProductSettingsPayload', () => {
  it('merges saved settings with the draft and only emits real DB columns', () => {
    const savedSettings = { product_name_color: '#111111', addon_text_color: '#222222' }
    const draft = { product_name_color: '#ff0000', not_a_column: 'x' }

    const payload = buildProductSettingsPayload(draft, savedSettings)

    expect(payload.product_name_color).toBe('#ff0000')
    expect(payload.addon_text_color).toBe('#222222')
    expect('not_a_column' in payload).toBe(false)
  })

  it('passes an empty string through so a cleared override erases the saved column', () => {
    const payload = buildProductSettingsPayload({ product_name_color: '' }, { product_name_color: '#f00' })
    expect(payload.product_name_color).toBe('')
  })
})
