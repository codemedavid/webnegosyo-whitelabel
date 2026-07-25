'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

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
  /**
   * The project holding this tenant's orders. Omit for tenants on the shared
   * platform database; pass a client built from the tenant's own Supabase
   * credentials when `order_backend = 'supabase'`, otherwise the queue
   * subscribes to a project that will never receive their orders.
   */
  client?: SupabaseClient
  onNewOrder?: (order: RealtimeOrder) => void
  onOrderUpdate?: (order: RealtimeOrder) => void
  enabled?: boolean
}

export function useRealtimeOrders({
  tenantId,
  client,
  onNewOrder,
  onOrderUpdate,
  enabled = true,
}: UseRealtimeOrdersOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  // The channel must be removed from the very client it was created on;
  // rebuilding a client here would leave the subscription open forever.
  const clientRef = useRef<SupabaseClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const cleanup = useCallback(() => {
    if (channelRef.current && clientRef.current) {
      clientRef.current.removeChannel(channelRef.current)
      channelRef.current = null
      clientRef.current = null
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !tenantId) return

    const supabase = client ?? createClient()
    clientRef.current = supabase

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
  }, [tenantId, client, enabled, onNewOrder, onOrderUpdate, cleanup])

  return { isConnected }
}
