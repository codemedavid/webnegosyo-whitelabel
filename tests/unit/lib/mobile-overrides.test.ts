/**
 * Per-device (mobile) branding overrides. A single JSONB map of
 * column_name -> value is overlaid over the desktop columns when the viewport
 * is mobile. Empty map = inherit desktop.
 */
import {
  mergeMobileOverrides,
  resolveMobileFieldValue,
  applyMobileOverrides,
} from '@/lib/mobile-overrides'

describe('mergeMobileOverrides (publish)', () => {
  it('adds a new override and keeps existing ones', () => {
    const result = mergeMobileOverrides({ primary_color: '#111' }, { card_template: 'compact' })
    expect(result).toEqual({ primary_color: '#111', card_template: 'compact' })
  })

  it('overwrites an existing override', () => {
    const result = mergeMobileOverrides({ primary_color: '#111' }, { primary_color: '#222' })
    expect(result.primary_color).toBe('#222')
  })

  it('deletes a key when the draft clears it (empty string / null)', () => {
    expect(mergeMobileOverrides({ primary_color: '#111' }, { primary_color: '' })).toEqual({})
    expect(mergeMobileOverrides({ a: '1', b: '2' }, { a: null })).toEqual({ b: '2' })
  })

  it('does not mutate the existing map', () => {
    const existing = { primary_color: '#111' }
    mergeMobileOverrides(existing, { card_template: 'compact' })
    expect(existing).toEqual({ primary_color: '#111' })
  })
})

describe('resolveMobileFieldValue (editor field row)', () => {
  const desktopValue = '#desktop'

  it('returns the mobile draft value when set', () => {
    expect(resolveMobileFieldValue('primary_color', { primary_color: '#m' }, {}, desktopValue)).toBe('#m')
  })

  it('falls back to the saved mobile override when the draft has no entry', () => {
    expect(resolveMobileFieldValue('primary_color', {}, { primary_color: '#saved' }, desktopValue)).toBe('#saved')
  })

  it('falls back to the desktop value when there is no mobile override', () => {
    expect(resolveMobileFieldValue('primary_color', {}, {}, desktopValue)).toBe(desktopValue)
  })

  it('treats a cleared draft entry as "inherit desktop"', () => {
    expect(resolveMobileFieldValue('primary_color', { primary_color: '' }, { primary_color: '#saved' }, desktopValue)).toBe(desktopValue)
  })
})

describe('applyMobileOverrides (runtime overlay)', () => {
  it('overlays overrides over the base tenant on mobile', () => {
    const base = { primary_color: '#111', card_template: 'classic' }
    expect(applyMobileOverrides(base, { card_template: 'compact' })).toEqual({
      primary_color: '#111',
      card_template: 'compact',
    })
  })

  it('returns the base unchanged when overrides are empty or missing', () => {
    const base = { primary_color: '#111' }
    expect(applyMobileOverrides(base, {})).toEqual(base)
    expect(applyMobileOverrides(base, undefined)).toEqual(base)
  })

  it('ignores blank override values so they never blank out a desktop value', () => {
    const base = { primary_color: '#111' }
    expect(applyMobileOverrides(base, { primary_color: '' })).toEqual({ primary_color: '#111' })
  })
})
