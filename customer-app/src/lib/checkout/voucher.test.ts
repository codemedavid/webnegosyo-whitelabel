import { voucherDiscount, type VoucherTerms } from './voucher'

const percent: VoucherTerms = { code: 'KAPE10', label: '10% off', kind: 'percent', value: 10, maxDiscount: 50, minSpend: 200 }

describe('voucherDiscount', () => {
  it('takes the percentage off the subtotal', () => {
    expect(voucherDiscount(percent, 30000)).toEqual({ isApplied: true, discountCentavos: 3000 })
  })

  it('caps the discount at the voucher maximum', () => {
    expect(voucherDiscount(percent, 90000)).toEqual({ isApplied: true, discountCentavos: 5000 })
  })

  it('refuses below the minimum spend and says how much is missing', () => {
    expect(voucherDiscount(percent, 15000)).toEqual({
      isApplied: false,
      discountCentavos: 0,
      reason: 'Add ₱50 more to use KAPE10',
    })
  })

  it('never takes a fixed amount past the subtotal', () => {
    const fixed: VoucherTerms = { code: 'LESS100', label: '₱100 off', kind: 'fixed', value: 100, maxDiscount: null, minSpend: null }
    expect(voucherDiscount(fixed, 8000).discountCentavos).toBe(8000)
  })

  it('rounds a percentage to whole centavos', () => {
    const odd: VoucherTerms = { ...percent, value: 15, maxDiscount: null, minSpend: null }
    expect(voucherDiscount(odd, 14533).discountCentavos).toBe(2180)
  })
})
