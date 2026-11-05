'use client'

import { useMemo, type ReactNode } from 'react'

import { usePageRuntime, type PageBlockRenderer, type PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { LoyaltyStampCard } from '@/components/customer/loyalty-stamp-card'
import { PickupQrCard } from '@/components/customer/pickup-qr-card'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import { StorefrontLabelsProvider } from '@/components/customer/storefront-labels-provider'
import { TRACKING_LIVE_BLOCKS } from '@/components/page-designer/tracking/live-blocks'
import { TrackingBlocksProvider, type TrackingBlocksValue } from '@/components/page-designer/tracking/tracking-blocks-context'
import {
  PREVIEW_NOW_MS,
  TRACKING_PREVIEW_STATUSES,
  sampleOffer,
  sampleStampCard,
  sampleTrackingData,
  type TrackingPreviewStatus,
} from '@/lib/branding-studio/tracking-preview'
import { getTenantBranding } from '@/lib/branding-utils'
import { formatOrderTrackingTime, ORDER_TRACKING_TIME_ZONE } from '@/lib/order-tracking-time'
import { describePrepPromise } from '@/lib/prep-time'
import { readTrackingStyle } from '@/lib/tracking-style/keys'
import { TrackingOptionsProvider } from '@/components/customer/order-tracking/tracking-options'
import type { TrackingPaint } from '@/components/page-designer/tracking/tracking-blocks-context'

const SAMPLE_ID = 'page-designer-sample'
const SAMPLE_SHORT_ID = '07'
const SAMPLE_WALLETS = { apple: true, google: true } as const
const DEFAULT_STATUS: TrackingPreviewStatus = 'preparing'
const inert = () => undefined

function sampleStatus(state: string | null | undefined): TrackingPreviewStatus {
  return TRACKING_PREVIEW_STATUSES.find((s) => s.id === state)?.id ?? DEFAULT_STATUS
}

/** The Branding Studio's sample order (fixed clock, no network) in the editor's chosen state. */
export function sampleTrackingBlocks(state: string | null | undefined, storeName: string): TrackingBlocksValue {
  const status = sampleStatus(state)
  const data = sampleTrackingData({ status, loyalty: 'collecting', extras: ['pickup'] })
  const offer = sampleOffer(null, 'collecting')
  const isCancelled = status === 'cancelled'
  return {
    storeName,
    logoUrl: null,
    data,
    shortId: SAMPLE_SHORT_ID,
    currentIndex: getStatusIndex(status),
    placedLabel: formatOrderTrackingTime(data.createdAt),
    prepPromise: describePrepPromise({
      promisedReadyAt: data.promisedReadyAt,
      status,
      nowMs: PREVIEW_NOW_MS,
      orderTypeKind: data.orderTypeKind,
      timeZone: ORDER_TRACKING_TIME_ZONE,
    }),
    isAlarmArmed: false,
    onArmAlarm: inert,
    loyalty: isCancelled ? null : (
      <LoyaltyStampCard
        orderId={SAMPLE_ID}
        tenantId={SAMPLE_ID}
        trackingToken={SAMPLE_ID}
        hasName
        offer={offer}
        isOrderComplete={data.isTerminal}
        storeName={storeName}
        view="card"
        card={sampleStampCard(offer, 'collecting')}
        wallets={SAMPLE_WALLETS}
        isSample
      />
    ),
    pickup: isCancelled ? null : (
      <PickupQrCard orderId={SAMPLE_ID} tenantId={SAMPLE_ID} trackingToken={SAMPLE_ID} shortId={SAMPLE_SHORT_ID} isReady={status === 'ready'} />
    ),
    onBack: inert,
  }
}

/** The editor's store row (with the Look tab's unsaved edits) as the page's paint. */
function samplePaint(store: Readonly<Record<string, unknown>> | undefined): TrackingPaint {
  const row = (store as Record<string, unknown> | undefined) ?? null
  return { branding: getTenantBranding(row), style: readTrackingStyle(row) }
}

/** Sample values + the store's wording and look around one block, following the editor's state switcher. */
function SampleTracking({ children }: { children: ReactNode }) {
  const runtime = usePageRuntime()
  const state = runtime?.state
  const storeName = runtime?.tokens.store || 'Your store'
  const store = runtime?.store
  const paint = useMemo(() => samplePaint(store), [store])
  const value = useMemo(() => ({ ...sampleTrackingBlocks(state, storeName), paint }), [state, storeName, paint])
  const labels = runtime?.labels
  const labelSource = useMemo(() => ({ storefront_labels: labels ?? {} }), [labels])
  return (
    <StorefrontLabelsProvider tenant={labelSource}>
      <TrackingOptionsProvider options={paint.style.options}>
        <TrackingBlocksProvider value={value}>{children}</TrackingBlocksProvider>
      </TrackingOptionsProvider>
    </StorefrontLabelsProvider>
  )
}

function asSample(id: string, Live: PageBlockRenderer): PageBlockRenderer {
  function SampleBlock(props: PageBlockRenderProps) {
    return (
      <SampleTracking>
        <Live {...props} />
      </SampleTracking>
    )
  }
  SampleBlock.displayName = `TrackingSample(${id})`
  return SampleBlock
}

/**
 * How each tracking block looks in the Page Designer editor: the live block
 * renderers (the real components) fed the Studio's SAMPLE order, buttons
 * inert. Keyed by block id (src/lib/page-designer/blocks-tracking.ts).
 */
export const TRACKING_SAMPLE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = Object.fromEntries(
  Object.entries(TRACKING_LIVE_BLOCKS).map(([id, Live]) => [id, asSample(id, Live)]),
)
