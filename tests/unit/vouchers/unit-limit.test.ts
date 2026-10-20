/**
 * A voucher that discounts only N units ("50% off ONE fries"), on the units
 * the cheapest rule picks — or on the units the cashier/customer chose.
 */

import { applyVouchers } from '@/lib/vouchers/stacking'
import { computeVoucherDiscount } from '@/lib/vouchers/discount'
import type { DiscountContext, DiscountLine, Voucher } from '@/lib/vouchers/types'

const NOW = new Date('2026-10-15T10:00:00.000Z')

const fries: DiscountLine = { id: 'line-0', menuItemId: 'fries', categoryId: 'sides', quantity: 5, subtotal: 560 }
const burger: DiscountLine = { id: 'line-1', menuItemId: 'burger', categoryId: 'mains', quantity: 2, subtotal: 300 }
const soda: DiscountLine = { id: 'line-2', menuItemId: 'soda', categoryId: 'drinks', quantity: 1, subtotal: 60 }

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v-fries',
    code: 'FRIES50',
    name: 'Fries 50%',
    discountType: 'percent',
    discountValue: 50,
    scope: 'products',
    targetIds: ['fries'],
    isStackable: true,
    usedCount: 0,
    channels: ['checkout', 'pos', 'admin'],
    isActive: true,
    maxDiscountedUnits: 1,
    ...overrides,
  }
}

function context(lines: DiscountLine[], overrides: Partial<DiscountContext> = {}): DiscountContext {
  return { lines, deliveryFee: 0, serviceCharge: 0, channel: 'pos', now: NOW, ...overrides }
}

