/**
 * Checkout questions finally read `validation_rules`: only the known keys,
 * patterns from a fixed list (never a regex the owner typed), and the new
 * kinds — a tick box that must be ticked, a real calendar date. Mistakes come
 * back per question, the first one each, for the form to show beside it.
 */

import { fieldErrorMap, validateCheckoutFields, type ValidatableField } from '@/lib/checkout-field-validation'
import { FIELD_PATTERNS, readFieldRules, withFieldRules } from '@/lib/checkout-field-rules'

function field(overrides: Partial<ValidatableField> = {}): ValidatableField {
  return { field_name: 'q', field_label: 'Plate', field_type: 'text', is_required: false, ...overrides }
}

describe('readFieldRules', () => {
  it('keeps only known keys with well-formed values', () => {
    expect(
      readFieldRules({
        help: '  Shown under the box  ',
        width: 'half',
        minLength: 3,
        maxLength: 1e9,
        digitsOnly: 'yes',
        pattern: '^(a+)+$',
        min: 0,
        max: 'ten',
        evil: true,
      }),
    ).toEqual({ help: 'Shown under the box', width: 'half', minLength: 3, min: 0 })
  })

  it.each([null, undefined, 'x', 3, ['help']])('reads %p as no rules', (raw) => {
    expect(readFieldRules(raw)).toEqual({})
  })

  it('a pattern is one of the fixed presets', () => {
    expect(readFieldRules({ pattern: 'plate' }).pattern).toBe('plate')
    expect(readFieldRules({ pattern: '__proto__' }).pattern).toBeUndefined()
    expect(readFieldRules({ pattern: 'constructor' }).pattern).toBeUndefined()
  })

  it('withFieldRules sets and clears known keys and keeps everything else', () => {
    const next = withFieldRules({ legacy: 1, help: 'old' }, { help: '', width: 'half', digitsOnly: false, bogus: 1 } as never)
    expect(next).toEqual({ legacy: 1, width: 'half' })
  })
})

describe('validateCheckoutFields with rules', () => {
  const plate = field({ validation_rules: { pattern: 'plate' } })

  it.each(['ABC 1234', 'abc123', 'NBC1234'])('accepts the plate %p', (value) => {
    expect(validateCheckoutFields([plate], { q: value })).toEqual([])
  })

  it.each(['AB 1234', 'ABCD 123', '1234 ABC'])('refuses the plate %p with an example', (value) => {
    expect(validateCheckoutFields([plate], { q: value })).toEqual([{ fieldName: 'q', message: `Plate should look like ${FIELD_PATTERNS.plate.example}` }])
  })

  it('checks lengths and digits only on a filled-in answer', () => {
    const rules = { minLength: 3, maxLength: 5, digitsOnly: true }
    expect(validateCheckoutFields([field({ validation_rules: rules })], { q: '' })).toEqual([])
    expect(validateCheckoutFields([field({ validation_rules: rules })], { q: '12' })[0].message).toMatch(/at least 3/)
    expect(validateCheckoutFields([field({ validation_rules: rules })], { q: '123456' })[0].message).toMatch(/at most 5/)
    expect(validateCheckoutFields([field({ validation_rules: rules })], { q: '12a' })[0].message).toMatch(/only have numbers/)
    expect(validateCheckoutFields([field({ validation_rules: rules })], { q: '1-23' })).toEqual([])
  })

  it('checks number bounds', () => {
    const qty = field({ field_label: 'Guests', field_type: 'number', validation_rules: { min: 1, max: 20 } })
    expect(validateCheckoutFields([qty], { q: '0' })[0].message).toBe('Guests should be at least 1')
    expect(validateCheckoutFields([qty], { q: '21' })[0].message).toBe('Guests should be at most 20')
    expect(validateCheckoutFields([qty], { q: '4' })).toEqual([])
  })

  it('a required tick box must be ticked; an optional one never complains', () => {
    const agree = field({ field_label: 'I agree to the house rules', field_type: 'checkbox', is_required: true })
    expect(validateCheckoutFields([agree], {})).toEqual([{ fieldName: 'q', message: 'Please tick “I agree to the house rules”' }])
    expect(validateCheckoutFields([agree], { q: 'no' })).toHaveLength(1)
    expect(validateCheckoutFields([agree], { q: 'yes' })).toEqual([])
    expect(validateCheckoutFields([{ ...agree, is_required: false }], {})).toEqual([])
  })

  it('a date must be a real day', () => {
    const date = field({ field_label: 'Event date', field_type: 'date' })
    expect(validateCheckoutFields([date], { q: '2026-02-30' })[0].message).toBe('Event date should be a date')
    expect(validateCheckoutFields([date], { q: 'tomorrow' })).toHaveLength(1)
    expect(validateCheckoutFields([date], { q: '2026-12-24' })).toEqual([])
  })

  it('a required choice is required like any answer', () => {
    const size = field({ field_label: 'Size', field_type: 'choice', is_required: true })
    expect(validateCheckoutFields([size], {})).toEqual([{ fieldName: 'q', message: 'Size is required' }])
  })

  it('maps mistakes to their question, first one each', () => {
    expect(
      fieldErrorMap([
        { fieldName: 'a', message: 'first' },
        { fieldName: 'a', message: 'second' },
        { fieldName: 'b', message: 'other' },
      ]),
    ).toEqual({ a: 'first', b: 'other' })
  })
})
