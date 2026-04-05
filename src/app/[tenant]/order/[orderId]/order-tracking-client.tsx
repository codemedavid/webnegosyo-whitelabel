'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import { ArrowLeft, Clock, CheckCircle2, ChefHat, Package, Truck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/cart-utils'
import { getStorageKey } from '@/hooks/use-order-tracking'
import type { ActiveOrder } from '@/hooks/use-order-tracking'
import type { TrackingData } from '@/lib/order-tracking-service'

interface OrderTrackingClientProps {
  orderId: string
  tenantSlug: string
  tenantId: string
  trackingToken: string
  initialData: TrackingData
}

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Received', icon: Clock, description: 'Waiting for confirmation' },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2, description: 'Restaurant accepted your order' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, description: 'Your food is being prepared' },
  { key: 'ready', label: 'Ready', icon: Package, description: 'Ready for pickup/delivery' },
  { key: 'delivered', label: 'Delivered', icon: Truck, description: 'Order complete!' },
]

function getStatusIndex(status: string): number {
  return STATUS_STEPS.findIndex(s => s.key === status)
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function OrderTrackingClient({
  orderId,
  tenantSlug,
  tenantId,
  trackingToken,
  initialData,
}: OrderTrackingClientProps) {
  const router = useRouter()
  const [trackingData, setTrackingData] = useState<TrackingData>(initialData)
  const isTerminalRef = useRef(initialData.isTerminal)

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

  // If initial data is already terminal, clean up localStorage
  useEffect(() => {
    if (initialData.isTerminal) {
      setTimeout(cleanupLocalStorage, 3000)
    }
  }, [initialData.isTerminal, cleanupLocalStorage])

  // Poll for status updates
  const fetchStatus = useCallback(async () => {
    if (isTerminalRef.current) return

    try {
      const params = new URLSearchParams({ orderId, token: trackingToken, tenantId })
      const res = await fetch(`/api/orders/track?${params}`)

      if (res.status === 404 || res.status === 429) return
      if (!res.ok) return

      const data: TrackingData = await res.json()
      setTrackingData(data)

      if (data.isTerminal) {
        isTerminalRef.current = true
        setTimeout(cleanupLocalStorage, 3000)
      }
    } catch {
      // Silently ignore poll failures — we already have data from SSR
    }
  }, [orderId, trackingToken, tenantId, cleanupLocalStorage])

  useEffect(() => {
    if (isTerminalRef.current) return

    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const currentIndex = getStatusIndex(trackingData.status)
  const isCancelled = trackingData.status === 'cancelled'
  const shortId = orderId.slice(0, 8).toUpperCase()

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-blue-200/30">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/${tenantSlug}/menu`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Order Status</h1>
            <p className="text-xs text-gray-500">#{shortId}</p>
          </div>
          {!trackingData.isTerminal && (
            <Badge variant="outline" className="text-blue-600 border-blue-200 animate-pulse motion-reduce:animate-none">
              Live
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <div className="space-y-6">

          {/* Order Info */}
          <div className="text-center">
            {trackingData.customerName && (
              <p className="text-sm text-gray-500 mb-1">Hi, {trackingData.customerName}!</p>
            )}
            <p className="text-xs text-gray-400">
              Placed {formatTime(trackingData.createdAt)}
              {trackingData.orderType && ` \u00b7 ${trackingData.orderType}`}
            </p>
          </div>

          {/* Status Stepper */}
          <Card>
            <CardContent className="p-6" aria-live="polite">
              {isCancelled ? (
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                    <XCircle className="h-8 w-8 text-red-600" />
                  </div>
                  <h2 className="text-lg font-bold text-red-700">Order Cancelled</h2>
                  <p className="text-sm text-gray-500 mt-1">This order has been cancelled.</p>
                </div>
              ) : (
                <div className="relative">
                  {STATUS_STEPS.map((step, index) => {
                    const isCompleted = index < currentIndex
                    const isCurrent = index === currentIndex
                    const isPending = index > currentIndex
                    const Icon = step.icon
                    const isLast = index === STATUS_STEPS.length - 1

                    return (
                      <div key={step.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`
                              flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-500
                              ${isCompleted ? 'bg-green-500 border-green-500 text-white' : ''}
                              ${isCurrent ? 'bg-blue-500 border-blue-500 text-white animate-pulse motion-reduce:animate-none' : ''}
                              ${isPending ? 'bg-white border-gray-200 text-gray-300' : ''}
                            `}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          {!isLast && (
                            <div
                              className={`
                                w-0.5 h-12 transition-all duration-500
                                ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}
                              `}
                            />
                          )}
                        </div>

                        <div className={`pt-2 pb-6 ${isPending ? 'opacity-40' : ''}`}>
                          <p className={`font-semibold text-sm ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-400'}`}>
                            {step.label}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Order Summary</h2>
              <div className="space-y-2">
                {trackingData.items.map((item, index) => (
                  <div key={index}>
                    {index > 0 && <Separator className="my-2" />}
                    <div className="flex justify-between text-sm">
                      <div className="flex-1 mr-3">
                        <span className="font-medium">{item.name}</span>
                        {item.variation && (
                          <span className="text-xs text-gray-500"> ({item.variation})</span>
                        )}
                        <span className="text-xs text-gray-500"> x{item.quantity}</span>
                        {item.addons && item.addons.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            + {item.addons.join(', ')}
                          </p>
                        )}
                      </div>
                      <span className="font-medium flex-shrink-0">{formatPrice(item.subtotal)}</span>
                    </div>
                  </div>
                ))}

                <Separator className="my-2" />

                {trackingData.deliveryFee != null && trackingData.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Delivery Fee</span>
                    <span>{formatPrice(trackingData.deliveryFee)}</span>
                  </div>
                )}

                {trackingData.serviceChargeAmount != null && trackingData.serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service Charge</span>
                    <span>{formatPrice(trackingData.serviceChargeAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-base font-bold pt-1">
                  <span>Total</span>
                  <span className="text-green-700">{formatPrice(trackingData.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="pb-8">
            <Button
              size="lg"
              variant="ghost"
              className="w-full h-12 rounded-full text-gray-600 hover:text-gray-900"
              onClick={() => router.push(`/${tenantSlug}/menu`)}
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Menu
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