describe('unit-limited vouchers', () => {
  it('takes 50% off ONE of five fries, not all five', () => {
    const result = computeVoucherDiscount(voucher(), context([fries]))

    expect(result.amount).toBe(56)
    expect(result.allocations).toEqual([{ lineId: 'line-0', amount: 56, units: 1, unitCents: [5600, 0, 0, 0, 0] }])
  })

  it('without a limit still discounts every unit (unchanged behaviour)', () => {
    const result = computeVoucherDiscount(voucher({ maxDiscountedUnits: null }), context([fries]))

    expect(result.amount).toBe(280)
    expect(result.allocations).toEqual([{ lineId: 'line-0', amount: 280 }])
  })

  it('picks the cheapest eligible units across lines by default', () => {
    const anyItem = voucher({ scope: 'universal', targetIds: [], maxDiscountedUnits: 2 })
    const result = computeVoucherDiscount(anyItem, context([burger, soda, fries]))

    // soda ₱60, then a fries ₱112 — never a ₱150 burger.
    expect(result.allocations.map((a) => [a.lineId, a.units])).toEqual([['line-2', 1], ['line-0', 1]])
    expect(result.amount).toBe(86)
  })

  it('breaks price ties in cart order', () => {
    const two: DiscountLine = { ...fries, id: 'line-9' }
    const result = computeVoucherDiscount(voucher({ scope: 'universal' }), context([fries, two]))

    expect(result.allocations[0].lineId).toBe('line-0')
  })

  it('honours the chosen item over the cheapest', () => {
    const anyItem = voucher({ scope: 'universal', targetIds: [], maxDiscountedUnits: 1 })
    const result = computeVoucherDiscount(
      anyItem,
      context([burger, soda], { unitPicks: { FRIES50: { 'line-1': 1 } } }),
    )

    expect(result.allocations).toEqual([{ lineId: 'line-1', amount: 75, units: 1, unitCents: [7500, 0] }])
  })

  it('reads picks by the code whatever case it was typed in', () => {
    const anyItem = voucher({ code: 'Fries50', scope: 'universal', targetIds: [] })
    const result = computeVoucherDiscount(anyItem, context([burger, soda], { unitPicks: { FRIES50: { 'line-1': 1 } } }))

    expect(result.allocations[0].lineId).toBe('line-1')
  })

  it.each([
    ['a line the voucher does not cover', { 'line-1': 1 }],
    ['more units than the limit', { 'line-0': 2 }],
    ['more units than the line has', { 'line-2': 3 }],
    ['a fractional unit count', { 'line-0': 0.5 }],
    ['a line not in the cart', { 'line-7': 1 }],
  ])('falls back to the cheapest units for an invalid pick (%s)', (_, picks) => {
    const result = computeVoucherDiscount(voucher(), context([fries, burger, soda], { unitPicks: { FRIES50: picks } }))

    expect(result.allocations).toEqual([{ lineId: 'line-0', amount: 56, units: 1, unitCents: [5600, 0, 0, 0, 0] }])
  })

  it('a fixed voucher takes its value off EACH chosen unit, never more than the unit', () => {
    const result = computeVoucherDiscount(
      voucher({ discountType: 'fixed', discountValue: 200, maxDiscountedUnits: 2 }),
      context([fries]),
    )

    // ₱200 off each of 2 fries, each worth ₱112 → ₱224.
    expect(result.amount).toBe(224)
    expect(result.allocations[0].units).toBe(2)
  })

  it('applies the peso cap across all chosen units', () => {
    const result = computeVoucherDiscount(
      voucher({ maxDiscountedUnits: 3, maxDiscountAmount: 100 }),
      context([fries]),
    )

    expect(result.amount).toBe(100)
    expect(result.allocations[0].unitCents?.reduce((sum, cents) => sum + cents, 0)).toBe(10000)
  })

  it('splits an uneven line to the centavo (₱100 over 3 units)', () => {
    const odd: DiscountLine = { id: 'line-0', menuItemId: 'fries', quantity: 3, subtotal: 100 }
    const result = computeVoucherDiscount(voucher({ discountValue: 100, maxDiscountedUnits: 3 }), context([odd]))

    expect(result.amount).toBe(100)
  })

  it('two stacked vouchers never push the same unit below zero', () => {
    const first = voucher({ id: 'a', code: 'A', discountValue: 80 })
    const second = voucher({ id: 'b', code: 'B', discountValue: 100, maxDiscountedUnits: 5 })
    const result = applyVouchers([first, second], context([fries]))

    // A: 80% of one fries (₱89.60). B: 100% of what is left (₱470.40).
    expect(result.discountTotal).toBe(560)
    expect(result.remaining.byUnit['line-0']).toEqual([0, 0, 0, 0, 0])
  })

  it('a unit-limited voucher after an unlimited one sees the per-unit remainder', () => {
    const half = voucher({ id: 'h', code: 'HALF', maxDiscountedUnits: null })
    const one = voucher({ id: 'o', code: 'ONE', discountValue: 100 })
    const result = applyVouchers([half, one], context([fries]))

    // HALF: ₱280 off all five; ONE: the rest of one fries (₱56).
    expect(result.discountTotal).toBe(336)
  })

  it('names the dish and units on the discount line', () => {
    const result = applyVouchers([voucher()], context([fries, burger]))

    expect(result.discountLines).toEqual([
      {
        label: 'Fries 50%',
        amount: 56,
        voucherId: 'v-fries',
        code: 'FRIES50',
        items: [{ lineKey: 'line-0', units: 1, amount: 56 }],
      },
    ])
    expect(result.allocationsByLine).toEqual({ 'line-0': 56 })
  })

  it('leaves an unlimited voucher line without items', () => {
    const result = applyVouchers([voucher({ maxDiscountedUnits: null })], context([fries]))

    expect(result.discountLines[0].items).toBeUndefined()
  })

  it('ignores a unit limit on a free-delivery voucher', () => {
    const result = computeVoucherDiscount(
      voucher({ discountType: 'free_delivery', maxDiscountedUnits: 1 }),
      context([fries], { deliveryFee: 50 }),
    )

    expect(result.amount).toBe(50)
  })
})
