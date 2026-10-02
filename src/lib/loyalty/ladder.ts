/**
 * The reward ladder as a customer sees it: every rung on the card, in order,
 * with the icon that marks its slot.
 *
 * Pure and serialisable, so the tracking page, the wallet page, the checkout
 * and the wallet pass all draw the same card from the same rules.
 */

import { describeLoyaltyReward } from './reward-label'
import type { LoyaltyReward, LoyaltyRules } from './types'

export interface LoyaltyRewardStep {
  /** Stamps or points into the card where this reward unlocks. */
  at: number
  /** Customer language, e.g. "Free Iced Tea". */
  label: string
  /** Always set: the merchant's pick, or one that fits the reward type. */
  emoji: string
  /** The menu photo of a free item, when the catalog has one. */
  imageUrl: string | null
  /** The top rung — reaching it starts a fresh card. */
  isFinal: boolean
}

const TYPE_EMOJI: Record<LoyaltyReward['type'], string> = {
  free_item: '🎁',
  fixed: '💸',
  percent: '🏷️',
}

export function rewardEmoji(reward: LoyaltyReward): string {
  return reward.emoji?.trim() || TYPE_EMOJI[reward.type]
}

function toStep(at: number, reward: LoyaltyReward, isFinal: boolean): LoyaltyRewardStep {
  return {
    at,
    label: describeLoyaltyReward(reward),
    emoji: rewardEmoji(reward),
    imageUrl: reward.type === 'free_item' ? reward.imageUrl ?? null : null,
    isFinal,
  }
}

/** Every rung, lowest first; the card-resetting reward is always last. */
export function rewardSteps(rules: LoyaltyRules): LoyaltyRewardStep[] {
  const middle = (rules.milestones ?? [])
    .filter((milestone) => milestone.at > 0 && milestone.at < rules.threshold)
    .sort((a, b) => a.at - b.at)
    .map((milestone) => toStep(milestone.at, milestone.reward, false))
  return [...middle, toStep(rules.threshold, rules.reward, true)]
}

/**
 * The rung the customer is working toward and how far away it is. A balance
 * in debt (after a reversal) counts its way back up from below zero.
 */
export function nextRewardStep(
  rules: LoyaltyRules,
  balance: number,
): { step: LoyaltyRewardStep; remaining: number } | null {
  const safeBalance = Number.isFinite(balance) ? balance : 0
  const step = rewardSteps(rules).find((candidate) => candidate.at > safeBalance)
  if (!step) return null
  return { step, remaining: step.at - safeBalance }
}
