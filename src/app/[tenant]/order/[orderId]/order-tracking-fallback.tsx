'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrderTrackingClient } from './order-tracking-client'
import { getStorageKey } from '@/hooks/use-order-tracking'
import type { ActiveOrder } from '@/hooks/use-order-tracking'
import type { TrackingData } from '@/lib/order-tracking-service'

interface OrderTrackingFallbackProps {
  orderId: string
  tenantSlug: string
  tenantId: string
}

export function OrderTrackingFallback({ orderId, tenantSlug, tenantId }: OrderTrackingFallbackProps) {
  const router = useRouter()
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const trackingTokenRef = useRef<string | null>(null)

  // Read tracking token from localStorage, then fetch initial data
  const initFetch = useCallback(async () => {
    try {
      const raw = localStorage.getItem(getStorageKey(tenantSlug))
      if (!raw) {
        setError('No tracking data found. This order may have already been completed.')
        setIsLoading(false)
        return
      }
      const orders: ActiveOrder[] = JSON.parse(raw)
      const match = orders.find(o => o.orderId === orderId)
      if (!match) {
        setError('No tracking data found. This order may have already been completed.')
        setIsLoading(false)
        return
      }
      trackingTokenRef.current = match.trackingToken

      // Fetch initial data
      const params = new URLSearchParams({ orderId, token: match.trackingToken, tenantId })
      const res = await fetch(`/api/orders/track?${params}`)

      if (res.status === 404) {
        // Order may not be saved yet (fire-and-forget checkout). Retry via polling.
        // Show loading for now — the client component will handle polling once mounted.
        setError('Order is still being processed. Please wait...')
        setIsLoading(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to load order')
      }

      const data: TrackingData = await res.json()
      setTrackingData(data)
      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsLoading(false)
    }
  }, [orderId, tenantSlug, tenantId])

  useEffect(() => {
    initFetch()
  }, [initFetch])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/30 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Checking your order...</p>
        </div>
      </div>
    )
  }

  if (error || !trackingData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <XCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Order Not Found</h1>
          <p className="text-gray-500 mb-6">{error || 'Could not load order data.'}</p>
          <Button
            onClick={() => router.push(`/${tenantSlug}/menu`)}
            className="rounded-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Menu
          </Button>
        </div>
      </div>
    )
  }

  // Once data is loaded, hand off to the main client component for polling
  return (
    <OrderTrackingClient
      orderId={orderId}
      tenantSlug={tenantSlug}
      tenantId={tenantId}
      trackingToken={trackingTokenRef.current!}
      initialData={trackingData}
    />
  )
}
