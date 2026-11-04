import type { CartLine } from '@/lib/cart/cart'
import { appOrderDraftSchema } from '@/lib/contract'
import { buildOrderDraft, draftFingerprint, stableStringify } from './draft'

const line: CartLine = {
  lineId: 'line-1',
  itemId: 'item-latte',
  name: 'Latte',
  imageUrl: null,
  selections: { 'grp-size': { 'opt-grande': 1 } },
  optionLabels: ['Grande'],
  quantity: 2,
  unitCentavos: 16500,
}

const input = {
  orderTypeId: 'ot-delivery',
  outletId: 'outlet-1',
  lines: [line],
  paymentMethodId: 'pm-gcash',
  paymentReference: '  1234 5678  ',
  voucherCode: null,
  rewardId: null,
  delivery: { address: '12 Rizal St, Makati', lat: 14.55, lng: 121.02, quoteToken: 'tok-1' },
  notes: '  gate 2 ',
}

describe('buildOrderDraft', () => {
  it('sends ids and picks only, trimmed, and passes the contract', () => {
    const draft = buildOrderDraft(input)
    expect(draft.lines).toEqual([{ itemId: 'item-latte', quantity: 2, selections: { 'grp-size': { 'opt-grande': 1 } } }])
    expect(draft.paymentReference).toBe('1234 5678')
    expect(draft.notes).toBe('gate 2')
    expect(appOrderDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('sends no payment method (null) for a store that offers none', () => {
    const draft = buildOrderDraft({ ...input, paymentMethodId: null })
    expect(draft.paymentMethodId).toBeNull()
    expect(appOrderDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('sends a blank reference or code as null', () => {
    expect(buildOrderDraft({ ...input, paymentReference: '   ', voucherCode: '' })).toMatchObject({ paymentReference: null, voucherCode: null })
  })
})

describe('draftFingerprint', () => {
  it('is the same for the same order whatever the key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })

  it('ignores a re-quoted courier token but not the pin, the bag or the payment', () => {
    const base = draftFingerprint(buildOrderDraft(input))
    expect(draftFingerprint(buildOrderDraft({ ...input, delivery: { ...input.delivery, quoteToken: 'tok-2' } }))).toBe(base)
    expect(draftFingerprint(buildOrderDraft({ ...input, delivery: { ...input.delivery, lat: 14.56 } }))).not.toBe(base)
    expect(draftFingerprint(buildOrderDraft({ ...input, lines: [{ ...line, quantity: 3 }] }))).not.toBe(base)
    expect(draftFingerprint(buildOrderDraft({ ...input, paymentReference: '999' }))).not.toBe(base)
  })
})
