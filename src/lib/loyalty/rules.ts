/**
 * Validates the `rules` jsonb a program version stores.
 *
 * The engine trusts this shape completely, so it is checked once, at write
 * time, and refused with a reason a merchant can act on. A malformed blob that
 * slipped through would otherwise surface as a customer earning nothing, or
 * everything, with no error anywhere.
 */

import type { LoyaltyReward, LoyaltyRules } from './types'

export type LoyaltyRulesParse =
  | { ok: true; value: LoyaltyRules }
  | { ok: false; error: string }

const MAX_PERCENT = 100

function refuse(error: string): LoyaltyRulesParse {
  return { ok: false, error }
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function optionalNonNegative(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

function parseReward(raw: unknown): { ok: true; value: LoyaltyReward } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'A reward is required.' }
  const reward = raw as Record<string, unknown>

  switch (reward.type) {
    case 'fixed': {
      if (!isPositive(reward.amount)) return { ok: false, error: 'A fixed reward needs an amount above zero.' }
      return { ok: true, value: { type: 'fixed', amount: reward.amount } }
    }
    case 'percent': {
      if (!isPositive(reward.percent) || reward.percent > MAX_PERCENT) {
        return { ok: false, error: 'A percent reward must be between 0 and 100.' }
      }
      const maxAmount = optionalNonNegative(reward.maxAmount)
      if (maxAmount === undefined) return { ok: false, error: 'The percent cap must be a positive amount.' }
      return { ok: true, value: { type: 'percent', percent: reward.percent, maxAmount: maxAmount || null } }
    }
    case 'free_item': {
      const menuItemId = typeof reward.menuItemId === 'string' ? reward.menuItemId.trim() : ''
      const itemName = typeof reward.itemName === 'string' ? reward.itemName.trim() : ''
      if (!menuItemId) return { ok: false, error: 'A free-item reward needs the menu item.' }
      return { ok: true, value: { type: 'free_item', menuItemId, itemName: itemName || 'Free item' } }
    }
    default:
      return { ok: false, error: 'Reward type must be fixed, percent or free_item.' }
  }
}

export function parseLoyaltyRules(raw: unknown): LoyaltyRulesParse {
  if (!raw || typeof raw !== 'object') return refuse('Rules must be an object.')
  const input = raw as Record<string, unknown>

  if (input.earnMode !== 'stamp' && input.earnMode !== 'points') {
    return refuse('earnMode must be stamp or points.')
  }
  if (!isPositive(input.threshold)) return refuse('threshold must be above zero.')

  const pointsPerPeso = input.earnMode === 'points' ? input.pointsPerPeso : null
  if (input.earnMode === 'points' && !isPositive(pointsPerPeso)) {
    return refuse('A points program needs pointsPerPeso above zero.')
  }

  const minSpend = optionalNonNegative(input.minSpend)
  if (minSpend === undefined) return refuse('minSpend cannot be negative.')

  const rewardExpiryDays = optionalNonNegative(input.rewardExpiryDays)
  if (rewardExpiryDays === undefined) return refuse('rewardExpiryDays cannot be negative.')

  const reward = parseReward(input.reward)
  if (!reward.ok) return refuse(reward.error)

  return {
    ok: true,
    value: {
      earnMode: input.earnMode,
      threshold: input.threshold,
      pointsPerPeso: typeof pointsPerPeso === 'number' ? pointsPerPeso : null,
      minSpend: minSpend || null,
      reward: reward.value,
      rewardExpiryDays: rewardExpiryDays || null,
      // Exclusive unless the merchant says otherwise: a reward quietly stacking
      // on a voucher is how an order gets given away.
      isExclusive: input.isExclusive !== false,
    },
  }
}
