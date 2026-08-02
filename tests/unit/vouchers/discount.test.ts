/**
 * What a voucher is actually worth, and which lines it comes off.
 *
 * The per-line allocation is not decoration. When an order is later edited or
 * partially refunded, "how much of this ₱150 discount belonged to the pasta"
 * is the only way to work out what to hand back. Computing it at redemption —
 * once, from the cart that earned it — is far cheaper than reconstructing it
 * from a total weeks later.
 */

import {
  computeVoucherDiscount,
  createRemainingAmounts,
  applyDiscountToRemaining,
} from '@/lib/vouchers/discount'
import type { Voucher, DiscountContext, DiscountLine } from '@/lib/vouchers/types'

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
    lines: [makeLine()],
    deliveryFee: 0,
    serviceCharge: 0,
    channel: 'checkout',
    now: NOW,
    ...overrides,
  }
}

describe('computeVoucherDiscount', () => {
  describe('percent vouchers', () => {
    it('takes a percentage off the eligible subtotal', () => {
      const result = computeVoucherDiscount(makeVoucher({ discountValue: 10 }), makeContext())

      expect(result.amount).toBe(20)
    })

    it('honours a maximum discount cap', () => {
      const voucher = makeVoucher({ discountValue: 50, maxDiscountAmount: 50 })
      const context = makeContext({ lines: [makeLine({ subtotal: 1000 })] })

      const result = computeVoucherDiscount(voucher, context)

      expect(result.amount).toBe(50)
    })

    it('applies only to the lines in scope', () => {
      const voucher = makeVoucher({ discountValue: 10, scope: 'categories', targetIds: ['cat-drinks'] })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', categoryId: 'cat-drinks', subtotal: 200 }),
          makeLine({ id: 'l2', categoryId: 'cat-food', subtotal: 800 }),
        ],
      })

      const result = computeVoucherDiscount(voucher, context)

      expect(result.amount).toBe(20)
    })

    it('rounds to centavos', () => {
      const voucher = makeVoucher({ discountValue: 15 })
      const context = makeContext({ lines: [makeLine({ subtotal: 333.33 })] })

      const result = computeVoucherDiscount(voucher, context)

      expect(result.amount).toBe(50)
    })
  })

  describe('fixed vouchers', () => {
    it('takes a flat amount off', () => {
      const voucher = makeVoucher({ discountType: 'fixed', discountValue: 75 })

      expect(computeVoucherDiscount(voucher, makeContext()).amount).toBe(75)
    })

    it('never gives away more than the eligible lines are worth', () => {
      const voucher = makeVoucher({ discountType: 'fixed', discountValue: 500 })
      const context = makeContext({ lines: [makeLine({ subtotal: 200 })] })

      expect(computeVoucherDiscount(voucher, context).amount).toBe(200)
    })

    it('is bounded by the scoped lines, not the whole cart', () => {
      const voucher = makeVoucher({
        discountType: 'fixed',
        discountValue: 500,
        scope: 'products',
        targetIds: ['item-latte'],
      })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', menuItemId: 'item-latte', subtotal: 200 }),
          makeLine({ id: 'l2', menuItemId: 'item-pasta', subtotal: 800 }),
        ],
      })

      expect(computeVoucherDiscount(voucher, context).amount).toBe(200)
    })
  })

  describe('free delivery vouchers', () => {
    it('discounts the whole delivery fee and nothing else', () => {
      const voucher = makeVoucher({ discountType: 'free_delivery', discountValue: 0 })
      const context = makeContext({ deliveryFee: 60 })

      const result = computeVoucherDiscount(voucher, context)

      expect(result).toMatchObject({ amount: 60, deliveryAmount: 60, lineAmount: 0 })
    })

    it('allocates nothing to the cart lines', () => {
      const voucher = makeVoucher({ discountType: 'free_delivery', discountValue: 0 })
      const context = makeContext({ deliveryFee: 60 })

      expect(computeVoucherDiscount(voucher, context).allocations).toEqual([])
    })
  })

  describe('per-line allocation', () => {
    it('splits the discount proportionally across the eligible lines', () => {
      const voucher = makeVoucher({ discountType: 'fixed', discountValue: 100 })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', subtotal: 300 }),
          makeLine({ id: 'l2', subtotal: 100 }),
        ],
      })

      const result = computeVoucherDiscount(voucher, context)

      expect(result.allocations).toEqual([
        { lineId: 'l1', amount: 75 },
        { lineId: 'l2', amount: 25 },
      ])
    })

    it('allocates only to lines in scope', () => {
      const voucher = makeVoucher({
        discountType: 'fixed',
        discountValue: 50,
        scope: 'products',
        targetIds: ['item-latte'],
      })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', menuItemId: 'item-latte', subtotal: 200 }),
          makeLine({ id: 'l2', menuItemId: 'item-pasta', subtotal: 800 }),
        ],
      })

      expect(computeVoucherDiscount(voucher, context).allocations).toEqual([
        { lineId: 'l1', amount: 50 },
      ])
    })

    it('allocations always sum to exactly the discount, even when the split does not divide evenly', () => {
      // ₱100 across three equal lines is 33.333… each; naive rounding loses a
      // centavo and the refund maths stops balancing.
      const voucher = makeVoucher({ discountType: 'fixed', discountValue: 100 })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', subtotal: 100 }),
          makeLine({ id: 'l2', subtotal: 100 }),
          makeLine({ id: 'l3', subtotal: 100 }),
        ],
      })

      const result = computeVoucherDiscount(voucher, context)
      const allocated = result.allocations.reduce((sum, a) => sum + a.amount, 0)

      expect(Math.round(allocated * 100) / 100).toBe(result.amount)
    })

    it('never allocates more to a line than that line is worth', () => {
      const voucher = makeVoucher({ discountType: 'fixed', discountValue: 250 })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', subtotal: 200 }),
          makeLine({ id: 'l2', subtotal: 50 }),
        ],
      })

      const result = computeVoucherDiscount(voucher, context)

      for (const allocation of result.allocations) {
        const line = context.lines.find((l) => l.id === allocation.lineId)!
        expect(allocation.amount).toBeLessThanOrEqual(line.subtotal)
      }
    })
  })

  describe('zero-value outcomes', () => {
    it('returns zero for a voucher that matches nothing', () => {
      const voucher = makeVoucher({ scope: 'products', targetIds: ['item-nothing'] })

      expect(computeVoucherDiscount(voucher, makeContext()).amount).toBe(0)
    })

    it('returns zero for a free-delivery voucher on a pickup order', () => {
      const voucher = makeVoucher({ discountType: 'free_delivery' })

      expect(computeVoucherDiscount(voucher, makeContext({ deliveryFee: 0 })).amount).toBe(0)
    })

    it('never returns a negative amount for a nonsensical percentage', () => {
      const voucher = makeVoucher({ discountValue: -10 })

      expect(computeVoucherDiscount(voucher, makeContext()).amount).toBe(0)
    })

    it('caps a percentage above 100 at the full eligible amount', () => {
      const voucher = makeVoucher({ discountValue: 150 })

      expect(computeVoucherDiscount(voucher, makeContext()).amount).toBe(200)
    })
  })

  describe('sequential application (stacking)', () => {
    it('a second voucher discounts what is left, not the original price', () => {
      // Two 50% vouchers on ₱200 give ₱100 then ₱50 — ₱150 total, not ₱200.
      // Computing both against the original price would hand the whole order away.
      const first = makeVoucher({ id: 'v1', discountValue: 50 })
      const second = makeVoucher({ id: 'v2', discountValue: 50 })
      const context = makeContext()

      const firstResult = computeVoucherDiscount(first, context)
      const remaining = applyDiscountToRemaining(createRemainingAmounts(context), firstResult)
      const secondResult = computeVoucherDiscount(second, context, remaining)

      expect(firstResult.amount).toBe(100)
      expect(secondResult.amount).toBe(50)
    })

    it('a voucher applied to an already-exhausted line is worth nothing', () => {
      const first = makeVoucher({ id: 'v1', discountType: 'fixed', discountValue: 200 })
      const second = makeVoucher({ id: 'v2', discountType: 'fixed', discountValue: 50 })
      const context = makeContext()

      const remaining = applyDiscountToRemaining(
        createRemainingAmounts(context),
        computeVoucherDiscount(first, context),
      )

      expect(computeVoucherDiscount(second, context, remaining).amount).toBe(0)
    })

    it('a second free-delivery voucher cannot discount the fee twice', () => {
      const voucher = makeVoucher({ discountType: 'free_delivery' })
      const context = makeContext({ deliveryFee: 60 })

      const remaining = applyDiscountToRemaining(
        createRemainingAmounts(context),
        computeVoucherDiscount(voucher, context),
      )

      expect(computeVoucherDiscount(voucher, context, remaining).amount).toBe(0)
    })

    it('does not mutate the remaining state it is handed', () => {
      const context = makeContext()
      const remaining = createRemainingAmounts(context)
      const snapshot = JSON.parse(JSON.stringify(remaining))

      applyDiscountToRemaining(remaining, computeVoucherDiscount(makeVoucher(), context))

      expect(remaining).toEqual(snapshot)
    })
  })
})
