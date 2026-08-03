/**
 * The seam between "codes the customer typed" and the pure engine.
 *
 * Everything the engine does is already tested. What is untested — and what
 * actually decides whether a customer is charged correctly — is what happens
 * to the codes on the way in: an unknown code must be a rejection rather than
 * a crash, the same code entered twice must not discount twice, and the order
 * of entry must survive, because solo-only conflicts are resolved
 * first-entered-wins and reordering silently gives someone a different deal
 * than the one they typed.
 *
 * The per-customer limit is enforced here rather than inside `applyVouchers`
 * because `DiscountContext` carries a single `customerUsageCount` for the whole
 * evaluation, while the limit is per voucher. Pre-filtering is the only way to
 * hold both without changing the engine's tested contract.
 */
import { describe, it, expect, jest } from '@jest/globals'
import { resolveVouchers, type VoucherLookup } from '@/lib/vouchers/resolve'
import type { DiscountContext, Voucher } from '@/lib/vouchers/types'

const TENANT = 'tenant-1'
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
    findByCodes: jest.fn(async (_tenantId: string, codes: readonly string[]) =>
      vouchers.filter((v) => codes.includes(v.code.toUpperCase())),
    ),
    countCustomerRedemptions: jest.fn(async () => ({})),
  }
}

describe('resolveVouchers', () => {
  it('applies a known code and reports the discount', async () => {
    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['SAVE10'],
      context: makeContext(),
      lookup: makeLookup([makeVoucher()]),
    })

    expect(result.discountTotal).toBe(100)
    expect(result.applied).toHaveLength(1)
    expect(result.notFound).toEqual([])
  })

  it('rejects an unknown code instead of throwing', async () => {
    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['NOPE'],
      context: makeContext(),
      lookup: makeLookup([]),
    })

    expect(result.notFound).toEqual(['NOPE'])
    expect(result.discountTotal).toBe(0)
    expect(result.rejected).toEqual([
      expect.objectContaining({ code: 'NOPE', reason: 'not_found' }),
    ])
  })

  it('matches codes case-insensitively and ignores surrounding whitespace', async () => {
    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['  save10 '],
      context: makeContext(),
      lookup: makeLookup([makeVoucher()]),
    })

    expect(result.discountTotal).toBe(100)
  })

  it('does not discount twice when the same code is entered twice', async () => {
    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['SAVE10', 'save10'],
      context: makeContext(),
      lookup: makeLookup([makeVoucher()]),
    })

    expect(result.applied).toHaveLength(1)
    expect(result.discountTotal).toBe(100)
  })

  it('preserves entry order so a solo-only conflict keeps the first code', async () => {
    const stackable = makeVoucher({ id: 'v-1', code: 'FIRST', discountValue: 10 })
    const solo = makeVoucher({
      id: 'v-2',
      code: 'SECOND',
      discountValue: 50,
      isStackable: false,
    })

    const result = await resolveVouchers({
      tenantId: TENANT,
      // The lookup deliberately returns them in the opposite order to prove the
      // caller's order is what counts, not the database's.
      codes: ['FIRST', 'SECOND'],
      context: makeContext(),
      lookup: makeLookup([solo, stackable]),
    })

    expect(result.applied.map((a) => a.voucher.code)).toEqual(['FIRST'])
    expect(result.rejected).toEqual([
      expect.objectContaining({ code: 'SECOND', reason: 'not_stackable' }),
    ])
  })

  it('turns down a voucher this customer has already used to its limit', async () => {
    const lookup = makeLookup([makeVoucher({ usageLimitPerCustomer: 1 })])
    lookup.countCustomerRedemptions = jest.fn(async () => ({ 'v-1': 1 }))

    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['SAVE10'],
      context: makeContext(),
      customerKey: 'customer-1',
      lookup,
    })

    expect(result.discountTotal).toBe(0)
    expect(result.rejected).toEqual([
      expect.objectContaining({ code: 'SAVE10', reason: 'customer_limit_reached' }),
    ])
  })

  it('still applies the voucher when the customer is under their limit', async () => {
    const lookup = makeLookup([makeVoucher({ usageLimitPerCustomer: 2 })])
    lookup.countCustomerRedemptions = jest.fn(async () => ({ 'v-1': 1 }))

    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['SAVE10'],
      context: makeContext(),
      customerKey: 'customer-1',
      lookup,
    })

    expect(result.discountTotal).toBe(100)
  })

  it('does not look up per-customer redemptions for a guest with no key', async () => {
    const lookup = makeLookup([makeVoucher({ usageLimitPerCustomer: 1 })])

    await resolveVouchers({
      tenantId: TENANT,
      codes: ['SAVE10'],
      context: makeContext(),
      lookup,
    })

    expect(lookup.countCustomerRedemptions).not.toHaveBeenCalled()
  })

  it('does not hit the database at all when no codes were entered', async () => {
    const lookup = makeLookup([makeVoucher()])

    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: [],
      context: makeContext(),
      lookup,
    })

    expect(lookup.findByCodes).not.toHaveBeenCalled()
    expect(result.discountTotal).toBe(0)
    expect(result.applied).toEqual([])
  })

  it('drops blank entries rather than looking up an empty code', async () => {
    const lookup = makeLookup([makeVoucher()])

    const result = await resolveVouchers({
      tenantId: TENANT,
      codes: ['   ', ''],
      context: makeContext(),
      lookup,
    })

    expect(lookup.findByCodes).not.toHaveBeenCalled()
    expect(result.notFound).toEqual([])
  })

  it('scopes the lookup to the tenant it was asked about', async () => {
    const lookup = makeLookup([makeVoucher()])

    await resolveVouchers({
      tenantId: TENANT,
      codes: ['SAVE10'],
      context: makeContext(),
      lookup,
    })

    expect(lookup.findByCodes).toHaveBeenCalledWith(TENANT, ['SAVE10'])
  })
})
