import { useEffect, useRef } from 'react'
import { useConvex } from 'convex/react'
import { getOrderByIdRef } from '../lib/convex-refs'
import type { Order } from '../../../shared/types'

/**
 * Watches the pending queue and silently prints a receipt once per new order.
 * Already-printed order IDs persist in the main process, so restarts and
 * reconnects don't reprint old orders.
 */
export function useAutoPrint(
  pendingOrders: Order[] | undefined,
  tenantName: string,
  enabled: boolean,
  onPrinted?: (order: Order, ok: boolean, error?: string) => void
): void {
  const convex = useConvex()
  const inFlight = useRef<Set<string>>(new Set())
  const knownPrinted = useRef<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!enabled || !pendingOrders?.length) return

      if (!knownPrinted.current) {
        const ids = await window.api.getPrintedOrderIds()
        if (cancelled) return
        knownPrinted.current = new Set(ids)
      }

      for (const order of pendingOrders) {
        if (knownPrinted.current.has(order._id) || inFlight.current.has(order._id)) continue
        inFlight.current.add(order._id)
        try {
          const full = (await convex.query(getOrderByIdRef, { orderId: order._id })) as Order | null
          if (cancelled || !full) continue
          const result = await window.api.printReceipt(
            { order: full, tenantName },
            { auto: true }
          )
          knownPrinted.current.add(order._id)
          if (!result.skipped) onPrinted?.(full, result.ok, result.error)
        } catch (err) {
          onPrinted?.(order, false, err instanceof Error ? err.message : 'Print failed')
        } finally {
          inFlight.current.delete(order._id)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [pendingOrders, tenantName, enabled, convex, onPrinted])
}
