import {
  mergeMobileOverrides,
  applyMobileOverrides,
  resolveDeviceTemplate,
} from '@/lib/mobile-overrides'

/**
 * Per-device (mobile) branding overrides. The Branding Studio writes a tenant's
 * mobile choices into the `mobile_overrides` JSONB map keyed by the desktop
 * column name; the storefront overlays that map on a mobile viewport.
 */
describe('mergeMobileOverrides', () => {
  it('sets non-blank draft values and never mutates the input', () => {
    const existing = { card_template: 'classic' }
    const next = mergeMobileOverrides(existing, { page_layout: 'sidebar' })
    expect(next).toEqual({ card_template: 'classic', page_layout: 'sidebar' })
    expect(existing).toEqual({ card_template: 'classic' })
  })

  it('removes a key when the draft blanks it (inherit desktop again)', () => {
    const next = mergeMobileOverrides({ card_template: 'modern' }, { card_template: '' })
    expect(next).toEqual({})
  })
})

describe('applyMobileOverrides', () => {
  it('overlays non-blank overrides onto the base object', () => {
    const base = { card_template: 'classic', primary_color: '#111' }
    expect(applyMobileOverrides(base, { card_template: 'modern' })).toEqual({
      card_template: 'modern',
      primary_color: '#111',
    })
  })

  it('ignores blank overrides so a stray empty entry cannot blank a real value', () => {
    const base = { card_template: 'classic' }
    expect(applyMobileOverrides(base, { card_template: '' })).toBe(base)
  })

  it('returns the base untouched when there are no overrides', () => {
    const base = { card_template: 'classic' }
    expect(applyMobileOverrides(base, null)).toBe(base)
    expect(applyMobileOverrides(base, {})).toBe(base)
  })
})

/**
 * resolveDeviceTemplate picks a template for the mobile viewport. The studio's
 * per-device choice (from mobile_overrides) is authoritative; a legacy dedicated
 * `mobile_*` column is honored only as a fallback; blank / 'inherit' means "use
 * desktop". This is the fix for the mobile card template being silently shadowed
 * by a stale mobile_card_template column.
 */
describe('resolveDeviceTemplate', () => {
  it('prefers the mobile_overrides value over the legacy column', () => {
    expect(resolveDeviceTemplate('modern', 'classic', 'elegant')).toBe('modern')
  })

  it('falls back to the legacy mobile column when no override is set', () => {
    expect(resolveDeviceTemplate(undefined, 'classic', 'elegant')).toBe('classic')
    expect(resolveDeviceTemplate('', 'classic', 'elegant')).toBe('classic')
  })

  it('falls back to the desktop value when neither is set', () => {
    expect(resolveDeviceTemplate(undefined, null, 'elegant')).toBe('elegant')
    expect(resolveDeviceTemplate('', undefined, 'elegant')).toBe('elegant')
  })

  it("treats 'inherit' as blank in both the override and the legacy column", () => {
    expect(resolveDeviceTemplate('inherit', 'classic', 'elegant')).toBe('classic')
    expect(resolveDeviceTemplate('inherit', 'inherit', 'elegant')).toBe('elegant')
  })

  it('ignores non-string override values', () => {
    expect(resolveDeviceTemplate(42, 'classic', 'elegant')).toBe('classic')
    expect(resolveDeviceTemplate(null, undefined, 'elegant')).toBe('elegant')
  })
})
