/**
 * What the customer's stamp card says about the road ahead: the rungs to
 * draw, and the one they are working toward right now.
 *
 * Pure and client-safe. The server sends `rewardSteps`; an older cached
 * response without them still draws a one-reward card from the threshold and
 * label, so no surface ever goes blank mid-deploy.
 */

import type { LoyaltyRewardStep } from './ladder'
import type { LoyaltyEarnMode } from './types'

const FALLBACK_EMOJI = '🎁'

export function cardSteps(
  steps: readonly LoyaltyRewardStep[] | undefined,
  threshold: number,
  rewardLabel: string,
): LoyaltyRewardStep[] {
  const fitting = (steps ?? []).filter((step) => step.at > 0 && step.at <= threshold)
  if (fitting.length === 0) {
    return [{ at: threshold, label: rewardLabel, emoji: FALLBACK_EMOJI, imageUrl: null, isFinal: true }]
  }
  return [...fitting].sort((a, b) => a.at - b.at)
}

export interface NextReward {
  step: LoyaltyRewardStep
  remaining: number
  /** "2 more stamps → Free Iced Tea". */
  headline: string
}

function unitLabel(earnMode: LoyaltyEarnMode, count: number): string {
  const unit = earnMode === 'stamp' ? 'stamp' : 'point'
  return count === 1 ? unit : `${unit}s`
}

export function describeNextReward(
  steps: readonly LoyaltyRewardStep[],
  balance: number,
  earnMode: LoyaltyEarnMode,
): NextReward | null {
  const safeBalance = Number.isFinite(balance) ? balance : 0
  const step = steps.find((candidate) => candidate.at > safeBalance)
  if (!step) return null
  const remaining = step.at - safeBalance
  return { step, remaining, headline: `${remaining} more ${unitLabel(earnMode, remaining)} → ${step.label}` }
}
