/**
 * The public reply of the phone-keyed stamp lookup (`POST /api/loyalty/progress`).
 *
 * The lookup is unauthenticated — the typed number is the only credential —
 * so its reply carries exactly what `LoyaltyProgressPanel` paints and nothing
 * else. Built as an explicit allow-list rather than by passing the internal
 * card through, so a field later added to `OrderStampCard` (an id, a name, the
 * customer key) can never reach an anonymous caller by accident.
 */

import type { LoyaltyRewardStep } from './ladder'
import type { OrderStampCard } from './stamp-status'

export type PublicProgressCard = Pick<
  OrderStampCard,
  'programName' | 'programStatus' | 'earnMode' | 'balance' | 'threshold' | 'rewardsAvailable' | 'rewardLabel' | 'rewardSteps'
>

export interface PublicProgressResponse {
  success: true
  card: PublicProgressCard | null
}

function toPublicStep(step: LoyaltyRewardStep): LoyaltyRewardStep {
  return {
    at: step.at,
    label: step.label,
    emoji: step.emoji,
    imageUrl: step.imageUrl,
    isFinal: step.isFinal,
  }
}

export function toPublicProgressCard(card: OrderStampCard | null): PublicProgressCard | null {
  if (!card) return null
  return {
    programName: card.programName,
    ...(card.programStatus ? { programStatus: card.programStatus } : {}),
    earnMode: card.earnMode,
    balance: card.balance,
    threshold: card.threshold,
    rewardsAvailable: card.rewardsAvailable,
    rewardLabel: card.rewardLabel,
    ...(card.rewardSteps ? { rewardSteps: card.rewardSteps.map(toPublicStep) } : {}),
  }
}

export function toPublicProgressResponse(card: OrderStampCard | null): PublicProgressResponse {
  return { success: true, card: toPublicProgressCard(card) }
}
