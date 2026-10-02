'use client'

import { Check } from 'lucide-react'
import { describeNextReward } from '@/lib/loyalty/card-progress'
import type { LoyaltyRewardStep } from '@/lib/loyalty/ladder'
import type { LoyaltyEarnMode } from '@/lib/loyalty/types'
import { RewardIcon } from './stamp-track'

interface RewardLadderProps {
  /** From `cardSteps`, lowest rung first. */
  steps: LoyaltyRewardStep[]
  balance: number
  earnMode: LoyaltyEarnMode
  /** Hide the "2 more stamps → …" line when the surface already says it. */
  showHeadline?: boolean
}

/**
 * "Rewards on this card": every reward the customer is collecting toward, as
 * chips with the reward's photo or emoji. Reached rungs carry a check, the next
 * one is highlighted, and a headline says exactly how far away it is.
 */
export function RewardLadder({ steps, balance, earnMode, showHeadline = true }: RewardLadderProps) {
  if (steps.length === 0) return null
  const next = describeNextReward(steps, balance, earnMode)
  const unit = earnMode === 'stamp' ? 'stamps' : 'points'

  return (
    <div data-testid="reward-ladder" className="space-y-2">
      {showHeadline && next ? (
        <p data-testid="next-reward" className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--trk-text)' }}>
          <span aria-hidden="true">{next.step.emoji}</span>
          {next.headline}
        </p>
      ) : null}
      {steps.length > 1 ? (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--trk-text-muted)' }}>
            Rewards on this card
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {steps.map((step) => {
              const isReached = balance >= step.at
              const isNext = next?.step === step
              return (
                <li
                  key={step.at}
                  data-testid="reward-chip"
                  data-reached={isReached ? 'true' : 'false'}
                  className="flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-semibold"
                  style={{
                    borderColor: isNext ? 'var(--trk-accent)' : 'var(--trk-card-border)',
                    backgroundColor: isReached ? 'var(--trk-accent-soft)' : isNext ? 'var(--trk-accent-tint)' : 'var(--trk-card)',
                    color: 'var(--trk-text)',
                  }}
                >
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: 'var(--trk-card)' }}>
                    <RewardIcon step={step} size={24} />
                  </span>
                  <span>{step.label}</span>
                  <span style={{ color: 'var(--trk-text-muted)' }}>· {step.at} {unit}</span>
                  {isReached ? <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--trk-success)' }} aria-label="reached" /> : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </div>
  )
}
