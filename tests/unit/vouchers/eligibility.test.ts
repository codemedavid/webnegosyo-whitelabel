/**
 * Voucher eligibility — the gate that answers "can this code be used on this
 * cart, right now, at this counter?"
 *
 * Everything here is pure and takes its clock as an argument, because the same
 * answer has to come out of the customer's browser (preview), the server
 * (authority), and the register (offline-tolerant). A voucher that validates in
 * one place and not another is a customer arguing with a cashier.
 */

import { evaluateVoucherEligibility } from '@/lib/vouchers/eligibility'
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
    code: 'WELCOME10',
    name: '10% off',
    discountType: 'percent',
    discountValue: 10,
    scope: 'universal',
    isStackable: false,
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

describe('evaluateVoucherEligibility', () => {
  it('accepts a plain active universal voucher', () => {
    const result = evaluateVoucherEligibility(makeVoucher(), makeContext())

    expect(result.isEligible).toBe(true)
  })

  describe('activation state and validity window', () => {
    it('rejects a deactivated voucher', () => {
      const result = evaluateVoucherEligibility(makeVoucher({ isActive: false }), makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'inactive' })
    })

    it('rejects a voucher whose start date has not arrived', () => {
      const voucher = makeVoucher({ startsAt: '2026-09-01T00:00:00.000Z' })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'not_started' })
    })

    it('rejects an expired voucher', () => {
      const voucher = makeVoucher({ endsAt: '2026-07-01T00:00:00.000Z' })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'expired' })
    })

    it('accepts a voucher inside its window', () => {
      const voucher = makeVoucher({
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-08-31T23:59:59.000Z',
      })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })

    it('treats the end instant as still valid, not already expired', () => {
      // A voucher ending "today at 23:59:59" must work AT 23:59:59.
      const voucher = makeVoucher({ endsAt: NOW.toISOString() })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })
  })

  describe('usage limits', () => {
    it('rejects a voucher that has reached its total usage limit', () => {
      const voucher = makeVoucher({ usageLimitTotal: 100, usedCount: 100 })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'usage_limit_reached' })
    })

    it('accepts a voucher with redemptions left', () => {
      const voucher = makeVoucher({ usageLimitTotal: 100, usedCount: 99 })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })

    it('treats a null total limit as unlimited', () => {
      const voucher = makeVoucher({ usageLimitTotal: null, usedCount: 5000 })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })

    it('rejects a customer who has already used their personal allowance', () => {
      const voucher = makeVoucher({ usageLimitPerCustomer: 1 })
      const context = makeContext({ customerUsageCount: 1 })

      const result = evaluateVoucherEligibility(voucher, context)

      expect(result).toMatchObject({ isEligible: false, reason: 'customer_limit_reached' })
    })

    it('does not enforce a per-customer limit when the customer is unknown', () => {
      // Guest checkout cannot be attributed; the total limit still applies.
      const voucher = makeVoucher({ usageLimitPerCustomer: 1 })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })
  })

  describe('minimum spend', () => {
    it('rejects a cart below the minimum order amount', () => {
      const voucher = makeVoucher({ minOrderAmount: 500 })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'below_minimum' })
    })

    it('measures the minimum against the whole cart, not just the eligible items', () => {
      // A ₱500-minimum voucher scoped to drinks must accept a ₱600 cart that
      // holds ₱200 of drinks — the customer did spend ₱600.
      const voucher = makeVoucher({
        minOrderAmount: 500,
        scope: 'categories',
        targetIds: ['cat-drinks'],
      })
      const context = makeContext({
        lines: [
          makeLine({ id: 'l1', categoryId: 'cat-drinks', subtotal: 200 }),
          makeLine({ id: 'l2', categoryId: 'cat-food', menuItemId: 'item-pasta', subtotal: 400 }),
        ],
      })

      expect(evaluateVoucherEligibility(voucher, context).isEligible).toBe(true)
    })

    it('accepts a cart exactly at the minimum', () => {
      const voucher = makeVoucher({ minOrderAmount: 200 })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })

    it('reports the shortfall so the UI can say how much more to add', () => {
      const voucher = makeVoucher({ minOrderAmount: 500 })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, shortfall: 300 })
    })
  })

  describe('scope', () => {
    it('rejects a product-scoped voucher when the cart holds none of its items', () => {
      const voucher = makeVoucher({ scope: 'products', targetIds: ['item-croissant'] })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'no_matching_items' })
    })

    it('accepts a product-scoped voucher when a matching item is in the cart', () => {
      const voucher = makeVoucher({ scope: 'products', targetIds: ['item-latte'] })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })

    it('rejects a category-scoped voucher when no line is in its categories', () => {
      const voucher = makeVoucher({ scope: 'categories', targetIds: ['cat-desserts'] })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'no_matching_items' })
    })

    it('accepts a category-scoped voucher when a line matches', () => {
      const voucher = makeVoucher({ scope: 'categories', targetIds: ['cat-drinks'] })

      expect(evaluateVoucherEligibility(voucher, makeContext()).isEligible).toBe(true)
    })

    it('rejects a scoped voucher that names no targets at all', () => {
      // An empty target list is a misconfiguration, not "everything" — silently
      // treating it as universal would hand out a store-wide discount.
      const voucher = makeVoucher({ scope: 'products', targetIds: [] })

      const result = evaluateVoucherEligibility(voucher, makeContext())

      expect(result).toMatchObject({ isEligible: false, reason: 'no_matching_items' })
    })

    it('exempts free-delivery vouchers from item scope', () => {
      const voucher = makeVoucher({ discountType: 'free_delivery', discountValue: 0 })
      const context = makeContext({ deliveryFee: 60 })

      expect(evaluateVoucherEligibility(voucher, context).isEligible).toBe(true)
    })

    it('rejects a free-delivery voucher when the order has no delivery fee', () => {
      const voucher = makeVoucher({ discountType: 'free_delivery', discountValue: 0 })

      const result = evaluateVoucherEligibility(voucher, makeContext({ deliveryFee: 0 }))

      expect(result).toMatchObject({ isEligible: false, reason: 'no_delivery_fee' })
    })
  })

  describe('channel and branch', () => {
    it('rejects a checkout-only voucher presented at the register', () => {
      const voucher = makeVoucher({ channels: ['checkout'] })

      const result = evaluateVoucherEligibility(voucher, makeContext({ channel: 'pos' }))

      expect(result).toMatchObject({ isEligible: false, reason: 'wrong_channel' })
    })

    it('rejects a voucher restricted to another branch', () => {
      const voucher = makeVoucher({ outletIds: ['outlet-makati'] })

      const result = evaluateVoucherEligibility(voucher, makeContext({ outletId: 'outlet-cebu' }))

      expect(result).toMatchObject({ isEligible: false, reason: 'wrong_branch' })
    })

    it('accepts a voucher at its own branch', () => {
      const voucher = makeVoucher({ outletIds: ['outlet-makati'] })

      const context = makeContext({ outletId: 'outlet-makati' })

      expect(evaluateVoucherEligibility(voucher, context).isEligible).toBe(true)
    })

    it('treats a null branch list as valid at every branch', () => {
      const voucher = makeVoucher({ outletIds: null })

      const context = makeContext({ outletId: 'outlet-cebu' })

      expect(evaluateVoucherEligibility(voucher, context).isEligible).toBe(true)
    })

    it('accepts a branch-restricted voucher on a single-location store', () => {
      // Single-location tenants stamp no outlet at all.
      const voucher = makeVoucher({ outletIds: ['outlet-makati'] })

      expect(evaluateVoucherEligibility(voucher, makeContext({ outletId: null })).isEligible).toBe(true)
    })
  })

  describe('rejection messages', () => {
    it('gives every rejection a customer-readable message', () => {
      const rejections = [
        evaluateVoucherEligibility(makeVoucher({ isActive: false }), makeContext()),
        evaluateVoucherEligibility(makeVoucher({ endsAt: '2026-07-01T00:00:00.000Z' }), makeContext()),
        evaluateVoucherEligibility(makeVoucher({ minOrderAmount: 500 }), makeContext()),
        evaluateVoucherEligibility(makeVoucher({ scope: 'products', targetIds: ['x'] }), makeContext()),
      ]

      for (const rejection of rejections) {
        expect(rejection.isEligible).toBe(false)
        expect(rejection.isEligible === false && rejection.message.length).toBeGreaterThan(0)
      }
    })

    it('names the shortfall in the below-minimum message so it is actionable', () => {
      const result = evaluateVoucherEligibility(makeVoucher({ minOrderAmount: 500 }), makeContext())

      expect(result.isEligible === false && result.message).toContain('300')
    })
  })
})
