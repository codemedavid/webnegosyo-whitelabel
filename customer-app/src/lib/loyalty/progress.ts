import type { AppLoyaltyProgram } from '@/lib/contract'

export interface LoyaltyProgress {
  filled: number
  total: number
  fraction: number
  remaining: number
  caption: string
}

/** What the member card draws. A negative balance (after a reversal) draws as empty. */
export function loyaltyProgress(program: AppLoyaltyProgram): LoyaltyProgress {
  const total = program.threshold
  const filled = Math.max(0, Math.min(total, program.balance))
  const remaining = total - filled
  const unit = program.earnMode === 'points' ? 'point' : 'stamp'
  const caption =
    remaining === 0
      ? 'Reward unlocked'
      : `${remaining} more ${unit}${remaining === 1 ? '' : 's'} to ${program.rewardLabel}`
  return { filled, total, fraction: filled / total, remaining, caption }
}
