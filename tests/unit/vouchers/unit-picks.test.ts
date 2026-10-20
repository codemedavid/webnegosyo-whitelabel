import { sanitizeUnitPicks } from '@/lib/vouchers/unit-picks'
import { priceOrderWithVouchers } from '@/lib/vouchers/order-pricing'
import { toOrderLinePicks } from '@/lib/vouchers/checkout-preview-lines'
import type { Voucher } from '@/lib/vouchers/types'

describe('sanitizeUnitPicks', () => {
  it('keeps whole positive units per line, keyed by upper-cased code', () => {
    expect(sanitizeUnitPicks({ fries50: { 'line-0': 1, 'line-1': 0, 'line-2': 1.5, 'line-3': '2' } })).toEqual({
      FRIES50: { 'line-0': 1 },
    })
  })

  it('drops anything that is not a plain object', () => {
    expect(sanitizeUnitPicks(null)).toEqual({})
    expect(sanitizeUnitPicks([1])).toEqual({})
    expect(sanitizeUnitPicks({ A: [1] })).toEqual({})
  })
})

describe('toOrderLinePicks', () => {
  it('turns preview line ids into the order positions the server prices by', () => {
    const lines = [{ id: 'cart-a' }, { id: 'cart-b' }, { id: 'bundle-line-0' }]
    expect(toOrderLinePicks({ FRIES50: { 'cart-b': 1, gone: 1 } }, lines)).toEqual({ FRIES50: { 'line-1': 1 } })
  })
})

describe('server pricing with picks', () => {
  const voucher: Voucher = {
    id: 'v-1',
    code: 'ONEHALF',
    name: 'Half off one',
    discountType: 'percent',
    discountValue: 50,
    scope: 'universal',
    isStackable: true,
    usedCount: 0,
    channels: ['checkout'],
    isActive: true,
    maxDiscountedUnits: 1,
  }
  const lookup = {
    findByCodes: async () => [voucher],
    countCustomerRedemptions: async () => ({}),
  }
  const items = [
    { menu_item_id: 'fries', quantity: 5, subtotal: 560 },
    { menu_item_id: 'burger', quantity: 1, subtotal: 150 },
  ]

  it('honours the chosen item and stores the dish on the discount line', async () => {
    const priced = await priceOrderWithVouchers({
      tenantId: 't',
      items,
      voucherCodes: ['onehalf'],
      channel: 'checkout',
      now: new Date('2026-10-15T00:00:00Z'),
      lookup,
      unitPicks: { ONEHALF: { 'line-1': 1 } },
    })

    expect(priced.totals.discountTotal).toBe(75)
    expect(priced.discountPayload?.lines[0].items).toEqual([{ lineKey: 'line-1', units: 1, amount: 75 }])
    expect(priced.discountPayload?.allocationsByLine).toEqual({ 'line-1': 75 })
  })

  it('falls back to the cheapest unit without picks', async () => {
    const priced = await priceOrderWithVouchers({
      tenantId: 't',
      items,
      voucherCodes: ['ONEHALF'],
      channel: 'checkout',
      now: new Date('2026-10-15T00:00:00Z'),
      lookup,
    })

    expect(priced.totals.discountTotal).toBe(56)
  })
})

describe('checkout preview of a voucher that discounts N items', () => {
  it('names the limit, the lines it may land on and where it landed', async () => {
    const { buildVoucherPreview } = await import('@/lib/vouchers/preview')
    const voucher: Voucher = {
      id: 'v-1',
      code: 'ONEHALF',
      name: 'Half off one',
      discountType: 'percent',
      discountValue: 50,
      scope: 'universal',
      isStackable: true,
      usedCount: 0,
      channels: ['checkout'],
      isActive: true,
      maxDiscountedUnits: 1,
    }
    const preview = await buildVoucherPreview({
      tenantId: 't',
      codes: ['ONEHALF'],
      lookup: { findByCodes: async () => [voucher], countCustomerRedemptions: async () => ({}) },
      context: {
        lines: [
          { id: 'cart-fries', menuItemId: 'fries', quantity: 5, subtotal: 560 },
          { id: 'cart-burger', menuItemId: 'burger', quantity: 1, subtotal: 150 },
        ],
        deliveryFee: 0,
        serviceCharge: 0,
        channel: 'checkout',
        now: new Date('2026-10-15T00:00:00Z'),
        unitPicks: { ONEHALF: { 'cart-burger': 1 } },
      },
    })

    expect(preview.accepted[0]).toMatchObject({
      amount: 75,
      unitLimit: 1,
      eligibleLineIds: ['cart-fries', 'cart-burger'],
      items: [{ lineId: 'cart-burger', units: 1 }],
    })
  })
})
