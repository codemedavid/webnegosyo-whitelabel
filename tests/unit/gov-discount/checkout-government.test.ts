import { describe, it, expect } from '@jest/globals'
import { defaultTaxProfile } from '@/lib/gov-discount'
import {
  parseCheckoutGovClaim,
  priceCheckoutGovernment,
  type CheckoutGovInput,
} from '@/lib/gov-discount-checkout/checkout-government'

const input = (overrides: Partial<CheckoutGovInput> = {}): CheckoutGovInput => ({
  claim: { kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345' },
  items: [
    { menu_item_id: 'm-sisig', menu_item_name: 'Sisig', quantity: 1, subtotal: 560 },
    { menu_item_id: 'm-mug', menu_item_name: 'Mug', quantity: 1, subtotal: 300 },
  ],
  profile: defaultTaxProfile('vat'),
  excludedMenuItemIds: new Set(['m-mug']),
  serviceCharge: 0,
  deliveryFee: 49,
  otherReduction: 0,
  ...overrides,
})

describe('parseCheckoutGovClaim', () => {
  it('accepts who is claiming and nothing else', () => {
    expect(parseCheckoutGovClaim({ kind: 'pwd', name: 'Ana Cruz', idNumber: '13-7404-000-0001234' })).toEqual({
      kind: 'pwd',
      name: 'Ana Cruz',
      idNumber: '13-7404-000-0001234',
    })
    expect(parseCheckoutGovClaim({ kind: 'senior', name: 'Ana Cruz', idNumber: '1', amount: 999 })).toBeNull()
    expect(parseCheckoutGovClaim({ kind: 'student', name: 'Ana', idNumber: '123' })).toBeNull()
    expect(parseCheckoutGovClaim(undefined)).toBeNull()
  })
})

describe('priceCheckoutGovernment', () => {
  it('discounts the eligible items of an online order, never the delivery fee', () => {
    const outcome = priceCheckoutGovernment(input())

    expect(outcome.status).toBe('applied')
    if (outcome.status !== 'applied') return
    expect(outcome.reduction).toBe(160)
    expect(outcome.payload.allocationsByLine).toEqual({ 'line-0': 160 })
    expect(outcome.government.vat?.vatExemptSales).toBe(500)
    expect(outcome.lines.every((line) => line.isGovernment)).toBe(true)
  })

  it('keeps the vouchers when they save more (never both)', () => {
    const outcome = priceCheckoutGovernment(input({ otherReduction: 400 }))

    expect(outcome).toEqual({ status: 'outranked', governmentReduction: 160, otherReduction: 400 })
  })

  it('refuses a kind the store does not offer', () => {
    const outcome = priceCheckoutGovernment(input({ claim: { kind: 'athlete', name: 'Ana Cruz', idNumber: '12345' } }))

    expect(outcome.status).toBe('refused')
  })

  it('refuses when nothing on the order is covered', () => {
    const outcome = priceCheckoutGovernment(input({ excludedMenuItemIds: new Set(['m-sisig', 'm-mug']) }))

    expect(outcome.status).toBe('refused')
  })
})
