'use client'

import { formatDailyOrderNumber } from '@/lib/order-number'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { getStorageKey, updateActiveOrderStatus } from '@/hooks/use-order-tracking'
import type { ActiveOrder } from '@/hooks/use-order-tracking'
import type { TrackingData } from '@/lib/order-tracking-service'
import { isPickupScanEnabled, shouldShowPickupQr } from '@/lib/pickup-qr-gating'
import { PickupQrCard } from '@/components/customer/pickup-qr-card'
import { LoyaltyStampCard } from '@/components/customer/loyalty-stamp-card'
import { TrackingDashboard } from '@/components/customer/order-tracking/tracking-dashboard'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import { decideStampCardView } from '@/lib/loyalty/stamp-card-view'
import { isClaimWindowOpen } from '@/lib/loyalty/claim-window'
import { useOrderStamps, type OrderStampsState } from '@/hooks/use-order-stamps'
import { buildReadyNotice, shouldRingForTransition, type ReadyNotice } from '@/lib/order-ready-alert'
import { describePrepPromise } from '@/lib/prep-time'
import { useReadyAlarm } from '@/hooks/use-ready-alarm'
import type { TrackingOptions } from '@/lib/tracking-style/keys'
import { formatOrderTrackingTime, ORDER_TRACKING_TIME_ZONE } from '@/lib/order-tracking-time'
import { useVisibilityPoll } from '@/hooks/use-visibility-poll'

export interface OrderTrackingBrand {
  storeName: string
  logoUrl: string | null
  /** CSS variables from `buildTrackingTheme`, applied on the page root. */
  theme: CSSProperties
  /** The owner's layout choices (Branding Studio → Order status / Loyalty card). */
  options: TrackingOptions
  /** The store's own wording (`tenants.storefront_labels`). */
  storefrontLabels: unknown
  /** The store's live loyalty offer, or null when no stamp may be promised. */
  loyaltyOffer: LoyaltyOffer | null
}

interface OrderTrackingClientProps {
  orderId: string
  tenantSlug: string
  tenantId: string
  trackingToken: string
  initialData: TrackingData
  initialStamps?: OrderStampsState | null
  brand: OrderTrackingBrand
}

const POLL_MS = 10000
const POLL_ALERT_MS = 5000
const CLEANUP_DELAY_MS = 3000

