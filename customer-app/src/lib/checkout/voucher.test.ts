import type { CartLine } from '@/lib/cart/cart'
import { appVoucherPreviewRequestSchema, type AppVoucherPreview } from '@/lib/contract'
import { voucherCodeToSend, voucherDiscountCentavos, voucherPreviewKey, voucherPreviewRequest, voucherStatus } from './voucher'

const latte: CartLine = {
  lineId: 'line-1',
  itemId: 'item-latte',
  name: 'Latte',
  imageUrl: null,
  selections: { 'grp-size': { 'opt-grande': 1 } },
  optionLabels: [],
  quantity: 1,
  unitCentavos: 16500,
}
const inputs = { code: 'KAPE10', orderTypeId: 'ot-pickup', outletId: 'outlet-1', lines: [latte] }
const keyOf = (next: Partial<typeof inputs>) => {
  const request = voucherPreviewRequest({ ...inputs, ...next })
  return request ? voucherPreviewKey(request) : null
}
const applied: AppVoucherPreview = { code: 'KAPE10', label: '10% off', isApplied: true, discount: 16.5, reason: null }

describe('voucherPreviewRequest', () => {
  it('asks for a contract-valid preview of this bag', () => {
    const request = voucherPreviewRequest({ ...inputs, code: ' kape10 ' })
    expect(request).toEqual({ code: 'kape10', orderTypeId: 'ot-pickup', outletId: 'outlet-1', lines: [{ itemId: 'item-latte', quantity: 1, selections: { 'grp-size': { 'opt-grande': 1 } } }] })
    expect(appVoucherPreviewRequestSchema.safeParse(request).success).toBe(true)
  })

  it('asks for nothing without a code, an order type or a bag', () => {
    expect(voucherPreviewRequest({ ...inputs, code: null })).toBeNull()
    expect(voucherPreviewRequest({ ...inputs, code: '  ' })).toBeNull()
    expect(voucherPreviewRequest({ ...inputs, orderTypeId: undefined })).toBeNull()
    expect(voucherPreviewRequest({ ...inputs, lines: [] })).toBeNull()
  })
})

describe('re-preview inputs', () => {
  const base = keyOf({})

  it('re-previews when the bag, the order type or the branch changes', () => {
    expect(keyOf({ lines: [{ ...latte, quantity: 2 }] })).not.toBe(base)
    expect(keyOf({ lines: [{ ...latte, selections: { 'grp-size': { 'opt-venti': 1 } } }] })).not.toBe(base)
    expect(keyOf({ orderTypeId: 'ot-delivery' })).not.toBe(base)
    expect(keyOf({ outletId: 'outlet-2' })).not.toBe(base)
  })

  it('does not re-preview for things the voucher cannot see (labels, line ids, prices on the phone)', () => {
    expect(keyOf({ lines: [{ ...latte, lineId: 'line-9', name: 'Cafe latte', unitCentavos: 1, optionLabels: ['x'] }] })).toBe(base)
  })
})

describe('voucherStatus', () => {
  const settled = { hasCode: true, isSettled: true, isPlaceholder: false, preview: applied, isError: false }

  it('is none without a code and checking until the bag is still and its own preview is in', () => {
    expect(voucherStatus({ ...settled, hasCode: false })).toBe('none')
    expect(voucherStatus({ ...settled, isSettled: false })).toBe('checking')
    expect(voucherStatus({ ...settled, isPlaceholder: true })).toBe('checking')
    expect(voucherStatus({ ...settled, preview: undefined })).toBe('checking')
  })

  it('reads the store answer: applied, not yet, unknown code, or failed', () => {
    expect(voucherStatus(settled)).toBe('applied')
    expect(voucherStatus({ ...settled, preview: { ...applied, isApplied: false, discount: 0, reason: 'Add ₱35 more' } })).toBe('notApplied')
    expect(voucherStatus({ ...settled, preview: null })).toBe('invalid')
    expect(voucherStatus({ ...settled, preview: undefined, isError: true })).toBe('failed')
    // The new bag's preview failed while the old answer is still shown: never keep the old discount.
    expect(voucherStatus({ ...settled, isPlaceholder: true, isError: true })).toBe('failed')
    // A background refresh that failed keeps the answer we have for this very bag.
    expect(voucherStatus({ ...settled, isError: true })).toBe('applied')
  })

  it('takes off and sends only an applied, settled answer — the server’s amount', () => {
    expect(voucherDiscountCentavos('applied', applied)).toBe(1650)
    expect(voucherCodeToSend('applied', applied)).toBe('KAPE10')
    for (const status of ['checking', 'notApplied', 'invalid', 'failed'] as const) {
      expect(voucherDiscountCentavos(status, applied)).toBe(0)
      expect(voucherCodeToSend(status, applied)).toBeNull()
    }
  })
})
