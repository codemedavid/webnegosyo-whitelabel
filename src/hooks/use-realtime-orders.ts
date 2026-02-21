'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RealtimeOrder {
  id: string
  tenant_id: string
  customer_name?: string
  customer_contact?: string
  total: number
  status: string
  order_type?: string
  created_at: string
  [key: string]: unknown
}

interface UseRealtimeOrdersOptions {
  tenantId: string
  onNewOrder?: (order: RealtimeOrder) => void
  onOrderUpdate?: (order: RealtimeOrder) => void
  enabled?: boolean
}

export function useRealtimeOrders({
  tenantId,
  onNewOrder,
  onOrderUpdate,
  enabled = true,
}: UseRealtimeOrdersOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient()
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !tenantId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`admin-orders:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          onNewOrder?.(payload.new as RealtimeOrder)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          onOrderUpdate?.(payload.new as RealtimeOrder)
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return cleanup
  }, [tenantId, enabled, onNewOrder, onOrderUpdate, cleanup])

  return { isConnected }
}
