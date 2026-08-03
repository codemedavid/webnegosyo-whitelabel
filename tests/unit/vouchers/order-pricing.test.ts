/**
 * The authoritative price of a discounted order.
 *
 * This is the security boundary of the whole feature. Everything above it —
 * the checkout preview, the register's running total — is a rendering hint
 * computed on a machine the customer controls. This function is what decides
 * what is actually charged, and it takes CODES, never amounts. A design that
 * accepts a client-sent discount lets anyone set it to the order total and
 * check out for nothing.
 *
 * It mirrors how `createOrderAction` already re-validates the delivery fee and
 * the outlet id rather than trusting what the browser sent.
 */
import { describe, it, expect, jest } from '@jest/globals'
import { priceOrderWithVouchers } from '@/lib/vouchers/order-pricing'
import type { VoucherLookup } from '@/lib/vouchers/resolve'
import type { Voucher } from '@/lib/vouchers/types'

const NOW = new Date('2026-08-03T10:00:00.000Z')

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v-1',
    code: 'SAVE10',
    name: '10% off',
    discountType: 'percent',
    discountValue: 10,
    scope: 'universal',
    isStackable: true,
    usedCount: 0,
    channels: ['checkout', 'pos', 'admin'],
    isActive: true,
    ...overrides,
  }
}

function makeLookup(vouchers: readonly Voucher[]): VoucherLookup {
  return {
    findByCodes: jest.fn(async (_t: string, codes: readonly string[]) =>
      vouchers.filter((v) => codes.includes(v.code)),
    ),
    countCustomerRedemptions: jest.fn(async () => ({})),
  }
}

const ITEMS = [
  { menu_item_id: 'm-1', quantity: 1, subtotal: 600 },
  { menu_item_id: 'm-2', quantity: 2, subtotal: 400 },
]

function priceWith(overrides: Record<string, unknown> = {}) {
  return priceOrderWithVouchers({
    tenantId: 'tenant-1',
    items: ITEMS,
    deliveryFee: 50,
    serviceCharge: 25,
    voucherCodes: ['SAVE10'],
    channel: 'checkout',
    now: NOW,
    lookup: makeLookup([makeVoucher()]),
    ...overrides,
  })
}

describe('priceOrderWithVouchers', () => {
  it('subtracts the discount it computed itself from the grand total', async () => {
    const priced = await priceWith()

    // subtotal 1000 + delivery 50 + service 25 = 1075, less 10% of 1000.
    expect(priced.totals.subtotal).toBe(1000)
    expect(priced.totals.discountTotal).toBe(100)
    expect(priced.totals.grandTotal).toBe(975)
  })

  it('charges full price when no code was supplied', async () => {
    const priced = await priceWith({ voucherCodes: [] })

    expect(priced.totals.discountTotal).toBe(0)
    expect(priced.totals.grandTotal).toBe(1075)
  })

  it('ignores a discount amount the caller tries to supply', async () => {
    // The client is free to send whatever it likes; none of it is an input.
    const priced = await priceWith({
      discountTotal: 1075,
      discount_total: 1075,
      discount: { total: 1075 },
    })

    expect(priced.totals.discountTotal).toBe(100)
    expect(priced.totals.grandTotal).toBe(975)
  })

  it('charges full price for a code that does not exist', async () => {
    const priced = await priceWith({
      voucherCodes: ['FREE100'],
      lookup: makeLookup([]),
    })

    expect(priced.totals.discountTotal).toBe(0)
    expect(priced.totals.grandTotal).toBe(1075)
    expect(priced.application.notFound).toEqual(['FREE100'])
  })

  it('never lets a discount drive the total below zero', async () => {
    const priced = await priceWith({
      deliveryFee: 0,
      serviceCharge: 0,
      lookup: makeLookup([
        makeVoucher({ discountType: 'fixed', discountValue: 99_999 }),
      ]),
    })

    expect(priced.totals.grandTotal).toBe(0)
    expect(priced.totals.discountTotal).toBe(1000)
  })

  it('produces a payload ready to persist, and none when nothing was discounted', async () => {
    const discounted = await priceWith()
    expect(discounted.discountPayload).toEqual(
      expect.objectContaining({ total: 100 }),
    )

    const undiscounted = await priceWith({ voucherCodes: [] })
    expect(undiscounted.discountPayload).toBeNull()
  })

  it('reports which vouchers to burn, with the amount each actually took off', async () => {
    const priced = await priceWith()

    expect(priced.redemptions).toEqual([
      expect.objectContaining({ voucherId: 'v-1', code: 'SAVE10', amount: 100 }),
    ])
  })

  it('has nothing to burn when every code was rejected', async () => {
    const priced = await priceWith({ lookup: makeLookup([]) })

    expect(priced.redemptions).toEqual([])
  })

  it('applies a category-scoped voucher using the categories it was given', async () => {
    const priced = await priceWith({
      lookup: makeLookup([
        makeVoucher({ scope: 'categories', targetIds: ['cat-drinks'] }),
      ]),
      categoryByMenuItemId: { 'm-1': 'cat-food', 'm-2': 'cat-drinks' },
    })

    // Only m-2 (400) is in scope, so 10% of 400.
    expect(priced.totals.discountTotal).toBe(40)
  })

  it('matches nothing for a category voucher when no categories were supplied', async () => {
    // A missing map must not silently widen the voucher to the whole cart.
    const priced = await priceWith({
      lookup: makeLookup([
        makeVoucher({ scope: 'categories', targetIds: ['cat-drinks'] }),
      ]),
    })

    expect(priced.totals.discountTotal).toBe(0)
  })

  it('treats a null delivery fee as no delivery fee, not as a missing charge', async () => {
    const priced = await priceWith({ deliveryFee: null, serviceCharge: null })

    expect(priced.totals.grandTotal).toBe(900)
  })
})
