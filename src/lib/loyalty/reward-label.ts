/** A reward as the customer reads it — the one wording every surface shares. */
import type { LoyaltyReward } from './types'

function formatPeso(amount: number): string {
  const isWhole = Number.isInteger(amount)
  return `₱${isWhole ? amount.toString() : amount.toFixed(2)}`
}

export function describeLoyaltyReward(reward: LoyaltyReward): string {
  switch (reward.type) {
    case 'fixed':
      return `${formatPeso(reward.amount)} off`
    case 'percent':
      return `${reward.percent}% off${reward.maxAmount ? ` (up to ${formatPeso(reward.maxAmount)})` : ''}`
    case 'free_item':
      return `Free ${reward.itemName}`
  }
}
