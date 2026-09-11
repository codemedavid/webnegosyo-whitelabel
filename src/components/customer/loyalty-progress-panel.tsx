'use client'

import { Loader2, Sparkles, Stamp } from 'lucide-react'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'
import { StampTrack } from '@/components/customer/order-tracking/stamp-track'

interface LoyaltyProgressPanelProps {
  /** The store's live offer, or null when it promises nothing today. */
  offer: LoyaltyOffer | null
  /** The typed number's standing, or null while unknown. */
  card: OrderStampCard | null
  isLoading: boolean
  storeName: string
  logoUrl?: string | null
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
  offer,
  card,
  isLoading,
  storeName,
  logoUrl = null,
}: LoyaltyProgressPanelProps) {
  if (isLoading) {
    return (
      <div
        data-testid="loyalty-progress-loading"
        className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-medium"
        style={{ borderColor: 'var(--trk-card-border)', color: 'var(--trk-text-muted)' }}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking your stamps…
      </div>
    )
  }

  if (!card || !offer) return null

  const unit = card.earnMode === 'stamp' ? 'stamps' : 'points'
  const hasReward = card.rewardsAvailable > 0
  // A reward is issued by spending the balance, so a customer holding one can
  // legitimately be back at zero. Show the card they earned, not an empty row.
  const filled = card.balance === 0 && hasReward ? card.threshold : card.balance

  return (
    <section
      data-testid="loyalty-progress-panel"
      aria-label="Your stamp card"
      className="overflow-hidden rounded-2xl border"
      style={{ backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ backgroundColor: 'var(--trk-accent-soft)', color: 'var(--trk-accent)' }}
      >
        {hasReward ? <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Stamp className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]">{card.programName}</p>
      </div>

      <div className="space-y-2.5 p-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--trk-text)' }}>
          {hasReward
            ? `Reward ready! ${card.rewardLabel} is waiting at ${storeName}.`
            : `${card.balance} of ${card.threshold} ${unit} toward ${card.rewardLabel}`}
        </p>
        <StampTrack
          threshold={card.threshold}
          filled={filled}
          earnMode={card.earnMode}
          nextIsLive={!hasReward}
          logoUrl={logoUrl}
        />
        <p className="text-xs" style={{ color: 'var(--trk-text-muted)' }}>
          Use this number every time and your stamps add up automatically.
        </p>
      </div>
    </section>
  )
}
