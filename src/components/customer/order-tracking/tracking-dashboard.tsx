'use client'

/**
 * The order-tracking page as the customer sees it — header, status banner,
 * "ring me" button, loyalty card, pickup code, timeline and receipt — with no
 * data fetching of its own. The live page (order-tracking-client) and the
 * Branding Studio's sample page (tracking-studio-preview) both render it, so
 * the preview is the real page.
 *
 * With a published Page Designer design (`designedPage`) the body is the
 * owner's design built from the same parts (designed-tracking.tsx); without
 * one it is exactly today's page.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { StorefrontLabelsProvider } from '@/components/customer/storefront-labels-provider'
import { DesignedTracking } from '@/components/page-designer/tracking/designed-tracking'
import type { TrackingBlocksValue } from '@/components/page-designer/tracking/tracking-blocks-context'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import type { TrackingData } from '@/lib/order-tracking-service'
import type { PrepPromiseView } from '@/lib/prep-time'
import { readStorefrontLabels } from '@/lib/storefront-labels'
import type { TrackingOptions } from '@/lib/tracking-style/keys'
import { BackToMenuButton } from './back-to-menu-button'
import { RingMeButton } from './ring-me-button'
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
  /** The owner's published tracking design (Page Designer); null/absent = the standard page. */
  designedPage?: { design: HeroDesignV5; tenantSlug: string } | null
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
  designedPage = null,
}: TrackingDashboardProps) {
  const labelSource = useMemo(() => ({ storefront_labels: storefrontLabels }), [storefrontLabels])
  const loyaltyBlock = (
    <>
      {loyaltyNotice}
      {loyalty}
    </>
  )
  const labels = useMemo(() => readStorefrontLabels(labelSource), [labelSource])
  const blocks: TrackingBlocksValue = {
    storeName,
    logoUrl,
    data,
    shortId,
    currentIndex,
    placedLabel,
    prepPromise,
    isAlarmArmed,
    onArmAlarm,
    loyalty: loyaltyNotice || loyalty ? loyaltyBlock : null,
    pickup,
    onBack,
  }

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
          {designedPage ? (
            <DesignedTracking design={designedPage.design} tenantSlug={designedPage.tenantSlug} blocks={blocks} labels={labels} />
          ) : (
            <StandardTracking blocks={blocks} options={options} />
          )}

          {readyNotice && (
            <ReadyAlertOverlay title={readyNotice.title} body={readyNotice.body} onAcknowledge={onAcknowledgeReady} shouldFocus={shouldFocusAlert} />
          )}
        </div>
      </TrackingOptionsProvider>
    </StorefrontLabelsProvider>
  )
}

/** Today's page, top to bottom — what every store without a published design renders. */
function StandardTracking({ blocks, options }: { blocks: TrackingBlocksValue; options: TrackingOptions }) {
  const { data, loyalty, onBack } = blocks
  const isCancelled = data.status === 'cancelled'
  const canRing = !data.isTerminal && data.status !== 'ready' && !isCancelled
  return (
    <>
      <TrackingHeader
        storeName={blocks.storeName}
        logoUrl={blocks.logoUrl}
        shortId={blocks.shortId}
        isLive={!data.isTerminal}
        onBack={onBack}
        showLiveBadge={options.show_live_badge}
      />

      <main className="container mx-auto max-w-lg px-4 py-5">
        <div className="space-y-4">
          <StatusHero
            status={data.status}
            currentIndex={blocks.currentIndex}
            customerName={data.customerName}
            placedLabel={blocks.placedLabel}
            orderTypeLabel={data.orderType}
            scheduledLabel={data.scheduledLabel}
            prepPromise={blocks.prepPromise}
          />

          {/* Ready-alert opt-in — audio needs a tap, so it can't be automatic */}
          {canRing && <RingMeButton isArmed={blocks.isAlarmArmed} onArm={blocks.onArmAlarm} />}

          {options.loyalty_position === 'top' && loyalty}

          {blocks.pickup}

          {!isCancelled && options.show_timeline && <StatusTimeline currentIndex={blocks.currentIndex} />}

          <OrderSummaryCard
            items={data.items}
            total={data.total}
            deliveryFee={data.deliveryFee}
            serviceChargeAmount={data.serviceChargeAmount}
          />

          {options.loyalty_position === 'bottom' && loyalty}

          <BackToMenuButton onBack={onBack} />
        </div>
      </main>
    </>
  )
}
