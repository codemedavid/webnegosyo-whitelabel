'use client'

import { formatDailyOrderNumber } from '@/lib/order-number'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, Bell, BellRing } from 'lucide-react'
import { getStorageKey, updateActiveOrderStatus } from '@/hooks/use-order-tracking'
import type { ActiveOrder } from '@/hooks/use-order-tracking'
import type { TrackingData } from '@/lib/order-tracking-service'
import { isPickupScanEnabled, shouldShowPickupQr } from '@/lib/pickup-qr-gating'
import { PickupQrCard } from '@/components/customer/pickup-qr-card'
import { LoyaltyStampCard } from '@/components/customer/loyalty-stamp-card'
import { TrackingHeader } from '@/components/customer/order-tracking/tracking-header'
import { StatusHero } from '@/components/customer/order-tracking/status-hero'
import { StatusTimeline } from '@/components/customer/order-tracking/status-timeline'
import { OrderSummaryCard } from '@/components/customer/order-tracking/order-summary-card'
import { getStatusIndex } from '@/components/customer/order-tracking/status-steps'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import { decideStampCardView } from '@/lib/loyalty/stamp-card-view'
import { isClaimWindowOpen } from '@/lib/loyalty/claim-window'
import { useOrderStamps, type OrderStampsState } from '@/hooks/use-order-stamps'
import { shouldRingForTransition } from '@/lib/order-ready-alert'
import { describePrepPromise } from '@/lib/prep-time'
import { playNotificationSound, requestNotificationPermission } from '@/lib/notification-utils'
import { formatOrderTrackingTime } from '@/lib/order-tracking-time'

export interface OrderTrackingBrand {
  storeName: string
  logoUrl: string | null
  /** CSS variables from `buildTrackingTheme`, applied on the page root. */
  theme: CSSProperties
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
  // Ready-alert: opt-in (audio needs a user gesture) and rings exactly once,
  // on the transition into `ready` observed by the poll.
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const lastStatusRef = useRef<string>(initialData.status)
  const alertsEnabledRef = useRef(false)

  const handleEnableAlerts = useCallback(async () => {
    setAlertsEnabled(true)
    alertsEnabledRef.current = true
    // Unlock the Web Audio context inside the tap, and ask for notifications.
    try {
      await requestNotificationPermission()
    } catch { /* alerts still ring via audio/vibration */ }
  }, [])

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

  // Poll for status updates
  const fetchStatus = useCallback(async () => {
    if (isTerminalRef.current) return

    try {
      const params = new URLSearchParams({ orderId, token: trackingToken, tenantId })
      const res = await fetch(`/api/orders/track?${params}`)

      if (res.status === 404 || res.status === 429) return
      if (!res.ok) return

      const data: TrackingData = await res.json()

      if (
        alertsEnabledRef.current &&
        shouldRingForTransition(lastStatusRef.current, data.status)
      ) {
        try {
          playNotificationSound()
        } catch { /* ring is best-effort */ }
        try {
          navigator.vibrate?.([200, 100, 200])
        } catch { /* not every device vibrates */ }
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Your order is ready! 🎉', {
              body: `Order #${orderId.slice(0, 8).toUpperCase()} is ready for pickup.`,
            })
          }
        } catch { /* notification is best-effort */ }
      }
      lastStatusRef.current = data.status

      setTrackingData(data)

      // Sync status to localStorage so the banner knows the current stage
      updateActiveOrderStatus(tenantSlug, orderId, data.status)

      if (data.isTerminal) {
        isTerminalRef.current = true
        setTimeout(cleanupLocalStorage, CLEANUP_DELAY_MS)
      }
    } catch {
      // Silently ignore poll failures — we already have data from SSR
    }
  }, [orderId, trackingToken, tenantId, tenantSlug, cleanupLocalStorage])

  useEffect(() => {
    if (isTerminalRef.current) return

    // Poll faster once the customer asked to be rung — the alert is the point.
    const interval = setInterval(fetchStatus, alertsEnabled ? POLL_ALERT_MS : POLL_MS)
    return () => clearInterval(interval)
  }, [fetchStatus, alertsEnabled])

  // The kitchen's promise, counted from the SERVER's clock: a device set
  // twenty minutes fast would otherwise show a nonsense estimate for an order
  // that is perfectly on time. Falls back to the device clock only when an
  // older deployment sends no server time.
  const serverNowMs = trackingData.serverNowMs ?? Date.now()
  const prepPromise = describePrepPromise({
    promisedReadyAt: trackingData.promisedReadyAt,
    status: trackingData.status,
    nowMs: serverNowMs,
    orderTypeKind: trackingData.orderTypeKind,
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
  const { stamps, refresh: refreshStamps } = useOrderStamps({
    orderId,
    tenantId,
    trackingToken,
    enabled: brand.loyaltyOffer !== null,
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
    <div
      className="min-h-screen"
      style={{
        ...brand.theme,
        backgroundColor: 'var(--trk-bg)',
        backgroundImage: 'radial-gradient(120% 60% at 50% -10%, var(--trk-accent-soft), transparent 70%)',
        color: 'var(--trk-text)',
      }}
    >
      <TrackingHeader
        storeName={brand.storeName}
        logoUrl={brand.logoUrl}
        shortId={shortId}
        isLive={!trackingData.isTerminal}
        onBack={goToMenu}
      />

      <main className="container mx-auto max-w-lg px-4 py-5">
        <div className="space-y-4">
          <StatusHero
            status={trackingData.status}
            currentIndex={currentIndex}
            customerName={trackingData.customerName}
            placedLabel={formatOrderTrackingTime(trackingData.createdAt)}
            orderTypeLabel={trackingData.orderType}
            scheduledLabel={trackingData.scheduledLabel}
            prepPromise={prepPromise}
          />

          {/* Ready-alert opt-in — audio needs a tap, so it can't be automatic */}
          {!trackingData.isTerminal && trackingData.status !== 'ready' && !isCancelled && (
            <button
              type="button"
              onClick={handleEnableAlerts}
              disabled={alertsEnabled}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 text-sm font-semibold transition-colors disabled:cursor-default"
              style={
                alertsEnabled
                  ? { borderColor: 'var(--trk-success)', backgroundColor: 'var(--trk-success-soft)', color: 'var(--trk-success)' }
                  : { borderColor: 'var(--trk-accent)', backgroundColor: 'var(--trk-card)', color: 'var(--trk-accent)' }
              }
            >
              {alertsEnabled ? (
                <>
                  <BellRing className="h-4 w-4" aria-hidden="true" />
                  You&apos;ll be alerted when it&apos;s ready
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  Ring me when my order is ready
                </>
              )}
            </button>
          )}

          {/* The store's loyalty card: claim, live balance, or the closed window */}
          {stampView !== 'hidden' && (
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
              onClaimed={refreshStamps}
            />
          )}

          {/* Scan-to-collect code (pickup orders only) */}
          {showPickupQr && (
            <PickupQrCard
              orderId={orderId}
              tenantId={tenantId}
              trackingToken={trackingToken}
              shortId={shortId}
              isReady={trackingData.status === 'ready'}
            />
          )}

          {!isCancelled && <StatusTimeline currentIndex={currentIndex} />}

          <OrderSummaryCard
            items={trackingData.items}
            total={trackingData.total}
            deliveryFee={trackingData.deliveryFee}
            serviceChargeAmount={trackingData.serviceChargeAmount}
          />

          <div className="pb-8 pt-2">
            <button
              type="button"
              onClick={goToMenu}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--trk-text-muted)' }}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              Back to menu
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
