/**
 * What a quantity stepper is allowed to reach, and what it tells the customer.
 *
 * Checkout already refuses a cart the kitchen cannot fill
 * (`checkout-stock-guard.ts`). That is the authoritative boundary, but it is a
 * bad place to *learn*: a customer picks 12, walks through the whole checkout,
 * and is turned away at the last screen. This is the same ceiling, surfaced
 * where the number is actually chosen.
 *
 * Pure so the product page, the cart page, and the register can agree. A
 * stepper that stops at 5 while the guard refuses at 4 would be worse than no
 * stepper cap at all.
 */

import {
  resolveAddableQuantity,
  describeRemainingStock,
  STOCK_HINT_THRESHOLD,
} from '@/lib/inventory/stepper-cap'

const HARD_MAX = 99

describe('resolveAddableQuantity', () => {
  it('allows the hard maximum when the dish has no ceiling', () => {
    // Untracked dishes must behave exactly as they did before this existed.
    expect(resolveAddableQuantity(null, 0, HARD_MAX)).toBe(HARD_MAX)
  })

  it('allows the whole ceiling when nothing is in the cart yet', () => {
    expect(resolveAddableQuantity(5, 0, HARD_MAX)).toBe(5)
  })

  it('subtracts what the cart already holds of that dish', () => {
    // Two already chosen out of five producible leaves three.
    expect(resolveAddableQuantity(5, 2, HARD_MAX)).toBe(3)
  })

  it('allows nothing once the cart already holds the whole ceiling', () => {
    expect(resolveAddableQuantity(5, 5, HARD_MAX)).toBe(0)
  })

  it('never goes negative when the cart somehow outran the shelf', () => {
    // Stock can fall between adding to the cart and looking at it again.
    expect(resolveAddableQuantity(5, 9, HARD_MAX)).toBe(0)
  })

  it('still respects the hard maximum for a very large ceiling', () => {
    expect(resolveAddableQuantity(5000, 0, HARD_MAX)).toBe(HARD_MAX)
  })

  it('allows nothing for a sold-out dish', () => {
    expect(resolveAddableQuantity(0, 0, HARD_MAX)).toBe(0)
  })
})

describe('describeRemainingStock', () => {
  it('says nothing for a dish with no ceiling', () => {
    expect(describeRemainingStock(null, 0)).toBeNull()
  })

  it('says nothing when there is plenty left — a stepper must not nag', () => {
    expect(describeRemainingStock(STOCK_HINT_THRESHOLD + 1, 0)).toBeNull()
  })

  it('warns how many are left once stock is short', () => {
    const hint = describeRemainingStock(3, 0)

    expect(hint).toContain('3')
    expect(hint).toMatch(/left/i)
  })

  it('counts what is already in the cart against the hint', () => {
    // Five producible, four already chosen: one left, not five.
    expect(describeRemainingStock(5, 4)).toContain('1')
  })

  it('says the maximum is reached rather than "0 left"', () => {
    const hint = describeRemainingStock(5, 5)

    expect(hint).not.toMatch(/\b0 left/i)
    expect(hint).toMatch(/all|maximum|no more/i)
  })

  it('says sold out when the kitchen can make none at all', () => {
    expect(describeRemainingStock(0, 0)).toMatch(/sold out/i)
  })
})
