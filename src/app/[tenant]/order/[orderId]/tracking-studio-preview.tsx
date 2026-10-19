'use client'

/**
 * The order-tracking page with a sample order, for the Branding Studio's
 * "Order status" and "Loyalty card" screens only (the page renders it for
 * `/order/studio-preview?brandingPreview=1`). It is the real dashboard and the
 * real loyalty card, painted from the owner's unpublished draft; the "Show"
 * bar picks the order's status, the card's face and the extras.
 */

import { useEffect, useMemo, useState } from 'react'
import { BrandingInspector } from '@/components/customer/branding-inspector'
import { LoyaltyStampCard } from '@/components/customer/loyalty-stamp-card'
import { PickupQrCard } from '@/components/customer/pickup-qr-card'
import { TrackingDashboard } from '@/components/customer/order-tracking/tracking-dashboard'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import { useBrandingPreviewDraft, useBrandingPreviewTenant } from '@/hooks/use-branding-preview'
import { getTenantBranding } from '@/lib/branding-utils'
import { readTrackingStyle } from '@/lib/tracking-style/keys'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { TrackingData } from '@/lib/order-tracking-service'
import { buildReadyNotice } from '@/lib/order-ready-alert'
import { describePrepPromise } from '@/lib/prep-time'
import { formatOrderTrackingTime, ORDER_TRACKING_TIME_ZONE } from '@/lib/order-tracking-time'
import {
  TRACKING_PREVIEW_KEY,
  TRACKING_PREVIEW_ORDER_ID,
  parseTrackingPreview,
  sampleOffer,
  sampleStampCard,
  sampleStampView,
  sampleTrackingData,
} from '@/lib/branding-studio/tracking-preview'

const SAMPLE_WALLETS = { apple: true, google: true } as const
const SAMPLE_TOKEN = 'studio-preview'
const SAMPLE_SHORT_ID = '07'

interface TrackingStudioPreviewProps {
  /** The store's storefront columns (branding, labels, tracking look). */
  tenant: Record<string, unknown>
  tenantSlug: string
  tenantId: string
  storeName: string
  /** The store's live loyalty offer; null = a sample card. */
  loyaltyOffer: LoyaltyOffer | null
  items: TrackingData['items']
}

export function TrackingStudioPreview({ tenant, tenantSlug, tenantId, storeName, loyaltyOffer, items }: TrackingStudioPreviewProps) {
  const previewTenant = useBrandingPreviewTenant(tenant)
  const draft = useBrandingPreviewDraft()
  const state = parseTrackingPreview(draft?.[TRACKING_PREVIEW_KEY])
  // Tapping "Ring me" or "Got it" in Try-it mode answers until the Show bar changes.
  const [armedTaps, setArmedTaps] = useState<string | null>(null)
  const [dismissedAlert, setDismissedAlert] = useState<string | null>(null)
  const stateKey = JSON.stringify(state)
  const isLoyaltyScreen = draft?.__previewSurface === 'loyalty'

  const branding = useMemo(() => getTenantBranding(previewTenant), [previewTenant])
  const trackingStyle = useMemo(() => readTrackingStyle(previewTenant), [previewTenant])
  const theme = useMemo(() => buildTrackingTheme(branding, trackingStyle), [branding, trackingStyle])
  const loyaltyPosition = trackingStyle.options.loyalty_position

  // On the Loyalty card screen the card is what's being edited: bring it into
  // view, again whenever it changes face or the owner moves it.
  useEffect(() => {
    if (!isLoyaltyScreen) return
    document.querySelector('[data-testid="loyalty-stamp-card"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [isLoyaltyScreen, state.loyalty, loyaltyPosition])

  const data = sampleTrackingData(state, items)
  const offer = sampleOffer(loyaltyOffer, state.loyalty)
  const view = sampleStampView(state.loyalty)
  const currentIndex = getStatusIndex(data.status)
  const isAlertShown = state.extras.includes('alert') && dismissedAlert !== stateKey
  const isArmed = state.extras.includes('armed') || armedTaps === stateKey
  const prepPromise = describePrepPromise({
    promisedReadyAt: data.promisedReadyAt,
    status: data.status,
    nowMs: data.serverNowMs ?? 0,
    orderTypeKind: data.orderTypeKind,
    timeZone: ORDER_TRACKING_TIME_ZONE,
  })

  return (
    <>
      <TrackingDashboard
        storeName={storeName}
        logoUrl={branding.logoUrl}
        theme={theme}
        options={trackingStyle.options}
        storefrontLabels={previewTenant.storefront_labels ?? null}
        data={data}
        shortId={SAMPLE_SHORT_ID}
        currentIndex={currentIndex}
        placedLabel={formatOrderTrackingTime(data.createdAt)}
        prepPromise={prepPromise}
        isAlarmArmed={isArmed}
        onArmAlarm={() => setArmedTaps(stateKey)}
        loyalty={view ? (
          <LoyaltyStampCard
            key={`${state.loyalty}-${state.status}`}
            tenantSlug={tenantSlug}
            orderId={TRACKING_PREVIEW_ORDER_ID}
            tenantId={tenantId}
            trackingToken={SAMPLE_TOKEN}
            hasName
            offer={offer}
            isOrderComplete={data.isTerminal}
            storeName={storeName}
            logoUrl={branding.logoUrl}
            view={view}
            card={sampleStampCard(offer, state.loyalty)}
            wallets={SAMPLE_WALLETS}
          />
        ) : null}
        pickup={state.extras.includes('pickup') && data.status !== 'cancelled' ? (
          <PickupQrCard
            orderId={TRACKING_PREVIEW_ORDER_ID}
            tenantId={tenantId}
            trackingToken={SAMPLE_TOKEN}
            shortId={SAMPLE_SHORT_ID}
            isReady={data.status === 'ready'}
          />
        ) : null}
        readyNotice={isAlertShown ? buildReadyNotice({ shortId: SAMPLE_SHORT_ID, storeName, kind: data.orderTypeKind }) : null}
        onAcknowledgeReady={() => setDismissedAlert(stateKey)}
        onBack={() => undefined}
      />
      <BrandingInspector />
    </>
  )
}
