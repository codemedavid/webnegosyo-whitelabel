/**
 * The Page Designer's Look tab edits the SAME store settings as Branding
 * Studio, taken from the Studio's registry. A save writes only the changed
 * fields, folds JSON columns over what is saved NOW (so keys the editor did
 * not touch survive), and is refused when the Studio changed a field since.
 */

import { BRANDING_FIELD_INDEX } from '@/lib/branding-registry'
import { isPageLookField, lookConflicts, lookPatch, lookStoreRow, lookValues, PAGE_LOOK_SECTIONS, previewLookRow, remainingLookChanges } from '@/lib/page-designer/look'
import type { PageId } from '@/lib/page-designer/types'

const fieldIds = (page: PageId) => PAGE_LOOK_SECTIONS[page].flatMap((s) => s.fields.map((f) => f.id))

describe('what each page’s Look shows', () => {
  it('gives the checkout its nine Studio colours, the loyalty card and its wording, never the layout picker', () => {
    const ids = fieldIds('checkout')
    for (const id of [
      'checkout_background_color',
      'checkout_card_background_color',
      'checkout_summary_background_color',
      'checkout_text_color',
      'checkout_muted_text_color',
      'checkout_accent_color',
      'checkout_button_color',
      'checkout_button_text_color',
      'checkout_border_color',
    ]) {
      expect(ids).toContain(id)
    }
    expect(ids).not.toContain('checkout_template')
    expect(ids.some((id) => id.startsWith('tracking_style.loyalty_'))).toBe(true)
    expect(ids).toContain('storefront_labels.checkout.order_type')
  })

  it('gives the thank-you page the checkout colours and only its own wording', () => {
    const ids = fieldIds('confirmation')
    expect(ids).toContain('checkout_accent_color')
    expect(ids.filter((id) => id.startsWith('storefront_labels.')).every((id) => id.startsWith('storefront_labels.confirmation.'))).toBe(true)
  })

  it('gives the order page every Order status and Loyalty card setting', () => {
    const ids = fieldIds('tracking')
    for (const id of ['tracking_style.accent', 'tracking_style.hero_style', 'tracking_style.show_timeline', 'tracking_style.loyalty_background']) {
      expect(ids).toContain(id)
    }
  })

  it('uses only real Studio fields, each once per page', () => {
    for (const page of ['checkout', 'confirmation', 'tracking'] as const) {
      const ids = fieldIds(page)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(BRANDING_FIELD_INDEX[id]).toBeDefined()
    }
  })

  it('lets a page change only its own fields', () => {
    expect(isPageLookField('checkout', 'checkout_accent_color')).toBe(true)
    expect(isPageLookField('checkout', 'tracking_style.hero_style')).toBe(false)
    expect(isPageLookField('tracking', 'checkout_accent_color')).toBe(false)
    expect(isPageLookField('checkout', 'is_prelaunch')).toBe(false)
    expect(isPageLookField('checkout', 'domain')).toBe(false)
  })
})

const SAVED = {
  checkout_accent_color: '#111111',
  tracking_style: { accent: '#ff0000', hero_style: 'solid' },
  storefront_labels: { 'checkout.title': 'Pay' },
  checkout_design: '{"huge":true}',
}

