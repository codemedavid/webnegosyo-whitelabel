'use client'

/**
 * The tracking page's blocks for a published Page Designer design: the same
 * components the standard page renders, fed from TrackingBlocksContext and
 * worded by the block's text slots. Each block's design and colours
 * (blocks-tracking.ts options) only change how it looks: the data, the
 * alarm and the pickup code are the standard page's. Keyed by block id
 * (src/lib/page-designer/blocks-tracking.ts).
 */

import { cloneElement, isValidElement, useMemo, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { PageBlockRenderer, PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { BackToMenuButton, type BackButtonLook } from '@/components/customer/order-tracking/back-to-menu-button'
import { OrderSummaryCard, type OrderSummaryLayout } from '@/components/customer/order-tracking/order-summary-card'
import { RingMeButton } from '@/components/customer/order-tracking/ring-me-button'
import { StatusHero } from '@/components/customer/order-tracking/status-hero'
import { StatusTimeline, type StatusTimelineLayout } from '@/components/customer/order-tracking/status-timeline'
import { TrackingHeader, type TrackingHeaderLayout } from '@/components/customer/order-tracking/tracking-header'
import { blockTrackingLook, FOLLOW_PAGE } from '@/lib/page-designer/tracking-colors'
import type { TrackingOptions } from '@/lib/tracking-style/keys'
import { BlockLook } from './block-look'
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

/** A choice option as one of `values` (the registry's first value when the stored one is unknown). */
function pick<T extends string>(option: PageBlockRenderProps['option'], key: string, values: readonly T[]): T {
  const value = option(key)
  return values.find((v) => v === value) ?? values[0]
}

const isOn = (option: PageBlockRenderProps['option'], key: string) => option(key) !== false

/** The block's look (colours, corners + `choices`), memoised on the block's options. */
function useLook(option: PageBlockRenderProps['option'], choices: Partial<TrackingOptions> = {}) {
  const key = JSON.stringify(choices)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `choices` (a fresh object each render)
  return useMemo(() => blockTrackingLook(option, choices), [option, key])
}

const HEADER_LAYOUTS: readonly TrackingHeaderLayout[] = ['standard', 'centered', 'compact']

function HeaderBlock({ text, option, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option)
  if (!b) return null
  return (
    <BlockLook look={look}>
      <TrackingHeader
        storeName={b.storeName}
        logoUrl={b.logoUrl}
        shortId={b.shortId}
        isLive={!b.data.isTerminal}
        onBack={b.onBack}
        showLiveBadge={isOn(option, 'show_live_badge')}
        orderLabel={text('order_label')}
        liveLabel={text('live')}
        isSticky={!isEditor}
        layout={pick(option, 'variant', HEADER_LAYOUTS)}
        showLogo={isOn(option, 'show_logo')}
        showStoreName={isOn(option, 'show_store_name')}
        showOrderNumber={isOn(option, 'show_order_number')}
      />
    </BlockLook>
  )
}

const STATUS_DESIGNS = [FOLLOW_PAGE, 'gradient', 'solid', 'soft', 'outline', 'minimal'] as const

/** The banner style a status design stands for (`page` = the Look tab's; minimal = an outlined card). */
function heroStyleOf(design: (typeof STATUS_DESIGNS)[number]): TrackingOptions['hero_style'] | undefined {
  if (design === FOLLOW_PAGE) return undefined
  return design === 'minimal' ? 'outline' : design
}

function StatusBlock({ text, option }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const design = pick(option, 'variant', STATUS_DESIGNS)
  const heroStyle = heroStyleOf(design)
  const look = useLook(option, heroStyle ? { hero_style: heroStyle } : {})
  if (!b) return null
  const greeting = hasRealCustomerName(b.data.customerName) ? text('greeting') : text('greeting_guest')
  return (
    <BlockLook look={look}>
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
        look={{
          layout: design === 'minimal' ? 'compact' : 'banner',
          isCentered: option('align') === 'center',
          showGreeting: isOn(option, 'show_greeting'),
          showPlaced: isOn(option, 'show_placed'),
          showDecor: isOn(option, 'show_decor'),
          showProgress: isOn(option, 'show_progress'),
          showReadyTime: isOn(option, 'show_ready_time'),
        }}
      />
    </BlockLook>
  )
}

function RingMeBlock({ text, option, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option)
  if (!b) return null
  const canRing = !b.data.isTerminal && b.data.status !== 'ready' && b.data.status !== 'cancelled'
  if (!canRing) return <NotNow isEditor={isEditor}>“Ring me” shows while the order is being made.</NotNow>
  return (
    <BlockLook look={look}>
      <RingMeButton
        isArmed={b.isAlarmArmed}
        onArm={b.onArmAlarm}
        wording={{ label: text('label'), armed: text('armed'), armedHint: text('armed_hint') }}
        layout={pick(option, 'variant', ['button', 'card'] as const)}
        showHint={isOn(option, 'show_helper')}
      />
    </BlockLook>
  )
}

function LoyaltyBlock({ option, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option, {
    band_style: option('variant') as TrackingOptions['band_style'],
    stamp_shape: option('stamp_shape') as TrackingOptions['stamp_shape'],
    stamp_fill: option('stamp_fill') as TrackingOptions['stamp_fill'],
  })
  if (!b) return null
  if (!b.loyalty) return <NotNow isEditor={isEditor}>Your loyalty card shows here when you run a loyalty program.</NotNow>
  return (
    <BlockLook look={look}>
      <div className="space-y-4">{b.loyalty}</div>
    </BlockLook>
  )
}

/** A plain pickup code: the card's own fill and edge cleared, the code on its white plate as always. */
const PLAIN_PICKUP: CSSProperties = {
  '--trk-pickup-bg': 'transparent',
  '--trk-pickup-border': 'transparent',
  '--trk-pickup-ready-bg': 'transparent',
} as CSSProperties

/** The switches the pickup card (PickupQrCard) reads. */
interface PickupShow {
  showTitle?: boolean
  showHelper?: boolean
}

/**
 * The page's pickup card with the block's switches. The page builds the card
 * (it holds the order's token), so the switches are handed to it here; with
 * both on the page's own card is returned untouched.
 */
function withPickupShow(pickup: ReactNode, show: Required<PickupShow>): ReactNode {
  if (show.showTitle && show.showHelper) return pickup
  return isValidElement(pickup) ? cloneElement(pickup as ReactElement<PickupShow>, show) : pickup
}

function PickupQrBlock({ option, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option)
  if (!b) return null
  if (!b.pickup) return <NotNow isEditor={isEditor}>The pickup code shows on pickup orders.</NotNow>
  const isPlain = pick(option, 'variant', ['card', 'plain'] as const) === 'plain'
  return (
    <BlockLook look={look} vars={isPlain ? PLAIN_PICKUP : undefined} className={isPlain ? '[&_section]:shadow-none' : undefined}>
      {withPickupShow(b.pickup, { showTitle: isOn(option, 'show_title'), showHelper: isOn(option, 'show_helper') })}
    </BlockLook>
  )
}

const TIMELINE_LAYOUTS: readonly StatusTimelineLayout[] = ['list', 'steps', 'compact']

function TimelineBlock({ text, option, isEditor }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option)
  if (!b) return null
  if (b.data.status === 'cancelled') return <NotNow isEditor={isEditor}>The timeline is hidden on cancelled orders.</NotNow>
  return (
    <BlockLook look={look}>
      <StatusTimeline
        currentIndex={b.currentIndex}
        title={text('title')}
        layout={pick(option, 'variant', TIMELINE_LAYOUTS)}
        showTitle={isOn(option, 'show_title')}
        showDetails={isOn(option, 'show_details')}
      />
    </BlockLook>
  )
}

const SUMMARY_LAYOUTS: readonly OrderSummaryLayout[] = ['standard', 'receipt', 'compact']

function SummaryBlock({ text, option }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option)
  if (!b) return null
  return (
    <BlockLook look={look}>
      <OrderSummaryCard
        items={b.data.items}
        total={b.data.total}
        deliveryFee={b.data.deliveryFee}
        serviceChargeAmount={b.data.serviceChargeAmount}
        wording={{ title: text('title'), deliveryFee: text('delivery_fee'), serviceCharge: text('service_charge'), total: text('total') }}
        layout={pick(option, 'variant', SUMMARY_LAYOUTS)}
        show={{ title: isOn(option, 'show_title'), addons: isOn(option, 'show_addons'), fees: isOn(option, 'show_fees') }}
      />
    </BlockLook>
  )
}

const BACK_LOOKS: readonly BackButtonLook[] = ['quiet', 'outline', 'solid']

function BackBlock({ text, option }: PageBlockRenderProps) {
  const b = useTrackingBlocks()
  const look = useLook(option)
  if (!b) return null
  return (
    <BlockLook look={look}>
      <BackToMenuButton onBack={b.onBack} label={text('label')} look={pick(option, 'variant', BACK_LOOKS)} />
    </BlockLook>
  )
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
