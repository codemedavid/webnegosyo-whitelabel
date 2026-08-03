/**
 * The state behind the checkout's voucher field.
 *
 * The failure this guards against is a stale preview. A customer applies a code
 * at ₱1,000, then removes an item; the voucher's ₱500 minimum no longer holds,
 * but the summary still shows the discount. The server re-prices from the codes
 * and charges correctly — so the customer is shown one number and billed
 * another, which is the worst version of getting it right.
 *
 * The rule: any change to what the discount was computed against invalidates
 * the preview. Better a moment of "checking…" than a wrong total.
 */
import { describe, it, expect } from '@jest/globals'
import {
  addCode,
  removeCode,
  cartFingerprint,
  isPreviewStale,
  discountLinesFrom,
  type CheckoutVoucherState,
} from '@/lib/vouchers/checkout-codes'
import type { VoucherPreview } from '@/lib/vouchers/preview'

const PREVIEW: VoucherPreview = {
  accepted: [{ code: 'SAVE10', name: '10% off', description: null, amount: 100 }],
  rejected: [],
  discountTotal: 100,
  deliveryDiscount: 0,
}

const EMPTY: CheckoutVoucherState = { codes: [], preview: null, previewFingerprint: null }

describe('addCode', () => {
  it('adds a normalized code', () => {
    expect(addCode(EMPTY, ' save10 ').codes).toEqual(['SAVE10'])
  })

  it('refuses a duplicate rather than discounting twice', () => {
    const once = addCode(EMPTY, 'SAVE10')

    expect(addCode(once, 'save10').codes).toEqual(['SAVE10'])
  })

  it('ignores a blank entry', () => {
    expect(addCode(EMPTY, '   ').codes).toEqual([])
  })

  it('keeps entry order, which decides a solo-only conflict', () => {
    const state = addCode(addCode(EMPTY, 'FIRST'), 'SECOND')

    expect(state.codes).toEqual(['FIRST', 'SECOND'])
  })

  it('does not mutate the state it was given', () => {
    const before = { ...EMPTY, codes: ['A'] }
    addCode(before, 'B')

    expect(before.codes).toEqual(['A'])
  })

  it('drops a preview that no longer describes the code list', () => {
    const applied = { codes: ['SAVE10'], preview: PREVIEW, previewFingerprint: 'f1' }

    expect(addCode(applied, 'SECOND').preview).toBeNull()
  })
})

describe('removeCode', () => {
  it('removes the code', () => {
    const applied = { codes: ['SAVE10', 'SECOND'], preview: PREVIEW, previewFingerprint: 'f1' }

    expect(removeCode(applied, 'SAVE10').codes).toEqual(['SECOND'])
  })

  it('drops the preview, because stacking changes what the others are worth', () => {
    const applied = { codes: ['SAVE10', 'SECOND'], preview: PREVIEW, previewFingerprint: 'f1' }

    expect(removeCode(applied, 'SAVE10').preview).toBeNull()
  })

  it('clears the preview entirely when the last code goes', () => {
    const applied = { codes: ['SAVE10'], preview: PREVIEW, previewFingerprint: 'f1' }
    const state = removeCode(applied, 'SAVE10')

    expect(state.codes).toEqual([])
    expect(state.preview).toBeNull()
  })

  it('matches case-insensitively, so the chip removes what it shows', () => {
    const applied = { codes: ['SAVE10'], preview: null, previewFingerprint: null }

    expect(removeCode(applied, 'save10').codes).toEqual([])
  })
})

describe('cartFingerprint', () => {
  const cart = [{ id: 'l-1', subtotal: 600 }, { id: 'l-2', subtotal: 400 }]

  it('is stable for the same cart and charges', () => {
    expect(cartFingerprint(cart, 50, 25)).toBe(cartFingerprint(cart, 50, 25))
  })

  it('changes when a line amount changes', () => {
    const changed = [{ id: 'l-1', subtotal: 600 }, { id: 'l-2', subtotal: 200 }]

    expect(cartFingerprint(changed, 50, 25)).not.toBe(cartFingerprint(cart, 50, 25))
  })

  it('changes when a line is removed', () => {
    expect(cartFingerprint([cart[0]], 50, 25)).not.toBe(cartFingerprint(cart, 50, 25))
  })

  it('changes when the delivery fee changes, which free-delivery codes depend on', () => {
    expect(cartFingerprint(cart, 80, 25)).not.toBe(cartFingerprint(cart, 50, 25))
  })

  it('changes when the service charge changes', () => {
    expect(cartFingerprint(cart, 50, 0)).not.toBe(cartFingerprint(cart, 50, 25))
  })
})

describe('isPreviewStale', () => {
  it('is stale when the cart moved under it', () => {
    const state = { codes: ['SAVE10'], preview: PREVIEW, previewFingerprint: 'old' }

    expect(isPreviewStale(state, 'new')).toBe(true)
  })

  it('is fresh when nothing changed', () => {
    const state = { codes: ['SAVE10'], preview: PREVIEW, previewFingerprint: 'same' }

    expect(isPreviewStale(state, 'same')).toBe(false)
  })

  it('is not stale when there is no preview to be stale', () => {
    expect(isPreviewStale(EMPTY, 'anything')).toBe(false)
  })
})

describe('discountLinesFrom', () => {
  it('turns an accepted preview into lines computeOrderTotals understands', () => {
    expect(discountLinesFrom(PREVIEW)).toEqual([
      { label: '10% off', amount: 100, code: 'SAVE10' },
    ])
  })

  it('produces nothing from a null preview, so the total stays full price', () => {
    expect(discountLinesFrom(null)).toEqual([])
  })

  it('produces nothing when every code was rejected', () => {
    const rejected: VoucherPreview = {
      accepted: [],
      rejected: [{ code: 'NOPE', reason: 'not_found', message: 'Not recognised.' }],
      discountTotal: 0,
      deliveryDiscount: 0,
    }

    expect(discountLinesFrom(rejected)).toEqual([])
  })
})
