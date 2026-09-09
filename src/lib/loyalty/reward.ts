/**
 * What an issued reward is worth on a cart, and how it sits beside vouchers.
 *
 * The reward comes out as an `OrderDiscountLine`, so it flows through
 * `computeOrderTotals` like every other discount — `order-totals-wiring.test.ts`
 * exists to stop a fifth money surface, and this module is careful not to be
 * one.
 */

import type { OrderDiscountLine } from '@/lib/order-totals'
import type { DiscountLine } from '@/lib/vouchers/types'
import type { LoyaltyEntitlementTerms } from './types'

const CENTAVO_PRECISION = 100

function roundMoney(value: number): number {
  return Math.round(value * CENTAVO_PRECISION) / CENTAVO_PRECISION
}

/** A discount line that came from loyalty rather than a voucher. */
export interface LoyaltyDiscountLine extends OrderDiscountLine {
  loyaltyProgramId: string
}

export interface RewardCart {
  lines: readonly DiscountLine[]
  /**
   * Base price per menu item id, BEFORE variations and add-ons. Required to
   * value a free item: the line subtotal includes paid extras, which the reward
   * must not waive.
   */
  baseUnitPrices?: Readonly<Record<string, number>>
}

export type RewardRejectionReason = 'no_value' | 'item_not_in_cart' | 'item_unavailable'

export type RewardValuation =
  | { ok: true; line: LoyaltyDiscountLine }
  | { ok: false; reason: RewardRejectionReason }

function subtotalOf(lines: readonly DiscountLine[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0)
}

export function valueLoyaltyReward(terms: LoyaltyEntitlementTerms, cart: RewardCart): RewardValuation {
  const subtotal = roundMoney(subtotalOf(cart.lines))
  if (subtotal <= 0) return { ok: false, reason: 'no_value' }

  const reward = terms.reward
  const line = (label: string, amount: number): RewardValuation =>
    amount > 0
      ? { ok: true, line: { label, amount: roundMoney(amount), loyaltyProgramId: terms.programId } }
      : { ok: false, reason: 'no_value' }

  switch (reward.type) {
    case 'fixed':
      return line(terms.programName, Math.min(reward.amount, subtotal))
    case 'percent': {
      const raw = (subtotal * reward.percent) / 100
      const capped = reward.maxAmount != null ? Math.min(raw, reward.maxAmount) : raw
      return line(terms.programName, Math.min(capped, subtotal))
    }
    case 'free_item': {
      const match = cart.lines.find((l) => l.menuItemId === reward.menuItemId && l.quantity > 0)
      // Never substitute: a reward for a latte is not a reward for whatever is
      // in the cart instead.
      if (!match) return { ok: false, reason: 'item_not_in_cart' }
      const base = cart.baseUnitPrices?.[reward.menuItemId]
      if (base == null || !Number.isFinite(base) || base <= 0) return { ok: false, reason: 'item_unavailable' }
      // One base unit only; the rest of the line (other units, add-ons,
      // upgrades) stays payable.
      return line(`Free ${reward.itemName}`, Math.min(base, match.subtotal))
    }
  }
}

export type RewardStackRejection = 'not_stackable' | 'one_reward_per_sale'

export type RewardApplication =
  | { ok: true; discountLines: readonly OrderDiscountLine[] }
  | { ok: false; reason: RewardStackRejection }

function isLoyaltyLine(line: OrderDiscountLine): boolean {
  return typeof (line as Partial<LoyaltyDiscountLine>).loyaltyProgramId === 'string'
}

/**
 * Adds a loyalty reward to an order's discount lines.
 *
 * Exclusive by default: loyalty does not combine with vouchers or manual
 * discounts. And regardless of exclusivity, a sale carries ONE reward — a
 * customer earns on every program but redeems on one.
 */
export function applyLoyaltyReward(
  current: { discountLines: readonly OrderDiscountLine[] },
  reward: LoyaltyDiscountLine,
  isExclusive: boolean,
): RewardApplication {
  if (current.discountLines.some(isLoyaltyLine)) return { ok: false, reason: 'one_reward_per_sale' }
  if (isExclusive && current.discountLines.length > 0) return { ok: false, reason: 'not_stackable' }
  return { ok: true, discountLines: [...current.discountLines, reward] }
}