describe('previewing and saving a Look', () => {
  it('previews changes on the store row; a cleared colour falls back to the brand', () => {
    const row = previewLookRow(SAVED, { checkout_accent_color: '', 'tracking_style.accent': '#00ff00' })
    expect(row.checkout_accent_color).toBeNull()
    expect(row.tracking_style).toEqual({ accent: '#00ff00', hero_style: 'solid' })
    expect(row.storefront_labels).toEqual({ 'checkout.title': 'Pay' })
  })

  it('folds a JSON column over the CURRENT saved value, keeping keys the editor did not touch', () => {
    const current = { ...SAVED, tracking_style: { accent: '#ff0000', hero_style: 'gradient', corners: 'round' } }
    const patch = lookPatch({ 'tracking_style.accent': '#0000ff', checkout_text_color: '#222222' }, current)
    expect(patch).toEqual({
      checkout_text_color: '#222222',
      tracking_style: { accent: '#0000ff', hero_style: 'gradient', corners: 'round' },
    })
  })

  it('clears a JSON key with a blank value', () => {
    expect(lookPatch({ 'tracking_style.accent': '' }, SAVED)).toEqual({ tracking_style: { hero_style: 'solid' } })
  })

  it('finds the fields the Studio changed since the editor opened', () => {
    const base = { checkout_accent_color: '#111111', 'tracking_style.accent': '#ff0000' }
    const changes = { checkout_accent_color: '#333333', 'tracking_style.accent': '#00ff00' }
    expect(lookConflicts(changes, base, SAVED)).toEqual([])
    const studioSaved = { ...SAVED, tracking_style: { accent: '#abcdef' } }
    expect(lookConflicts(changes, base, studioSaved)).toEqual(['tracking_style.accent'])
    // Blank and missing are the same "not set".
    expect(lookConflicts({ checkout_border_color: '#000000' }, { checkout_border_color: null }, { checkout_border_color: '' })).toEqual([])
  })

  it('reads saved JSON columns as Studio field values', () => {
    expect(lookValues(SAVED)['tracking_style.hero_style']).toBe('solid')
    expect(lookValues(SAVED)['storefront_labels.checkout.title']).toBe('Pay')
  })

  it('leaves the stored builder designs out of the row it hands the browser', () => {
    expect(lookStoreRow(SAVED)).not.toHaveProperty('checkout_design')
    expect(lookStoreRow({ hero_design: 'x', welcome_design: 'y', name: 'Store' })).toEqual({ name: 'Store' })
  })
})

describe('saving twice and saving while editing', () => {
  it('does not read its own saved value as someone else’s change (publish retried)', () => {
    const changes = { checkout_accent_color: '#333333' }
    expect(lookConflicts(changes, { checkout_accent_color: '#111111' }, { checkout_accent_color: '#333333' })).toEqual([])
  })

  it('keeps edits made while a save was on its way', () => {
    const sent = { checkout_accent_color: '#333333', checkout_text_color: '#000000' }
    const now = { checkout_accent_color: '#444444', checkout_text_color: '#000000', checkout_border_color: '#cccccc' }
    expect(remainingLookChanges(now, sent)).toEqual({ checkout_accent_color: '#444444', checkout_border_color: '#cccccc' })
  })
})

describe('whole-store settings and phone overrides', () => {
  it('offers the status colours, main button and fonts on checkout and thank-you, never on tracking', () => {
    for (const page of ['checkout', 'confirmation'] as const) {
      expect(fieldIds(page)).toEqual(expect.arrayContaining(['success_color', 'warning_color', 'error_color', 'button_primary_color', 'font_pair']))
    }
    expect(fieldIds('tracking')).not.toContain('success_color')
  })

  it('reads a Studio phone override and lets the Look clear it, keeping the other phone settings', () => {
    const row = { checkout_accent_color: '#111111', mobile_overrides: { checkout_accent_color: '#ff0000', menu_card_template: 'zen' } }
    expect(lookValues(row)['mobile_overrides.checkout_accent_color']).toBe('#ff0000')
    expect(isPageLookField('checkout', 'mobile_overrides.checkout_accent_color')).toBe(true)
    // Only real Look fields, never JSON-column looks or unrelated columns.
    expect(isPageLookField('checkout', 'mobile_overrides.menu_card_template')).toBe(false)
    expect(isPageLookField('tracking', 'mobile_overrides.tracking_style.accent')).toBe(false)
    const changes = { checkout_accent_color: '#00aa00', 'mobile_overrides.checkout_accent_color': '' }
    expect(lookPatch(changes, row)).toEqual({ checkout_accent_color: '#00aa00', mobile_overrides: { menu_card_template: 'zen' } })
    expect(previewLookRow(row, changes).mobile_overrides).toEqual({ menu_card_template: 'zen' })
  })

  it('a phone override set in the Studio meanwhile is a conflict', () => {
    const base = { 'mobile_overrides.checkout_accent_color': null }
    const now = { mobile_overrides: { checkout_accent_color: '#ff0000' } }
    expect(lookConflicts({ 'mobile_overrides.checkout_accent_color': '' }, base, now)).toEqual(['mobile_overrides.checkout_accent_color'])
  })
})
