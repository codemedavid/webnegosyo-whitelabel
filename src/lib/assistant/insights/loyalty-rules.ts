/**
 * A loyalty program's rules in the owner's words, for cards and for the model.
 * One wording for reads and proposals, built on the shared reward label.
 */

import { describeLoyaltyReward } from '@/lib/loyalty/reward-label'
import type { LoyaltyRules } from '@/lib/loyalty/types'

export function describeEarning(rules: LoyaltyRules): string {
  const unit = rules.earnMode === 'stamp' ? 'stamp' : 'point'
  const per = rules.earnMode === 'stamp' ? '1 stamp per visit' : `${rules.pointsPerPeso ?? 0} point(s) per ₱1`
  const min = rules.minSpend ? ` (orders of ₱${rules.minSpend}+)` : ''
  return `${per}${min}; ${rules.threshold} ${unit}s for the reward`
}

export function describeRewards(rules: LoyaltyRules): string {
  const steps = [...(rules.milestones ?? []).map((m) => `${m.at}: ${describeLoyaltyReward(m.reward)}`), `${rules.threshold}: ${describeLoyaltyReward(rules.reward)}`]
  return steps.join(' · ')
}

export function describeExpiry(rules: LoyaltyRules): string {
  return rules.rewardExpiryDays ? `Rewards expire after ${rules.rewardExpiryDays} days` : 'Rewards never expire'
}
