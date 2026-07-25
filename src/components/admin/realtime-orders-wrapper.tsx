'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useRealtimeOrders } from '@/hooks/use-realtime-orders'
import { createTenantOrderRealtimeClient } from '@/lib/supabase/tenant-order-client'
import {
  playNotificationSound,
  showOrderNotification,
  requestNotificationPermission
} from '@/lib/notification-utils'
import { formatPrice } from '@/lib/cart-utils'
import { OrdersList } from '@/components/admin/orders-list'
import type { OrderWithItems } from '@/lib/orders-service'

interface RealtimeOrdersWrapperProps {
  initialOrders: OrderWithItems[]
  tenantSlug: string
  tenantId: string
  /**
   * The tenant's own Supabase project, when their orders live there. Only the
   * URL and anon key cross to the browser — the service-role key stays server
   * side. Omit for tenants on the shared platform database.
   */
  realtimeUrl?: string
  realtimeAnonKey?: string
  pagination?: {
    currentPage: number
    totalPages: number
    totalCount: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

export function RealtimeOrdersWrapper({
  initialOrders,
  tenantSlug,
  tenantId,
  realtimeUrl,
  realtimeAnonKey,
  pagination,
}: RealtimeOrdersWrapperProps) {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders)

  // Sync with server-provided orders on navigation
  useEffect(() => {
    setOrders(initialOrders)
  }, [initialOrders])

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  const handleNewOrder = useCallback((newOrder: Record<string, unknown>) => {
    // Play sound and show notification
    playNotificationSound()
    showOrderNotification({
      id: newOrder.id as string,
      customer_name: newOrder.customer_name as string | undefined,
      total: Number(newOrder.total),
      order_type: newOrder.order_type as string | undefined,
    })

    // Show toast
    const orderId = (newOrder.id as string).slice(0, 8).toUpperCase()
    const customer = (newOrder.customer_name as string) || 'Customer'
    toast.success(`New Order #${orderId}`, {
      description: `${customer} - ${formatPrice(Number(newOrder.total))}`,
      duration: 8000,
    })

    // Refresh the page data to get the full order with items
    router.refresh()
  }, [router])

  const handleOrderUpdate = useCallback((updatedOrder: Record<string, unknown>) => {
    setOrders(prev => prev.map(order => {
      if (order.id === updatedOrder.id) {
        return { ...order, ...updatedOrder } as OrderWithItems
      }
      return order
    }))
  }, [])

  // Built once per credential pair: a new client on every render would tear the
  // channel down and re-subscribe in a loop.
  const tenantClient = useMemo(
    () =>
      realtimeUrl && realtimeAnonKey
        ? createTenantOrderRealtimeClient({
            supabase_order_url: realtimeUrl,
            supabase_order_anon_key: realtimeAnonKey,
          })
        : undefined,
    [realtimeUrl, realtimeAnonKey]
  )

  const { isConnected } = useRealtimeOrders({
    tenantId,
    client: tenantClient,
    onNewOrder: handleNewOrder,
    onOrderUpdate: handleOrderUpdate,
  })

  return (
    <div>
      {/* Live connection indicator */}
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}
        />
        {isConnected ? 'Live updates' : 'Connecting...'}
      </div>

      <OrdersList
        orders={orders}
        tenantSlug={tenantSlug}
        tenantId={tenantId}
        pagination={pagination}
      />
    </div>
  )
}
