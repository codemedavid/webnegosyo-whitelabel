'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Package, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getStorageKey } from '@/hooks/use-order-tracking'
import type { ActiveOrder } from '@/hooks/use-order-tracking'

interface ActiveOrderBannerProps {
  tenantSlug: string
  primaryColor?: string
  primaryTextColor?: string
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function ActiveOrderBanner({ tenantSlug, primaryColor, primaryTextColor }: ActiveOrderBannerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [latestOrder, setLatestOrder] = useState<ActiveOrder | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Track which orderId was dismissed so re-checks don't undo it
  const dismissedOrderIdRef = useRef<string | null>(null)

  const checkOrders = useCallback(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(tenantSlug))
      if (!raw) {
        setLatestOrder(null)
        return
      }
      const orders: ActiveOrder[] = JSON.parse(raw)
      if (!Array.isArray(orders) || orders.length === 0) {
        setLatestOrder(null)
        return
      }

      const now = Date.now()
      const fresh = orders.filter(o => now - new Date(o.createdAt).getTime() < MAX_AGE_MS)
      if (fresh.length === 0) {
        setLatestOrder(null)
        return
      }

      const newest = fresh[fresh.length - 1]
      setLatestOrder(newest)

      // Only un-dismiss if a different (newer) order appeared
      if (dismissedOrderIdRef.current && newest.orderId !== dismissedOrderIdRef.current) {
        setDismissed(false)
        dismissedOrderIdRef.current = null
      }
    } catch {
      // Ignore parse errors
    }
  }, [tenantSlug])

  useEffect(() => {
    checkOrders()
  }, [checkOrders, pathname])

  useEffect(() => {
    const onFocus = () => checkOrders()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [checkOrders])

  const handleDismiss = useCallback(() => {
    if (latestOrder) {
      dismissedOrderIdRef.current = latestOrder.orderId
    }
    setDismissed(true)
  }, [latestOrder])

  if (!latestOrder) return null

  const trackUrl = `/${tenantSlug}/order/${latestOrder.orderId}?t=${latestOrder.trackingToken}`
  const bgColor = primaryColor || '#2563eb'
  const textColor = primaryTextColor || '#ffffff'

  // Collapsed pill after dismiss — always accessible
  if (dismissed) {
    return (
      <button
        onClick={() => router.push(trackUrl)}
        className="fixed bottom-6 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ backgroundColor: bgColor, color: textColor }}
        aria-label="Track your order"
      >
        <Package className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto">
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-lg"
        style={{ backgroundColor: bgColor, color: textColor }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 flex-shrink-0">
          <Package className="h-4 w-4" />
        </div>
        <p className="flex-1 text-sm font-medium">You have an active order</p>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 rounded-full text-xs font-semibold px-4"
          style={{ backgroundColor: textColor, color: bgColor }}
          onClick={() => router.push(trackUrl)}
        >
          Track
        </Button>
        <button
          onClick={handleDismiss}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
