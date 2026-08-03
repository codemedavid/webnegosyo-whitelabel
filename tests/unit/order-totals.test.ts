/**
 * Order totals — the single arithmetic that produces the number a customer pays.
 *
 * Before this module existed the grand total was recomputed inline in at least
 * four places (useCheckout, checkout-primitives, checkout-shared,
 * classic-checkout). Four copies of `total + deliveryFee + serviceCharge` is
 * survivable only while nothing else is ever subtracted; the moment vouchers
 * land, a design that missed the change quietly bills the customer full price.
 * These tests pin the arithmetic down in one place so every surface can share it.
 */

import { computeOrderTotals, type OrderDiscountLine } from '@/lib/order-totals'

describe('computeOrderTotals', () => {
  describe('without discounts (must match the legacy inline formula exactly)', () => {
    it('adds delivery fee and service charge to the subtotal', () => {
      // Arrange
      const input = { subtotal: 500, deliveryFee: 60, serviceCharge: 25 }

      // Act
      const totals = computeOrderTotals(input)

      // Assert
      expect(totals.grandTotal).toBe(585)
    })

    it('treats a null delivery fee as zero, the way an unquoted address does', () => {
      const totals = computeOrderTotals({ subtotal: 500, deliveryFee: null, serviceCharge: 0 })

      expect(totals.deliveryFee).toBe(0)
      expect(totals.grandTotal).toBe(500)
    })

    it('treats omitted fee and charge as zero', () => {
      const totals = computeOrderTotals({ subtotal: 250 })

      expect(totals.grandTotal).toBe(250)
      expect(totals.discountTotal).toBe(0)
    })

    it('rounds a fractional service charge to centavos rather than leaking float noise', () => {
      // 0.1 + 0.2 style drift: 333.33 * 10% is 33.333
      const totals = computeOrderTotals({ subtotal: 333.33, serviceCharge: 33.333 })

      expect(totals.grandTotal).toBe(366.66)
    })
  })

  describe('with discounts', () => {
    const tenPercentOff: OrderDiscountLine = { label: '10% off', amount: 50 }

    it('subtracts a single discount line from the grand total', () => {
      const totals = computeOrderTotals({
        subtotal: 500,
        deliveryFee: 60,
        serviceCharge: 0,
        discounts: [tenPercentOff],
      })

      expect(totals.discountTotal).toBe(50)
      expect(totals.grandTotal).toBe(510)
    })

    it('sums multiple stacked discount lines', () => {
      const totals = computeOrderTotals({
        subtotal: 1000,
        discounts: [
          { label: 'WELCOME10', amount: 100 },
          { label: 'Free delivery', amount: 60 },
        ],
      })

      expect(totals.discountTotal).toBe(160)
      expect(totals.grandTotal).toBe(840)
    })

    it('never returns a negative grand total when the discount exceeds the bill', () => {
      const totals = computeOrderTotals({
        subtotal: 100,
        discounts: [{ label: 'Overshoot', amount: 500 }],
      })

      expect(totals.grandTotal).toBe(0)
    })

    it('reports the discount actually granted, not the amount asked for, when clamped', () => {
      // A ₱500 voucher against a ₱100 bill gives away ₱100 — reporting ₱500
      // would overstate every voucher-performance figure downstream.
      const totals = computeOrderTotals({
        subtotal: 100,
        discounts: [{ label: 'Overshoot', amount: 500 }],
      })

      expect(totals.discountTotal).toBe(100)
    })

    it('ignores a negative discount amount rather than inflating the bill', () => {
      const totals = computeOrderTotals({
        subtotal: 100,
        discounts: [{ label: 'Corrupt', amount: -50 }],
      })

      expect(totals.discountTotal).toBe(0)
      expect(totals.grandTotal).toBe(100)
    })

    it('discounts the delivery fee and service charge too, so a big voucher can zero the bill', () => {
      const totals = computeOrderTotals({
        subtotal: 200,
        deliveryFee: 50,
        serviceCharge: 20,
        discounts: [{ label: 'On the house', amount: 270 }],
      })

      expect(totals.grandTotal).toBe(0)
      expect(totals.discountTotal).toBe(270)
    })

    it('rounds the discount to centavos', () => {
      const totals = computeOrderTotals({
        subtotal: 333.33,
        discounts: [{ label: '15% off', amount: 49.9995 }],
      })

      expect(totals.discountTotal).toBe(50)
      expect(totals.grandTotal).toBe(283.33)
    })
  })

  describe('echoed components', () => {
    it('echoes back the normalized parts so callers render one consistent breakdown', () => {
      const totals = computeOrderTotals({
        subtotal: 500,
        deliveryFee: 60,
        serviceCharge: 25,
        discounts: [{ label: 'SAVE20', amount: 20 }],
      })

      expect(totals).toEqual({
        subtotal: 500,
        deliveryFee: 60,
        serviceCharge: 25,
        discountTotal: 20,
        grandTotal: 565,
      })
    })

    it('does not mutate the caller-supplied discount array', () => {
      const discounts: OrderDiscountLine[] = [{ label: 'SAVE20', amount: 20 }]
      const snapshot = JSON.parse(JSON.stringify(discounts))

      computeOrderTotals({ subtotal: 500, discounts })

      expect(discounts).toEqual(snapshot)
    })
  })
})
