'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { isOrderInScope, type BranchScope } from '@/lib/outlets/branch-scope'

/**
 * Module-scoped so the default is one stable reference. A fresh `{ kind: 'all' }`
 * literal per render would change the effect's identity on every render and
 * tear the channel down and rebuild it each time.
 */
const ALL_BRANCHES: BranchScope = { kind: 'all' }

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
  /**
   * The branch this account may see. Defaults to the whole store, so callers
   * that predate branches keep their existing behaviour.
   *
   * The Postgres `filter` string below can only express one equality and it is
   * already spent on `tenant_id`, so the branch is checked here instead. It
   * matters more than a display filter: the wrapper above this hook chimes and
   * raises a `requireInteraction` notification for every order it is handed.
   */
  scope?: BranchScope
}

export function useRealtimeOrders({
  tenantId,
  client,
  onNewOrder,
  onOrderUpdate,
  enabled = true,
  scope = ALL_BRANCHES,
}: UseRealtimeOrdersOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  // The channel must be removed from the very client it was created on;
  // rebuilding a client here would leave the subscription open forever.
  const clientRef = useRef<SupabaseClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  // Read through a ref inside the handlers so a caller that rebuilds its scope
  // object each render cannot resubscribe the channel — while a genuine branch
  // change still takes effect on the very next event.
  const scopeRef = useRef(scope)
  scopeRef.current = scope

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
          const order = payload.new as RealtimeOrder
          if (!isOrderInScope(scopeRef.current, order)) return
          onNewOrder?.(order)
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
          const order = payload.new as RealtimeOrder
          if (!isOrderInScope(scopeRef.current, order)) return
          onOrderUpdate?.(order)
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
