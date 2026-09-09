/**
 * How much an order earns, and what a threshold crossing does to a balance.
 *
 * `settleThreshold` is also implemented inside `apply_loyalty_earning` in
 * Postgres — that copy is the one that moves money; this one exists for
 * previews and for the shadow reconciliation to predict what the database
 * should have done. Their tests pin them to the same answers.
 */

import type { CustomerOrderFact } from '@/lib/customer-order-facts'
import { qualifyOrderForProgram } from './qualify'
import { snapshotRewardTerms } from './versioning'
import type { LoyaltyEarnPlan, LoyaltyProgram, LoyaltyRules } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Stamps or points this order is worth under `rules`. Whole units only. */
export function computeEarnDelta(rules: LoyaltyRules, netTotal: number): number {
  if (rules.earnMode === 'stamp') return 1
  const rate = rules.pointsPerPeso ?? 0
  const points = Math.floor(Math.max(0, netTotal) * rate)
  return Number.isFinite(points) ? points : 0
}

export interface ThresholdSettlement {
  balance: number
  rewardsToIssue: number
}

/**
 * Crossing 10 with 12 leaves 2 on the card; crossing it twice at once issues
 * two rewards. A negative balance is a debt and issues nothing.
 */
export function settleThreshold(balance: number, threshold: number): ThresholdSettlement {
  if (threshold <= 0 || balance < threshold) return { balance, rewardsToIssue: 0 }
  const rewardsToIssue = Math.floor(balance / threshold)
  return { balance: balance - rewardsToIssue * threshold, rewardsToIssue }
}

function rewardExpiry(rules: LoyaltyRules, completedAt: string): string | null {
  if (rules.rewardExpiryDays == null) return null
  const base = Date.parse(completedAt)
  if (Number.isNaN(base)) return null
  return new Date(base + rules.rewardExpiryDays * DAY_MS).toISOString()
}

/**
 * One plan per program the order earns on. A customer earns on EVERY eligible
 * program; the one-reward-per-sale rule belongs to redemption, not here.
 */
export function planEarning(
  programs: readonly LoyaltyProgram[],
  fact: CustomerOrderFact,
): LoyaltyEarnPlan[] {
  const plans: LoyaltyEarnPlan[] = []
  for (const program of programs) {
    if (!qualifyOrderForProgram(program, fact).isQualified) continue

    const rules = program.version.rules
    const delta = computeEarnDelta(rules, fact.netTotal)
    if (delta <= 0) continue

    plans.push({
      programId: program.id,
      versionId: program.version.id,
      delta,
      threshold: rules.threshold,
      rewardTerms: snapshotRewardTerms({
        id: program.id,
        name: program.name,
        versionNumber: program.version.version,
        rules,
      }),
      rewardExpiresAt: rewardExpiry(rules, fact.completedAt ?? fact.updatedAt),
    })
  }
  return plans
}
