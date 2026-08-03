/**
 * What a merchant is allowed to save.
 *
 * Every rule here exists because breaking it costs the merchant money in a way
 * they would not notice until the receipts came in: a 150% voucher that pays
 * customers to order, an uncapped percentage on a ₱10,000 catering order, a
 * scoped voucher with nothing selected that silently discounts nothing, or a
 * date window that closes before it opens.
 *
 * The engine already refuses to misbehave at redemption time. This is the
 * earlier, kinder failure — at the form, where it can still be corrected.
 */
import { describe, it, expect } from '@jest/globals'
import { validateVoucherDraft, normalizeVoucherCode } from '@/lib/vouchers/admin-validation'

function draft(overrides: Record<string, unknown> = {}) {
  return {
    code: 'SAVE10',
    name: '10% off',
    discountType: 'percent' as const,
    discountValue: 10,
    scope: 'universal' as const,
    isStackable: true,
    ...overrides,
  }
}

describe('normalizeVoucherCode', () => {
  it('upper-cases and trims so lookup matches what the customer typed', () => {
    expect(normalizeVoucherCode('  save10 ')).toBe('SAVE10')
  })

  it('collapses internal whitespace rather than storing a code nobody can type', () => {
    expect(normalizeVoucherCode('SAVE 10')).toBe('SAVE10')
  })
})

describe('validateVoucherDraft', () => {
  it('accepts a well-formed draft', () => {
    expect(validateVoucherDraft(draft()).errors).toEqual([])
  })

  it('requires a code', () => {
    expect(validateVoucherDraft(draft({ code: '   ' })).errors).toContainEqual(
      expect.objectContaining({ field: 'code' }),
    )
  })

  it('requires a name so the merchant can tell two codes apart', () => {
    expect(validateVoucherDraft(draft({ name: '' })).errors).toContainEqual(
      expect.objectContaining({ field: 'name' }),
    )
  })

  it('rejects a percentage over 100, which would pay the customer to order', () => {
    expect(validateVoucherDraft(draft({ discountValue: 150 })).errors).toContainEqual(
      expect.objectContaining({ field: 'discountValue' }),
    )
  })

  it('rejects a zero or negative discount', () => {
    expect(validateVoucherDraft(draft({ discountValue: 0 })).errors).toContainEqual(
      expect.objectContaining({ field: 'discountValue' }),
    )
    expect(validateVoucherDraft(draft({ discountValue: -5 })).errors).toContainEqual(
      expect.objectContaining({ field: 'discountValue' }),
    )
  })

  it('allows a fixed amount above 100, which is a peso value not a percentage', () => {
    expect(
      validateVoucherDraft(draft({ discountType: 'fixed', discountValue: 250 })).errors,
    ).toEqual([])
  })

  it('ignores the value entirely for free delivery', () => {
    expect(
      validateVoucherDraft(draft({ discountType: 'free_delivery', discountValue: 0 })).errors,
    ).toEqual([])
  })

  it('requires targets on a scoped voucher, which would otherwise match nothing', () => {
    expect(validateVoucherDraft(draft({ scope: 'products', targetIds: [] })).errors).toContainEqual(
      expect.objectContaining({ field: 'targetIds' }),
    )
    expect(
      validateVoucherDraft(draft({ scope: 'categories', targetIds: [] })).errors,
    ).toContainEqual(expect.objectContaining({ field: 'targetIds' }))
  })

  it('accepts a scoped voucher that has targets', () => {
    expect(
      validateVoucherDraft(draft({ scope: 'products', targetIds: ['m-1'] })).errors,
    ).toEqual([])
  })

  it('rejects a window that ends before it starts', () => {
    const errors = validateVoucherDraft(
      draft({ startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-08-01T00:00:00Z' }),
    ).errors

    expect(errors).toContainEqual(expect.objectContaining({ field: 'endsAt' }))
  })

  it('accepts an open-ended window', () => {
    expect(
      validateVoucherDraft(draft({ startsAt: '2026-09-01T00:00:00Z', endsAt: null })).errors,
    ).toEqual([])
  })

  it('rejects a negative usage limit', () => {
    expect(validateVoucherDraft(draft({ usageLimitTotal: -1 })).errors).toContainEqual(
      expect.objectContaining({ field: 'usageLimitTotal' }),
    )
  })

  it('treats a null usage limit as unlimited rather than an error', () => {
    expect(
      validateVoucherDraft(draft({ usageLimitTotal: null, usageLimitPerCustomer: null })).errors,
    ).toEqual([])
  })

  it('requires at least one channel, or the code works nowhere', () => {
    expect(validateVoucherDraft(draft({ channels: [] })).errors).toContainEqual(
      expect.objectContaining({ field: 'channels' }),
    )
  })

  it('warns when an uncapped percentage could cost more than intended', () => {
    // Not an error — a merchant may genuinely want it — but they should have
    // to see it before saving.
    const result = validateVoucherDraft(draft({ discountValue: 50, maxDiscountAmount: null }))

    expect(result.errors).toEqual([])
    expect(result.warnings).toContainEqual(expect.objectContaining({ field: 'maxDiscountAmount' }))
  })

  it('does not warn once the percentage is capped', () => {
    const result = validateVoucherDraft(draft({ discountValue: 50, maxDiscountAmount: 200 }))

    expect(result.warnings).toEqual([])
  })

  it('reports every problem at once rather than one per save', () => {
    const errors = validateVoucherDraft(
      draft({ code: '', name: '', discountValue: 999 }),
    ).errors

    expect(errors.map((e) => e.field).sort()).toEqual(['code', 'discountValue', 'name'])
  })
})
