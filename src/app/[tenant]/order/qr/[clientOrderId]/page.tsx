'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Clock, CheckCircle2, ChefHat, Package, Truck, X, ShieldQuestion, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/cart-utils'
import { getOrderScheduledLabel } from '@/lib/advance-order-utils'
import { getTenantBySlugClient } from '@/lib/tenants-client'
import { getTenantBranding, generateBrandingCSS, setAlpha } from '@/lib/branding-utils'
import {
  getPendingOrderByCid,
  updatePendingStatus,
  clearPendingOrder,
  type PendingOrderRecord,
} from '@/lib/qr-pending-order'
import { QR_SIZE_WARN_THRESHOLD } from '@/lib/qr-order-codec'
import type { Tenant } from '@/types/database'

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Received', icon: Clock, description: 'Waiting for confirmation' },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2, description: 'Vendor accepted your order' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, description: 'Your food is being prepared' },
  { key: 'ready', label: 'Ready', icon: Package, description: 'Ready for pickup/delivery' },
  { key: 'delivered', label: 'Delivered', icon: Truck, description: 'Order complete!' },
] as const

function getStatusIndex(status: string): number {
  return STATUS_STEPS.findIndex(s => s.key === status)
}

const POLL_INTERVAL_MS = 5000

export default function QrOrderPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = params.tenant as string
  const clientOrderId = params.clientOrderId as string

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [record, setRecord] = useState<PendingOrderRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load pending order from localStorage + tenant branding
  useEffect(() => {
    const stored = getPendingOrderByCid(tenantSlug, clientOrderId)
    setRecord(stored)
    if (stored && stored.lastStatus && stored.lastStatus !== 'pending') {
      setConfirmed(true)
      setLiveStatus(stored.lastStatus)
    }

    let cancelled = false
    getTenantBySlugClient(tenantSlug)
      .then(({ data }) => {
        if (!cancelled && data) setTenant(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [tenantSlug, clientOrderId])

  // Warn (do not block) if the QR string is too long to scan reliably
  useEffect(() => {
    if (record && record.qrString.length > QR_SIZE_WARN_THRESHOLD) {
      console.warn(
        `[QrOrderPage] QR string length ${record.qrString.length} exceeds warning threshold ${QR_SIZE_WARN_THRESHOLD}; QR may be hard to scan.`
      )
    }
  }, [record])

  // Poll the tracking API every 5s until a terminal status
  useEffect(() => {
    if (!record) return

    const isTerminal = (s: string | null) => s === 'delivered' || s === 'cancelled'
    if (isTerminal(liveStatus)) return

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/orders/track-by-client?cid=${encodeURIComponent(clientOrderId)}&tenant=${encodeURIComponent(tenantSlug)}`
        )
        if (!res.ok) return
        const data = await res.json()
        if (data.found && typeof data.status === 'string') {
          setConfirmed(true)
          setLiveStatus(data.status)
          updatePendingStatus(tenantSlug, clientOrderId, data.status)
          if (isTerminal(data.status) && pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      } catch {
        // Silently ignore — keep polling on next tick
      }
    }

    // Immediate poll, then interval
    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [record, clientOrderId, tenantSlug, liveStatus])

  const branding = useMemo(() => getTenantBranding(tenant as Record<string, unknown> | null), [tenant])
  const brandingStyle = useMemo(() => generateBrandingCSS(branding), [branding])

  const handleDismiss = () => {
    clearPendingOrder(tenantSlug, clientOrderId)
    router.push(`/${tenantSlug}/menu`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your order...</p>
        </div>
      </div>
    )
  }

  // Pending order not found in localStorage (e.g. cleared, different device)
  if (!record) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <ShieldQuestion className="h-14 w-14 text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Order not found</h1>
        <p className="text-gray-500 max-w-md mb-6">
          We couldn&apos;t find this order on this device. It may have been dismissed, or you may be on a different device than where you placed it.
        </p>
        <Button
          onClick={() => router.push(`/${tenantSlug}/menu`)}
          style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
          className="rounded-full h-12 px-8"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Back to Menu
        </Button>
      </div>
    )
  }

  const { payload, qrString } = record
  const currentIndex = liveStatus ? getStatusIndex(liveStatus) : -1
  const isCancelled = liveStatus === 'cancelled'

  return (
    <div className="min-h-screen flex flex-col bg-white" style={brandingStyle}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <button
          onClick={() => router.push(`/${tenantSlug}/menu`)}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Back to menu"
          type="button"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <span className="text-sm font-medium" style={{ color: branding.textSecondary }}>
          {tenant?.name ?? ''}
        </span>
        <button
          onClick={handleDismiss}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Dismiss order"
          type="button"
        >
          <X className="h-5 w-5 text-gray-700" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-md px-4 py-6 space-y-6">
          {/* Title */}
          <div className="text-center pt-2">
            <h1 className="text-2xl font-bold" style={{ color: branding.textPrimary }}>
              {confirmed ? 'Order Confirmed!' : 'Almost there!'}
            </h1>
            <p className="mt-1 text-sm" style={{ color: branding.textSecondary }}>
              {confirmed
                ? 'The vendor has received your order.'
                : 'Your order isn’t confirmed yet.'}
            </p>
          </div>

          {/* QR + pending message (hide QR once confirmed) */}
          {!confirmed ? (
            <div
              className="rounded-2xl border p-6 flex flex-col items-center text-center"
              style={{ borderColor: branding.border, backgroundColor: branding.cards }}
            >
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <QRCodeSVG value={qrString} size={232} level="M" marginSize={2} />
              </div>
              <p className="mt-5 text-base font-semibold" style={{ color: branding.textPrimary }}>
                Show this QR to the vendor to confirm your order
              </p>
              <p className="mt-2 text-sm" style={{ color: branding.textSecondary }}>
                It isn&apos;t confirmed until they scan it. Keep this screen open until the vendor accepts.
              </p>
              <div
                className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: setAlpha(branding.warning, 0.13), color: branding.warning }}
              >
                <Clock className="h-3.5 w-3.5" />
                Waiting for vendor to scan
              </div>
            </div>
          ) : (
            /* Live status tracker */
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: branding.border, backgroundColor: branding.cards }}
            >
              {isCancelled ? (
                <div className="text-center py-4">
                  <X className="h-12 w-12 mx-auto mb-3" style={{ color: branding.error }} />
                  <p className="text-lg font-semibold" style={{ color: branding.textPrimary }}>
                    Order Cancelled
                  </p>
                  <p className="text-sm mt-1" style={{ color: branding.textSecondary }}>
                    This order has been cancelled.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {STATUS_STEPS.map((step, index) => {
                    const isDone = currentIndex >= index
                    const isActive = currentIndex === index
                    const StepIcon = step.icon
                    return (
                      <div key={step.key} className="flex items-start gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
                          style={{
                            backgroundColor: isDone ? branding.success : branding.buttonSecondary,
                            color: isDone ? '#ffffff' : branding.textMuted,
                          }}
                        >
                          <StepIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 pt-0.5">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: isDone ? branding.textPrimary : branding.textMuted }}
                          >
                            {step.label}
                            {isActive && (
                              <span
                                className="ml-2 inline-block h-2 w-2 rounded-full animate-pulse align-middle"
                                style={{ backgroundColor: branding.success }}
                              />
                            )}
                          </p>
                          <p className="text-xs" style={{ color: branding.textSecondary }}>
                            {step.description}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Order summary */}
          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: branding.border, backgroundColor: branding.cards }}
          >
            <h2 className="text-base font-bold mb-1" style={{ color: branding.textPrimary }}>
              Order Summary
            </h2>
            {payload.orderType && (
              <p className="text-xs mb-3" style={{ color: branding.textSecondary }}>
                {payload.orderType}
              </p>
            )}
            {(() => {
              const scheduledLabel = getOrderScheduledLabel({
                scheduled_for: payload.scheduledFor ?? null,
                customer_data: payload.customerData,
              })
              return scheduledLabel ? (
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Scheduled for {scheduledLabel}
                </div>
              ) : null
            })()}
            <div className="space-y-3">
              {payload.items.map((item, index) => (
                <div key={`${item.menuItemId}-${index}`}>
                  {index > 0 && <Separator className="my-3" />}
                  <div className="flex justify-between">
                    <div className="flex-1 mr-4">
                      <span className="text-sm font-medium" style={{ color: branding.textPrimary }}>
                        {item.menuItemName}
                      </span>
                      {item.variation && (
                        <span className="text-xs" style={{ color: branding.textSecondary }}>
                          {' '}({item.variation})
                        </span>
                      )}
                      <span className="text-xs" style={{ color: branding.textSecondary }}> x{item.quantity}</span>
                      {item.addons && item.addons.length > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: branding.textSecondary }}>
                          Add-ons: {item.addons.map(a => a.name).join(', ')}
                        </p>
                      )}
                      {item.specialInstructions && (
                        <p className="text-xs italic mt-0.5" style={{ color: branding.textSecondary }}>
                          Note: {item.specialInstructions}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold shrink-0" style={{ color: branding.cardPrice }}>
                      {formatPrice(item.subtotal)}
                    </span>
                  </div>
                </div>
              ))}

              <Separator className="my-2" />

              <div className="flex justify-between text-base font-bold">
                <span style={{ color: branding.textPrimary }}>Total</span>
                <span style={{ color: branding.cardPrice }}>{formatPrice(payload.total)}</span>
              </div>
            </div>
          </div>

          {payload.customerName && (
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: branding.border, backgroundColor: branding.cards }}
            >
              <h2 className="text-base font-bold mb-2" style={{ color: branding.textPrimary }}>
                Your Details
              </h2>
              <p className="text-sm" style={{ color: branding.textPrimary }}>{payload.customerName}</p>
              {payload.customerContact && (
                <p className="text-sm" style={{ color: branding.textSecondary }}>{payload.customerContact}</p>
              )}
              {payload.paymentMethod && (
                <p className="text-sm mt-2" style={{ color: branding.textSecondary }}>
                  Payment: <span style={{ color: branding.textPrimary }}>{payload.paymentMethod}</span>
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pb-8">
            <Button
              onClick={() => router.push(`/${tenantSlug}/menu`)}
              className="w-full h-12 rounded-full font-semibold"
              style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Menu
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="w-full h-11 rounded-full"
              style={{ color: branding.textMuted }}
            >
              Dismiss this order
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
