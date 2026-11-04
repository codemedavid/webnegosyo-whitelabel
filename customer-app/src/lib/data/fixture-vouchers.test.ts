import { VALID_CATALOG } from '@/fixtures/contract-fixtures'
import { appCatalogSchema, appVoucherPreviewSchema } from '@/lib/contract'
import { prototypeVoucherDiscount, prototypeVoucherPreview, type PrototypeVoucher } from './fixture-vouchers'

const percent: PrototypeVoucher = { code: 'KAPE10', label: '10% off', kind: 'percent', value: 10, maxDiscount: 50, minSpend: 200 }
const catalog = appCatalogSchema.parse(VALID_CATALOG)

describe('prototypeVoucherDiscount (demo server)', () => {
  it('takes the percent off, capped, from the minimum spend up', () => {
    expect(prototypeVoucherDiscount(percent, 30000)).toEqual({ isApplied: true, discountCentavos: 3000 })
    expect(prototypeVoucherDiscount(percent, 90000)).toEqual({ isApplied: true, discountCentavos: 5000 })
    expect(prototypeVoucherDiscount(percent, 15000)).toEqual({ isApplied: false, discountCentavos: 0, reason: 'Add ₱50 more to use KAPE10' })
  })

  it('never takes more than the subtotal', () => {
    const fixed: PrototypeVoucher = { code: 'LESS100', label: '₱100 off', kind: 'fixed', value: 100, maxDiscount: null, minSpend: null }
    expect(prototypeVoucherDiscount(fixed, 8000).discountCentavos).toBe(8000)
  })
})

describe('prototypeVoucherPreview', () => {
  it('answers in the contract shape for the bag, and null for an unknown code', () => {
    const lines = [{ itemId: 'item-latte', quantity: 2, selections: { size: { grande: 1 }, milk: { oat: 1 } } }]
    const preview = prototypeVoucherPreview({ code: 'kape10', orderTypeId: 'ot-pickup', outletId: null, lines }, catalog)
    expect(appVoucherPreviewSchema.safeParse(preview).success).toBe(true)
    expect(preview).toMatchObject({ code: 'KAPE10', isApplied: true, discount: 39 })
    expect(prototypeVoucherPreview({ code: 'NOPE', orderTypeId: 'ot-pickup', outletId: null, lines }, catalog)).toBeNull()
  })
})
