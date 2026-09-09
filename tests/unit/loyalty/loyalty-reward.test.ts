/**
 * What an issued reward is worth on a cart, and how it coexists with vouchers.
 */
import { valueLoyaltyReward, applyLoyaltyReward } from '@/lib/loyalty/reward'
import type { LoyaltyEntitlementTerms } from '@/lib/loyalty/types'
import type { DiscountLine } from '@/lib/vouchers/types'

const LINES: DiscountLine[] = [
  { id: 'l1', menuItemId: 'latte', quantity: 2, subtotal: 300 },
  { id: 'l2', menuItemId: 'cake', quantity: 1, subtotal: 180 },
]

function terms(reward: LoyaltyEntitlementTerms['reward'], isExclusive = true): LoyaltyEntitlementTerms {
  return { programName: 'Coffee card', programId: 'prog-1', versionNumber: 1, reward, isExclusive }
}

describe('valueLoyaltyReward', () => {
  it('values a fixed reward, never more than the cart', () => {
    expect(valueLoyaltyReward(terms({ type: 'fixed', amount: 50 }), { lines: LINES })).toEqual({
      ok: true,
      line: { label: 'Coffee card', amount: 50, loyaltyProgramId: 'prog-1' },
    })
    const tiny = valueLoyaltyReward(terms({ type: 'fixed', amount: 1000 }), { lines: LINES })
    expect(tiny.ok && tiny.line.amount).toBe(480)
  })

  it('values a percent reward against the merchandise subtotal, capped', () => {
    const capped = valueLoyaltyReward(terms({ type: 'percent', percent: 50, maxAmount: 100 }), { lines: LINES })
    expect(capped.ok && capped.line.amount).toBe(100)
    const open = valueLoyaltyReward(terms({ type: 'percent', percent: 10 }), { lines: LINES })
    expect(open.ok && open.line.amount).toBe(48)
  })

  it('waives ONE base unit of the free item, leaving upgrades and add-ons payable', () => {
    const lines: DiscountLine[] = [
      // Two lattes at ₱150 base each, with ₱40 of add-ons on the line.
      { id: 'l1', menuItemId: 'latte', quantity: 2, subtotal: 340 },
    ]
    const result = valueLoyaltyReward(
      terms({ type: 'free_item', menuItemId: 'latte', itemName: 'Latte' }),
      { lines, baseUnitPrices: { latte: 150 } },
    )
    expect(result).toEqual({
      ok: true,
      line: { label: 'Free Latte', amount: 150, loyaltyProgramId: 'prog-1' },
    })
  })

  it('refuses a free item that is not in the cart rather than substituting', () => {
    const result = valueLoyaltyReward(
      terms({ type: 'free_item', menuItemId: 'croissant', itemName: 'Croissant' }),
      { lines: LINES, baseUnitPrices: { latte: 150 } },
    )
    expect(result).toEqual({ ok: false, reason: 'item_not_in_cart' })
  })

  it('refuses a free item whose base price is unknown, rather than guessing from the line', () => {
    const result = valueLoyaltyReward(
      terms({ type: 'free_item', menuItemId: 'latte', itemName: 'Latte' }),
      { lines: LINES, baseUnitPrices: {} },
    )
    expect(result).toEqual({ ok: false, reason: 'item_unavailable' })
  })

  it('is worth nothing on an empty cart', () => {
    expect(valueLoyaltyReward(terms({ type: 'fixed', amount: 50 }), { lines: [] })).toEqual({ ok: false, reason: 'no_value' })
  })
})

describe('applyLoyaltyReward', () => {
  const rewardLine = { label: 'Coffee card', amount: 50, loyaltyProgramId: 'prog-1' }
  const voucherLine = { label: 'WELCOME10', amount: 30, voucherId: 'v1', code: 'WELCOME10' }

  it('refuses to share an order with a voucher when the reward is exclusive', () => {
    expect(applyLoyaltyReward({ discountLines: [voucherLine] }, rewardLine, true)).toEqual({
      ok: false,
      reason: 'not_stackable',
    })
  })

  it('appends the reward after the vouchers when the program allows stacking', () => {
    const result = applyLoyaltyReward({ discountLines: [voucherLine] }, rewardLine, false)
    expect(result.ok && result.discountLines).toEqual([voucherLine, rewardLine])
  })

  it('applies alone when there are no vouchers', () => {
    const result = applyLoyaltyReward({ discountLines: [] }, rewardLine, true)
    expect(result.ok && result.discountLines).toEqual([rewardLine])
  })

  it('never lets a second loyalty reward onto the same sale', () => {
    const other = { ...rewardLine, loyaltyProgramId: 'prog-2' }
    expect(applyLoyaltyReward({ discountLines: [other] }, rewardLine, false)).toEqual({
      ok: false,
      reason: 'one_reward_per_sale',
    })
  })
})
