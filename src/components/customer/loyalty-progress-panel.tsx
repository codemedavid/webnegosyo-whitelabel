'use client'

import { Loader2, Sparkles, Stamp } from 'lucide-react'
import Link from 'next/link'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'
import { StampTrack } from '@/components/customer/order-tracking/stamp-track'
import { RewardLadder } from '@/components/customer/order-tracking/reward-ladder'
import { RewardBurst } from '@/components/customer/order-tracking/reward-burst'
import { cardSteps } from '@/lib/loyalty/card-progress'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'

interface LoyaltyProgressPanelProps {
  /** The store's live offer, or null when it promises nothing today. */
  offer: LoyaltyOffer | null
  /** The typed number's standing, or null while unknown. */
  card: OrderStampCard | null
  isLoading: boolean
  storeName: string
  logoUrl?: string | null
  tenantSlug?: string
  error?: string | null
  onRetry?: () => void
}

/**
 * The customer's own stamp card, shown beside the number they just typed.
 *
 * Shared by the checkout form and the receipt claim form so the same number
 * reads the same way in both places. Paints entirely from `var(--trk-*)`, which
 * the tracking page defines on its root and the checkout supplies around it —
 * nothing here picks a colour of its own.
 *
 * Renders nothing when there is nothing true to say. A card that appears with
 * a guessed balance would be worse than an empty space.
 */
export function LoyaltyProgressPanel({
  card,
  isLoading,
  storeName,
  logoUrl = null,
  tenantSlug,
  error,
  onRetry,
}: LoyaltyProgressPanelProps) {
  const refreshNotice = error ? (
    <div role="status" className="space-y-1 text-xs" style={{ color: 'var(--trk-loy-muted)' }}>
      <p>{error} {card ? 'Showing your last confirmed balance.' : 'Your balance is unavailable right now.'}</p>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline" style={{ color: 'var(--trk-loy-link)' }}>Try again</button>}
    </div>
  ) : null

  if (isLoading && !card) {
    return (
      <div
        data-testid="loyalty-progress-loading"
        className="flex items-center gap-2 border px-4 py-3 text-xs font-medium"
        style={{ borderRadius: 'var(--trk-radius-inner)', borderColor: 'var(--trk-loy-border)', color: 'var(--trk-loy-muted)' }}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking your stamps…
      </div>
    )
  }

  if (!card) return refreshNotice

  const unit = card.earnMode === 'stamp' ? 'stamps' : 'points'
  const earningActive = !card.programStatus || card.programStatus === 'active'
  const hasReward = card.rewardsAvailable > 0
  const steps = cardSteps(card.rewardSteps, card.threshold, card.rewardLabel)

  return (
    <section
      data-testid="loyalty-progress-panel"
      aria-label="Your stamp card"
      data-branding-scope="loyalty/card"
      className="relative overflow-hidden border"
      style={{ borderRadius: 'var(--trk-radius-inner)', backgroundColor: 'var(--trk-loy-bg)', borderColor: 'var(--trk-loy-border)' }}
    >
      <div
        data-branding-scope="loyalty/band"
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ backgroundColor: 'var(--trk-band-soft)', color: 'var(--trk-band-color)' }}
      >
        {hasReward && <RewardBurst emoji={steps[0]?.emoji} />}
        {hasReward ? <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Stamp className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]">{card.programName}</p>
      </div>

      <div className="space-y-2.5 p-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--trk-loy-text)' }}>
          {hasReward
            ? `Reward ready! ${card.rewardLabel} is waiting at ${storeName}.`
            : `${card.balance} of ${card.threshold} ${unit} toward ${card.rewardLabel}`}
        </p>
        {hasReward && <p className="text-sm font-semibold" style={{ color: 'var(--trk-loy-text)' }}>{card.balance} of {card.threshold} {unit} toward your next {card.rewardLabel}</p>}
        <StampTrack
          threshold={card.threshold}
          filled={card.balance}
          earnMode={card.earnMode}
          nextIsLive={earningActive}
          logoUrl={logoUrl}
          steps={steps}
        />
        <RewardLadder steps={steps} balance={card.balance} earnMode={card.earnMode} showHeadline={earningActive} />
        <p className="text-xs" style={{ color: 'var(--trk-loy-muted)' }}>
          {earningActive ? 'Use this number every time and your stamps add up automatically.' : card.programStatus === 'ended' ? 'This program has ended.' : 'Earning is paused for this program.'}
        </p>
        {card.balance < 0 && <p className="text-xs" style={{ color: 'var(--trk-loy-muted)' }}>Your balance includes an adjustment. New earnings first cover the {Math.abs(card.balance)} {unit} adjustment.</p>}
        {refreshNotice}
        {tenantSlug ? <Link href={`/${tenantSlug}/loyalty`} className="inline-block text-xs font-semibold underline" style={{ color: 'var(--trk-loy-link)' }}><StoreLabel name="loyalty.view_rewards" fallback="View rewards & use a reward" /></Link> : null}
      </div>
    </section>
  )
}
