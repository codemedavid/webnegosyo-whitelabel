/**
 * Re-pricing a placed order when a voucher is attached to it.
 *
 * This is the arithmetic the three backend write paths will each persist. It is
 * computed ONCE, here, so that whatever Convex stores, whatever the platform
 * Postgres stores, and whatever a tenant's own Postgres stores cannot disagree
 * about what the customer was charged.
 *
 * The invariant everything rests on, stated in `src/lib/order-discount.ts` and
 * true on every backend: an order's `total` is ALREADY net of its discount. The
 * stored discount payload is the breakdown — what to print, what to give back —
 * and never the source of the amount charged. So re-pricing subtracts only the
 * NEWLY attached lines; subtracting the carried discount again would take the
 * same money off twice.
 *
 * That single sentence is the whole reason this module exists separately from
 * the checkout's `priceOrderWithVouchers`, which prices from scratch against a
 * gross bill. A placed order is not a fresh one.
 */
import { describe, it, expect } from '@jest/globals'
import { repriceAttachedDiscount } from '@/lib/order-attach-reprice'
import type { OrderPayment } from '@/lib/order-balance'
import type { OrderDiscountLine } from '@/lib/order-totals'

const charge = (amount: number): OrderPayment => ({ kind: 'charge', amount })

const SAVE20: OrderDiscountLine = { label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' }
const CARRIED: OrderDiscountLine = { label: 'FIRST20', amount: 20, code: 'FIRST20', voucherId: 'v-0' }

describe('re-pricing a placed order with a newly attached code', () => {
  /** ₱250 placed, fully paid, ₱40 code attached. Owed back: ₱40. */
  it('takes the new discount off the placed total', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 250,
      carriedLines: [],
      addedLines: [SAVE20],
      payments: [charge(250)],
    })

    expect(result.newTotal).toBe(210)
    expect(result.balance).toBe(-40)
    expect(result.intent).toBe('refund')
  })

  /**
   * The defect this module exists to prevent. The placed total is ALREADY net
   * of the ₱20 it was placed with; subtracting that again would charge the
   * customer ₱20 less than anyone authorised.
   */
  it('does not subtract the discount the order was already placed with', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 230, // 250 gross, less the ₱20 it carried
      carriedLines: [CARRIED],
      addedLines: [SAVE20],
      payments: [charge(230)],
    })

    expect(result.newTotal).toBe(190)
  })

  /** Re-entering the carried code must change nothing at all. */
  it('ignores a code the order already carried', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 230,
      carriedLines: [CARRIED],
      addedLines: [CARRIED],
      payments: [charge(230)],
    })

    expect(result.newTotal).toBe(230)
    expect(result.newLines).toEqual([])
    expect(result.intent).toBe('settled')
  })

  it('reports the lines it actually applied', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 230,
      carriedLines: [CARRIED],
      addedLines: [CARRIED, SAVE20],
      payments: [],
    })

    expect(result.newLines.map((line) => line.code)).toEqual(['SAVE20'])
    expect(result.addedTotal).toBe(40)
  })

  /**
   * A discount larger than the bill must floor at zero. A negative total is
   * money invented, and it would read downstream as a refund owed on top of
   * everything already returned.
   */
  it('never prices an order below nothing', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 30,
      carriedLines: [],
      addedLines: [{ label: 'BIG', amount: 500, code: 'BIG', voucherId: 'v-b' }],
      payments: [],
    })

    expect(result.newTotal).toBe(0)
    expect(result.addedTotal).toBe(30)
  })

  it('caps two codes that individually fit but together exceed the bill', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 50,
      carriedLines: [],
      addedLines: [
        { label: 'A', amount: 40, code: 'A', voucherId: 'v-a' },
        { label: 'B', amount: 40, code: 'B', voucherId: 'v-b' },
      ],
      payments: [],
    })

    expect(result.newTotal).toBe(0)
    expect(result.addedTotal).toBe(50)
  })

  it('leaves an unpaid order simply owing less', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 250,
      carriedLines: [],
      addedLines: [SAVE20],
      payments: [],
    })

    expect(result.newTotal).toBe(210)
    expect(result.balance).toBe(210)
    expect(result.intent).toBe('collect')
  })

  it('changes nothing when no code was attached', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 250,
      carriedLines: [CARRIED],
      addedLines: [],
      payments: [charge(250)],
    })

    expect(result.newTotal).toBe(250)
    expect(result.addedTotal).toBe(0)
    expect(result.intent).toBe('settled')
  })

  /** A manual line has no voucher, so it is never applied by an attach. */
  it('ignores a manual line, which carries no code to redeem', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 250,
      carriedLines: [],
      addedLines: [{ label: 'Manager discount', amount: 30 }],
      payments: [],
    })

    expect(result.newTotal).toBe(250)
    expect(result.newLines).toEqual([])
  })

  it('rounds to centavos rather than carrying float drift', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 100,
      carriedLines: [],
      addedLines: [{ label: 'T', amount: 33.333, code: 'T', voucherId: 'v-t' }],
      payments: [],
    })

    expect(result.newTotal).toBe(66.67)
  })

  /**
   * The stored total and what a reader recomputes must agree. This is the same
   * guarantee `editModeTotals` makes on the register: shown total, saved total
   * and collected total are one number.
   */
  it('keeps the new total reconcilable from the figures it reports', () => {
    const result = repriceAttachedDiscount({
      orderTotal: 250,
      carriedLines: [CARRIED],
      addedLines: [SAVE20],
      payments: [charge(100)],
    })

    expect(result.newTotal).toBe(250 - result.addedTotal)
    expect(result.balance).toBe(result.newTotal - 100)
  })

  it('does not mutate what it was given', () => {
    const added = [SAVE20]
    const addedBefore = [...added]

    repriceAttachedDiscount({
      orderTotal: 250,
      carriedLines: [],
      addedLines: added,
      payments: [],
    })

    expect(added).toEqual(addedBefore)
  })
})
