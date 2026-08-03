/**
 * The checkout preview: what the customer is shown after typing a code.
 *
 * This is reachable by anyone with a tenant id — it is a public coupon field.
 * So the shape it returns matters as much as the number: a preview that hands
 * back the whole voucher row tells any visitor how many redemptions are left,
 * what the per-customer cap is, and which products are secretly targeted.
 * Enumerating codes is inherent to the feature; leaking a voucher's internals
 * is not.
 *
 * The preview is also explicitly NOT authoritative. It exists to render a
 * summary line. The amount actually charged is recomputed server-side at order
 * time from the codes, never taken from this result.
 */
import { describe, it, expect, jest } from '@jest/globals'
import { buildVoucherPreview } from '@/lib/vouchers/preview'
import type { VoucherLookup } from '@/lib/vouchers/resolve'
import type { DiscountContext, Voucher } from '@/lib/vouchers/types'

const NOW = new Date('2026-08-03T10:00:00.000Z')

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v-1',
    code: 'SAVE10',
    name: '10% off',
    description: 'Ten percent off your order',
    discountType: 'percent',
    discountValue: 10,
    scope: 'universal',
    isStackable: true,
    usedCount: 41,
    usageLimitTotal: 50,
    usageLimitPerCustomer: 2,
    channels: ['checkout'],
    isActive: true,
    ...overrides,
  }
}

function makeContext(overrides: Partial<DiscountContext> = {}): DiscountContext {
  return {
    lines: [{ id: 'l-1', menuItemId: 'm-1', quantity: 1, subtotal: 1000 }],
    deliveryFee: 0,
    serviceCharge: 0,
    channel: 'checkout',
    now: NOW,
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

describe('buildVoucherPreview', () => {
  it('reports the discount for an accepted code', async () => {
    const preview = await buildVoucherPreview({
      tenantId: 'tenant-1',
      codes: ['SAVE10'],
      context: makeContext(),
      lookup: makeLookup([makeVoucher()]),
    })

    expect(preview.discountTotal).toBe(100)
    expect(preview.accepted).toEqual([
      expect.objectContaining({ code: 'SAVE10', name: '10% off', amount: 100 }),
    ])
  })

  it('never exposes usage counts, limits or targets to the customer', async () => {
    const preview = await buildVoucherPreview({
      tenantId: 'tenant-1',
      codes: ['SAVE10'],
      context: makeContext(),
      lookup: makeLookup([makeVoucher({ scope: 'products', targetIds: ['secret-item'] })]),
    })

    const serialized = JSON.stringify(preview)
    expect(serialized).not.toContain('usedCount')
    expect(serialized).not.toContain('usageLimit')
    expect(serialized).not.toContain('targetIds')
    expect(serialized).not.toContain('secret-item')
    expect(serialized).not.toContain('41')
  })

  it('explains a rejection in words the customer can act on', async () => {
    const preview = await buildVoucherPreview({
      tenantId: 'tenant-1',
      codes: ['SAVE10'],
      context: makeContext(),
      lookup: makeLookup([makeVoucher({ minOrderAmount: 5000 })]),
    })

    expect(preview.discountTotal).toBe(0)
    expect(preview.rejected).toEqual([
      expect.objectContaining({ code: 'SAVE10', reason: 'below_minimum' }),
    ])
    expect(preview.rejected[0].message).toBeTruthy()
  })

  it('reports an unknown code as not found rather than failing the whole preview', async () => {
    const preview = await buildVoucherPreview({
      tenantId: 'tenant-1',
      codes: ['SAVE10', 'NOPE'],
      context: makeContext(),
      lookup: makeLookup([makeVoucher()]),
    })

    expect(preview.discountTotal).toBe(100)
    expect(preview.rejected).toEqual([
      expect.objectContaining({ code: 'NOPE', reason: 'not_found' }),
    ])
  })

  it('carries the delivery portion separately so the summary can show it', async () => {
    const preview = await buildVoucherPreview({
      tenantId: 'tenant-1',
      codes: ['FREEDEL'],
      context: makeContext({ deliveryFee: 50 }),
      lookup: makeLookup([
        makeVoucher({ code: 'FREEDEL', discountType: 'free_delivery', discountValue: 0 }),
      ]),
    })

    expect(preview.deliveryDiscount).toBe(50)
  })
})
