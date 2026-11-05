'use client'

/**
 * The tracking page's blocks for a published Page Designer design: the same
 * components the standard page renders, fed from TrackingBlocksContext and
 * worded by the block's text slots. Keyed by block id
 * (src/lib/page-designer/blocks-tracking.ts).
 */

import type { ReactNode } from 'react'
import type { PageBlockRenderer, PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { BackToMenuButton } from '@/components/customer/order-tracking/back-to-menu-button'
import { OrderSummaryCard } from '@/components/customer/order-tracking/order-summary-card'
import { RingMeButton } from '@/components/customer/order-tracking/ring-me-button'
import { StatusHero } from '@/components/customer/order-tracking/status-hero'
import { StatusTimeline } from '@/components/customer/order-tracking/status-timeline'
import { TrackingHeader } from '@/components/customer/order-tracking/tracking-header'
import { hasRealCustomerName } from './tracking-runtime'
import { useTrackingBlocks } from './tracking-blocks-context'

/** In the editor a block that doesn't apply right now says so instead of vanishing. */
function NotNow({ isEditor, children }: { isEditor: boolean; children: ReactNode }) {
  if (!isEditor) return null
  return (
    <p className="rounded-xl border border-dashed px-4 py-3 text-center text-xs" style={{ color: 'var(--trk-text-faint)', borderColor: 'var(--trk-card-border)' }}>
      {children}
    </p>
  )
}

function HeaderBlock({ text, option, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  return (
    <TrackingHeader
      storeName={b.storeName}
      logoUrl={b.logoUrl}
      shortId={b.shortId}
      isLive={!b.data.isTerminal}
      onBack={b.onBack}
      showLiveBadge={option('show_live_badge') !== false}
      orderLabel={text('order_label')}
      liveLabel={text('live')}
      isSticky={!isEditor}
    />
  )
}

function StatusBlock({ text }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  const greeting = hasRealCustomerName(b.data.customerName) ? text('greeting') : text('greeting_guest')
  return (
    <StatusHero
      status={b.data.status}
      currentIndex={b.currentIndex}
      customerName={b.data.customerName}
      placedLabel={b.placedLabel}
      orderTypeLabel={b.data.orderType}
      scheduledLabel={b.data.scheduledLabel}
      prepPromise={b.prepPromise}
      wording={{
        greeting,
        placed: text('placed'),
        scheduled: text('scheduled'),
        cancelledHeadline: text('cancelled_headline'),
        cancelledDetail: text('cancelled_detail'),
      }}
    />
  )
}

function RingMeBlock({ text, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  const canRing = !b.data.isTerminal && b.data.status !== 'ready' && b.data.status !== 'cancelled'
  if (!canRing) return <NotNow isEditor={isEditor}>“Ring me” shows while the order is being made.</NotNow>
  return (
    <RingMeButton
      isArmed={b.isAlarmArmed}
      onArm={b.onArmAlarm}
      wording={{ label: text('label'), armed: text('armed'), armedHint: text('armed_hint') }}
    />
  )
}

function LoyaltyBlock({ isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  if (!b.loyalty) return <NotNow isEditor={isEditor}>Your loyalty card shows here when you run a loyalty program.</NotNow>
  return <div className="space-y-4">{b.loyalty}</div>
}

function PickupQrBlock({ isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  if (!b.pickup) return <NotNow isEditor={isEditor}>The pickup code shows on pickup orders.</NotNow>
  return <>{b.pickup}</>
}

function TimelineBlock({ text, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  if (b.data.status === 'cancelled') return <NotNow isEditor={isEditor}>The timeline is hidden on cancelled orders.</NotNow>
  return <StatusTimeline currentIndex={b.currentIndex} title={text('title')} />
}

function SummaryBlock({ text }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  return (
    <OrderSummaryCard
      items={b.data.items}
      total={b.data.total}
      deliveryFee={b.data.deliveryFee}
      serviceChargeAmount={b.data.serviceChargeAmount}
      wording={{ title: text('title'), deliveryFee: text('delivery_fee'), serviceCharge: text('service_charge'), total: text('total') }}
    />
  )
}

function BackBlock({ text }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  if (!b) return null
  return <BackToMenuButton onBack={b.onBack} label={text('label')} />
}

export const TRACKING_LIVE_BLOCKS: Readonly<Record<string, PageBlockRenderer>> = {
  'tracking.header': HeaderBlock,
  'tracking.status': StatusBlock,
  'tracking.ring_me': RingMeBlock,
  'tracking.loyalty': LoyaltyBlock,
  'tracking.pickup_qr': PickupQrBlock,
  'tracking.timeline': TimelineBlock,
  'tracking.summary': SummaryBlock,
  'tracking.back': BackBlock,
}
