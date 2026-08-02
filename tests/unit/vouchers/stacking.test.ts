/**
 * Resolving a set of requested vouchers into the ones that actually apply.
 *
 * This is where "stackable vs solo only" is enforced, and it is the module the
 * server calls to re-price an order. Its output feeds `computeOrderTotals`
 * directly, so the discount the customer was shown and the discount the
 * merchant is charged come from one evaluation, not two.
 */

import { applyVouchers } from '@/lib/vouchers/stacking'
import type { Voucher, DiscountContext, DiscountLine } from '@/lib/vouchers/types'
import { computeOrderTotals } from '@/lib/order-totals'

const NOW = new Date('2026-08-02T10:00:00.000Z')

function makeLine(overrides: Partial<DiscountLine> = {}): DiscountLine {
  return {
    id: 'line-1',
    menuItemId: 'item-latte',
    categoryId: 'cat-drinks',
    quantity: 1,
    subtotal: 200,
    ...overrides,
  }
}

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v1',
    code: 'SAVE',
    name: 'Save',
    discountType: 'fixed',
    discountValue: 20,
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
    lines: [makeLine()],
    deliveryFee: 0,
    serviceCharge: 0,
    channel: 'checkout',
    now: NOW,
    ...overrides,
  }
}

describe('applyVouchers', () => {
  it('returns nothing applied for an empty request', () => {
    const result = applyVouchers([], makeContext())

    expect(result.applied).toEqual([])
    expect(result.discountTotal).toBe(0)
  })

  it('applies a single eligible voucher', () => {
    const result = applyVouchers([makeVoucher()], makeContext())

    expect(result.applied).toHaveLength(1)
    expect(result.discountTotal).toBe(20)
  })

  it('rejects an ineligible voucher and says why', () => {
    const expired = makeVoucher({ endsAt: '2026-01-01T00:00:00.000Z' })

    const result = applyVouchers([expired], makeContext())

    expect(result.applied).toEqual([])
    expect(result.rejected).toEqual([
      expect.objectContaining({ voucherId: 'v1', reason: 'expired' }),
    ])
  })

  describe('stackable vs solo only', () => {
    it('stacks two stackable vouchers', () => {
      const a = makeVoucher({ id: 'v1', code: 'A', isStackable: true })
      const b = makeVoucher({ id: 'v2', code: 'B', isStackable: true })

      const result = applyVouchers([a, b], makeContext())

      expect(result.applied).toHaveLength(2)
      expect(result.discountTotal).toBe(40)
    })

    it('refuses to add a solo-only voucher on top of an applied one', () => {
      const stackable = makeVoucher({ id: 'v1', code: 'A', isStackable: true })
      const solo = makeVoucher({ id: 'v2', code: 'SOLO', isStackable: false })

      const result = applyVouchers([stackable, solo], makeContext())

      expect(result.applied.map((a) => a.voucher.id)).toEqual(['v1'])
      expect(result.rejected).toEqual([
        expect.objectContaining({ voucherId: 'v2', reason: 'not_stackable' }),
      ])
    })

    it('refuses to add anything on top of an applied solo-only voucher', () => {
      const solo = makeVoucher({ id: 'v1', code: 'SOLO', isStackable: false })
      const stackable = makeVoucher({ id: 'v2', code: 'B', isStackable: true })

      const result = applyVouchers([solo, stackable], makeContext())

      expect(result.applied.map((a) => a.voucher.id)).toEqual(['v1'])
      expect(result.rejected).toEqual([
        expect.objectContaining({ voucherId: 'v2', reason: 'not_stackable' }),
      ])
    })

    it('applies a solo-only voucher happily when it is the only one', () => {
      const solo = makeVoucher({ isStackable: false })

      expect(applyVouchers([solo], makeContext()).applied).toHaveLength(1)
    })

    it('keeps the first voucher when a solo conflict arises, never silently reorders', () => {
      // Order is the customer's intent: whatever they entered first wins, and
      // the rejection tells them why the second one did not take.
      const solo = makeVoucher({ id: 'v1', code: 'SOLO', isStackable: false, discountValue: 10 })
      const bigger = makeVoucher({ id: 'v2', code: 'BIG', isStackable: true, discountValue: 100 })

      const result = applyVouchers([solo, bigger], makeContext())

      expect(result.discountTotal).toBe(10)
    })
  })

  describe('sequencing', () => {
    it('discounts each voucher against what the previous one left', () => {
      const half = makeVoucher({ id: 'v1', code: 'A', discountType: 'percent', discountValue: 50 })
      const halfAgain = makeVoucher({ id: 'v2', code: 'B', discountType: 'percent', discountValue: 50 })

      const result = applyVouchers([half, halfAgain], makeContext())

      // ₱200 → ₱100 off, then 50% of the remaining ₱100 → ₱50 off.
      expect(result.discountTotal).toBe(150)
    })

    it('rejects a voucher that is worth nothing once the earlier ones have applied', () => {
      const everything = makeVoucher({ id: 'v1', code: 'ALL', discountType: 'fixed', discountValue: 200 })
      const leftovers = makeVoucher({ id: 'v2', code: 'MORE', discountType: 'fixed', discountValue: 50 })

      const result = applyVouchers([everything, leftovers], makeContext())

      expect(result.applied).toHaveLength(1)
      expect(result.rejected).toEqual([
        expect.objectContaining({ voucherId: 'v2', reason: 'no_value' }),
      ])
    })

    it('the discount total can never exceed the cart plus its fees', () => {
      const huge = makeVoucher({ discountType: 'fixed', discountValue: 10_000 })
      const context = makeContext({ deliveryFee: 60, serviceCharge: 20 })

      const result = applyVouchers([huge], context)

      expect(result.discountTotal).toBeLessThanOrEqual(280)
    })
  })

  describe('output shape', () => {
    it('emits discount lines that computeOrderTotals consumes directly', () => {
      const voucher = makeVoucher({ code: 'WELCOME10', name: '10% off your first order' })
      const context = makeContext({ deliveryFee: 60, serviceCharge: 20 })

      const result = applyVouchers([voucher], context)
      const totals = computeOrderTotals({
        subtotal: 200,
        deliveryFee: context.deliveryFee,
        serviceCharge: context.serviceCharge,
        discounts: result.discountLines,
      })

      expect(totals.discountTotal).toBe(20)
      expect(totals.grandTotal).toBe(260)
    })

    it('labels each discount line with the voucher code so it prints on the receipt', () => {
      const result = applyVouchers([makeVoucher({ code: 'WELCOME10' })], makeContext())

      expect(result.discountLines[0]).toMatchObject({ code: 'WELCOME10', voucherId: 'v1', amount: 20 })
      expect(result.discountLines[0].label.length).toBeGreaterThan(0)
    })

    it('merges per-line allocations across every applied voucher', () => {
      const a = makeVoucher({ id: 'v1', code: 'A', discountType: 'fixed', discountValue: 20 })
      const b = makeVoucher({ id: 'v2', code: 'B', discountType: 'fixed', discountValue: 30 })
      const context = makeContext({ lines: [makeLine({ id: 'only', subtotal: 200 })] })

      const result = applyVouchers([a, b], context)

      expect(result.allocationsByLine).toEqual({ only: 50 })
    })

    it('reports the delivery portion separately so free-delivery survives a re-quote', () => {
      const freeDelivery = makeVoucher({ discountType: 'free_delivery' })
      const context = makeContext({ deliveryFee: 60 })

      const result = applyVouchers([freeDelivery], context)

      expect(result.deliveryDiscount).toBe(60)
      expect(result.allocationsByLine).toEqual({})
    })
  })

  describe('determinism', () => {
    it('produces the same result for the same input, so two devices agree', () => {
      const vouchers = [
        makeVoucher({ id: 'v1', code: 'A', discountType: 'percent', discountValue: 15 }),
        makeVoucher({ id: 'v2', code: 'B', discountType: 'fixed', discountValue: 30 }),
      ]
      const context = makeContext({
        lines: [makeLine({ id: 'l1', subtotal: 333.33 }), makeLine({ id: 'l2', subtotal: 66.67 })],
        deliveryFee: 60,
      })

      expect(applyVouchers(vouchers, context)).toEqual(applyVouchers(vouchers, context))
    })

    it('does not mutate the vouchers or the context it is given', () => {
      const vouchers = [makeVoucher()]
      const context = makeContext()
      const snapshot = JSON.parse(JSON.stringify({ vouchers, lines: context.lines }))

      applyVouchers(vouchers, context)

      expect({ vouchers, lines: context.lines }).toEqual(snapshot)
    })
  })
})
