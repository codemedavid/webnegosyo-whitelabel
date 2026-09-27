'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  const [isConnected, setIsConnected] = useState(false)
  // Scope and callbacks change how events are handled, not which stream we
  // subscribe to. Only publish committed renders to the active subscription.
  const handlersRef = useRef({ scope, onNewOrder, onOrderUpdate })
  useEffect(() => {
    handlersRef.current = { scope, onNewOrder, onOrderUpdate }
  }, [scope, onNewOrder, onOrderUpdate])

  useEffect(() => {
    if (!enabled || !tenantId) return

    const supabase = client ?? createClient()
    let isDisposed = false

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
          if (isDisposed) return
          const order = payload.new as RealtimeOrder
          const { scope, onNewOrder } = handlersRef.current
          if (!isOrderInScope(scope, order)) return
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
          if (isDisposed) return
          const order = payload.new as RealtimeOrder
          const { scope, onOrderUpdate } = handlersRef.current
          if (!isOrderInScope(scope, order)) return
          onOrderUpdate?.(order)
        }
      )
      .subscribe((status) => {
        if (isDisposed) return
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      // Removal is asynchronous; silence this stream before its final events.
      isDisposed = true
      void supabase.removeChannel(channel)
      setIsConnected(false)
    }
  }, [tenantId, client, enabled])

  return { isConnected }
}
