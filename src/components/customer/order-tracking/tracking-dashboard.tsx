'use client'

/**
 * The order-tracking page as the customer sees it — header, status banner,
 * "ring me" button, loyalty card, pickup code, timeline and receipt — with no
 * data fetching of its own. The live page (order-tracking-client) and the
 * Branding Studio's sample page (tracking-studio-preview) both render it, so
 * the preview is the real page.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, Bell, BellRing } from 'lucide-react'
import { StoreLabel, StorefrontLabelsProvider } from '@/components/customer/storefront-labels-provider'
import type { TrackingData } from '@/lib/order-tracking-service'
import type { PrepPromiseView } from '@/lib/prep-time'
import type { TrackingOptions } from '@/lib/tracking-style/keys'
import { TrackingHeader } from './tracking-header'
import { StatusHero } from './status-hero'
import { StatusTimeline } from './status-timeline'
import { OrderSummaryCard } from './order-summary-card'
import { ReadyAlertOverlay } from './ready-alert-overlay'
import { TrackingOptionsProvider } from './tracking-options'

export interface TrackingDashboardProps {
  storeName: string
  logoUrl: string | null
  /** `--trk-*` variables from buildTrackingTheme. */
  theme: CSSProperties
  options: TrackingOptions
  /** The store's own wording (`tenants.storefront_labels`). */
  storefrontLabels: unknown
  data: TrackingData
  shortId: string
  currentIndex: number
  placedLabel: string
  prepPromise: PrepPromiseView | null
  isAlarmArmed: boolean
  onArmAlarm: () => void
  /** The loyalty card (or nothing), placed where the owner chose. */
  loyalty: ReactNode
  /** Shown above the loyalty card (e.g. "couldn't refresh your stamps"). */
  loyaltyNotice?: ReactNode
  pickup: ReactNode
  readyNotice: { title: string; body: string } | null
  onAcknowledgeReady: () => void
  onBack: () => void
  /** The ready alert takes focus when it opens (off in the Studio preview, where the owner is typing). */
  shouldFocusAlert?: boolean
}

export function TrackingDashboard({
  storeName,
  logoUrl,
  theme,
  options,
  storefrontLabels,
  data,
  shortId,
  currentIndex,
  placedLabel,
  prepPromise,
  isAlarmArmed,
  onArmAlarm,
  loyalty,
  loyaltyNotice,
  pickup,
  readyNotice,
  onAcknowledgeReady,
  onBack,
  shouldFocusAlert = true,
}: TrackingDashboardProps) {
  const isCancelled = data.status === 'cancelled'
  const canRing = !data.isTerminal && data.status !== 'ready' && !isCancelled
  const labelSource = useMemo(() => ({ storefront_labels: storefrontLabels }), [storefrontLabels])
  const loyaltyBlock = (
    <>
      {loyaltyNotice}
      {loyalty}
    </>
  )

  return (
    <StorefrontLabelsProvider tenant={labelSource}>
      <TrackingOptionsProvider options={options}>
        <div
          data-branding-scope="tracking/page"
          className="min-h-screen"
          style={{
            ...theme,
            backgroundColor: 'var(--trk-bg)',
            backgroundImage: 'radial-gradient(120% 60% at 50% -10%, var(--trk-glow), transparent 70%)',
            color: 'var(--trk-text)',
          }}
        >
          <TrackingHeader
            storeName={storeName}
            logoUrl={logoUrl}
            shortId={shortId}
            isLive={!data.isTerminal}
            onBack={onBack}
            showLiveBadge={options.show_live_badge}
          />

          <main className="container mx-auto max-w-lg px-4 py-5">
            <div className="space-y-4">
              <StatusHero
                status={data.status}
                currentIndex={currentIndex}
                customerName={data.customerName}
                placedLabel={placedLabel}
                orderTypeLabel={data.orderType}
                scheduledLabel={data.scheduledLabel}
                prepPromise={prepPromise}
              />

              {/* Ready-alert opt-in — audio needs a tap, so it can't be automatic */}
              {canRing && <RingMeButton isArmed={isAlarmArmed} onArm={onArmAlarm} />}

              {options.loyalty_position === 'top' && loyaltyBlock}

              {pickup}

              {!isCancelled && options.show_timeline && <StatusTimeline currentIndex={currentIndex} />}

              <OrderSummaryCard
                items={data.items}
                total={data.total}
                deliveryFee={data.deliveryFee}
                serviceChargeAmount={data.serviceChargeAmount}
              />

              {options.loyalty_position === 'bottom' && loyaltyBlock}

              <div className="pb-8 pt-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ color: 'var(--trk-text-muted)' }}
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  <StoreLabel name="tracking.back" fallback="Back to menu" />
                </button>
              </div>
            </div>
          </main>

          {readyNotice && (
            <ReadyAlertOverlay title={readyNotice.title} body={readyNotice.body} onAcknowledge={onAcknowledgeReady} shouldFocus={shouldFocusAlert} />
          )}
        </div>
      </TrackingOptionsProvider>
    </StorefrontLabelsProvider>
  )
}

function RingMeButton({ isArmed, onArm }: { isArmed: boolean; onArm: () => void }) {
  return (
    <div className="space-y-1.5" data-branding-scope="tracking/ring">
      <button
        type="button"
        onClick={onArm}
        disabled={isArmed}
        className="flex h-12 w-full items-center justify-center gap-2 border-2 text-sm font-semibold transition-colors disabled:cursor-default"
        style={{
          borderRadius: 'var(--trk-radius-pill)',
          ...(isArmed
            ? { borderColor: 'var(--trk-ring-armed)', backgroundColor: 'var(--trk-ring-armed-soft)', color: 'var(--trk-ring-armed)' }
            : { borderColor: 'var(--trk-ring-border)', backgroundColor: 'var(--trk-ring-bg)', color: 'var(--trk-ring-text)' }),
        }}
      >
        {isArmed ? (
          <>
            <BellRing className="h-4 w-4" aria-hidden="true" />
            <StoreLabel name="tracking.ring_armed" fallback="We'll ring & vibrate when it's ready" />
          </>
        ) : (
          <>
            <Bell className="h-4 w-4" aria-hidden="true" />
            <StoreLabel name="tracking.ring_me" fallback="Ring me when my order is ready" />
          </>
        )}
      </button>
      {isArmed && (
        <p className="text-center text-xs" style={{ color: 'var(--trk-text-muted)' }}>
          Keep this page open and your volume up.
        </p>
      )}
    </div>
  )
}