export function OrderTrackingClient({
  orderId,
  tenantSlug,
  tenantId,
  trackingToken,
  initialData,
  initialStamps,
  brand,
}: OrderTrackingClientProps) {
  const router = useRouter()
  const [trackingData, setTrackingData] = useState<TrackingData>(initialData)
  const isTerminalRef = useRef(initialData.isTerminal)
  // Ready-alert: opt-in (audio needs a user gesture), armed by the tap, and
  // rung once — on the transition into `ready` observed by the poll — until
  // the customer acknowledges it.
  const { isArmed: isAlarmArmed, arm: armAlarm, ring: ringAlarm, stop: stopAlarm } = useReadyAlarm()
  const [readyNotice, setReadyNotice] = useState<ReadyNotice | null>(null)
  const lastStatusRef = useRef<string>(initialData.status)

  const acknowledgeReady = useCallback(() => {
    stopAlarm()
    setReadyNotice(null)
  }, [stopAlarm])

  // Remove from localStorage when terminal
  const cleanupLocalStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(tenantSlug))
      if (raw) {
        const orders = JSON.parse(raw) as ActiveOrder[]
        const filtered = orders.filter(o => o.orderId !== orderId)
        if (filtered.length === 0) {
          localStorage.removeItem(getStorageKey(tenantSlug))
        } else {
          localStorage.setItem(getStorageKey(tenantSlug), JSON.stringify(filtered))
        }
      }
    } catch { /* ignore */ }
  }, [tenantSlug, orderId])

  // Sync initial status to localStorage
  useEffect(() => {
    updateActiveOrderStatus(tenantSlug, orderId, initialData.status)
    if (initialData.isTerminal) {
      setTimeout(cleanupLocalStorage, CLEANUP_DELAY_MS)
    }
  }, [initialData.isTerminal, initialData.status, tenantSlug, orderId, cleanupLocalStorage])

  // Poll for status updates. Resolves false on any failure (404, 429, 5xx,
  // network) so the poller backs off; we already have data from SSR.
  const fetchStatus = useCallback(async (): Promise<boolean> => {
    if (isTerminalRef.current) return true

    try {
      const params = new URLSearchParams({ orderId, token: trackingToken, tenantId })
      const res = await fetch(`/api/orders/track?${params}`)

      if (!res.ok) return false

      const data: TrackingData = await res.json()

      if (isAlarmArmed && shouldRingForTransition(lastStatusRef.current, data.status)) {
        const notice = buildReadyNotice({
          shortId: formatDailyOrderNumber(data.dailyNumber, orderId).replace(/^#/, ''),
          storeName: brand.storeName,
          kind: data.orderTypeKind,
        })
        setReadyNotice(notice)
        ringAlarm({
          ...notice,
          url: window.location.href,
          tag: `order-ready-${orderId}`,
          icon: brand.logoUrl,
        })
      }
      lastStatusRef.current = data.status

      setTrackingData(data)

      // Sync status to localStorage so the banner knows the current stage
      updateActiveOrderStatus(tenantSlug, orderId, data.status)

      if (data.isTerminal) {
        isTerminalRef.current = true
        setTimeout(cleanupLocalStorage, CLEANUP_DELAY_MS)
      }
      return true
    } catch {
      // Network failure — the poller backs off; the page keeps its last data.
      return false
    }
  }, [orderId, trackingToken, tenantId, tenantSlug, cleanupLocalStorage, isAlarmArmed, ringAlarm, brand.storeName, brand.logoUrl])

  // Poll faster once the customer asked to be rung — the alert is the point —
  // and keep polling while they switch apps (the browser throttles it, but
  // they still get rung). Otherwise paused while hidden, refreshing the moment
  // the page is shown again. Stopped once the order reaches a final state.
  useVisibilityPoll(fetchStatus, {
    baseMs: isAlarmArmed ? POLL_ALERT_MS : POLL_MS,
    isEnabled: !trackingData.isTerminal,
    isPollingWhileHidden: isAlarmArmed,
  })

  // A finished or cancelled order needs no alarm (and no awake screen).
  useEffect(() => {
    if (trackingData.isTerminal) stopAlarm()
  }, [trackingData.isTerminal, stopAlarm])

  // The device clock is adopted only AFTER mount. Reading `Date.now()` during
  // render would diverge between the server HTML and hydration, which is a
  // hydration error on the customer's tracking page.
  const [deviceNowMs, setDeviceNowMs] = useState<number | null>(null)
  useEffect(() => {
    setDeviceNowMs(Date.now())
  }, [])

  // The kitchen's promise, counted from the SERVER's clock: a device set
  // twenty minutes fast would otherwise show a nonsense estimate for an order
  // that is perfectly on time. Falls back to the device clock only when an
  // older deployment sends no server time.
  const nowMs = trackingData.serverNowMs ?? deviceNowMs
  const prepPromise = nowMs === null ? null : describePrepPromise({
    promisedReadyAt: trackingData.promisedReadyAt,
    status: trackingData.status,
    nowMs,
    orderTypeKind: trackingData.orderTypeKind,
    // Pinned, never the runtime default: the server renders in UTC and the
    // phone renders in Manila, so an unpinned clock prints two different
    // times for the same instant — server HTML then never matches hydration.
    timeZone: ORDER_TRACKING_TIME_ZONE,
  })

  const currentIndex = getStatusIndex(trackingData.status)
  const isCancelled = trackingData.status === 'cancelled'
  const shortId = formatDailyOrderNumber(trackingData.dailyNumber, orderId).replace(/^#/, '')
  const hasRealName = Boolean(trackingData.customerName && trackingData.customerName.toLowerCase() !== 'walk-in')
  const showPickupQr = shouldShowPickupQr({
    kind: trackingData.orderTypeKind ?? null,
    status: trackingData.status,
    isScanEnabled: isPickupScanEnabled(trackingData.pickupScanEnabled),
  })
  const goToMenu = () => router.push(`/${tenantSlug}/menu`)

  // The stamp itself usually lands after the claim — when the merchant
  // completes the order — so the card is painted from a live read, not from
  // the claim's own reply. Re-read on every status change.
  const { stamps, refresh: refreshStamps, error: stampError } = useOrderStamps({
    orderId,
    tenantId,
    trackingToken,
    enabled: brand.loyaltyOffer !== null || Boolean(initialStamps?.card),
    status: trackingData.status,
    initialStamps,
  })

  const hasContact = trackingData.hasContact === true || stamps?.hasContact === true
  const stampView = decideStampCardView({
    hasOffer: brand.loyaltyOffer !== null,
    hasContact,
    isClaimOpen: isClaimWindowOpen(trackingData.status),
    hasCard: Boolean(stamps?.card),
    isCancelled,
  })

  return (
    <TrackingDashboard
      storeName={brand.storeName}
      logoUrl={brand.logoUrl}
      theme={brand.theme}
      options={brand.options}
      storefrontLabels={brand.storefrontLabels}
      data={trackingData}
      shortId={shortId}
      currentIndex={currentIndex}
      placedLabel={formatOrderTrackingTime(trackingData.createdAt)}
      prepPromise={prepPromise}
      isAlarmArmed={isAlarmArmed}
      onArmAlarm={armAlarm}
      loyaltyNotice={stampError && !isCancelled ? (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm" style={{ color: 'var(--trk-text-muted)', borderColor: 'var(--trk-card-border)' }}>
          <p>{stampError}</p>
          <button type="button" className="shrink-0 font-semibold underline" onClick={refreshStamps}>Try again</button>
        </div>
      ) : null}
      loyalty={stampView !== 'hidden' ? (
        <LoyaltyStampCard
          tenantSlug={tenantSlug}
          orderId={orderId}
          tenantId={tenantId}
          trackingToken={trackingToken}
          hasName={hasRealName}
          offer={brand.loyaltyOffer}
          isOrderComplete={trackingData.isTerminal}
          storeName={brand.storeName}
          logoUrl={brand.logoUrl}
          view={stampView}
          card={stamps?.card ?? null}
          wallets={stamps?.wallets ?? null}
          onClaimed={refreshStamps}
        />
      ) : null}
      pickup={showPickupQr ? (
        <PickupQrCard
          orderId={orderId}
          tenantId={tenantId}
          trackingToken={trackingToken}
          shortId={shortId}
          isReady={trackingData.status === 'ready'}
        />
      ) : null}
      readyNotice={readyNotice}
      onAcknowledgeReady={acknowledgeReady}
      onBack={goToMenu}
    />
  )
}
