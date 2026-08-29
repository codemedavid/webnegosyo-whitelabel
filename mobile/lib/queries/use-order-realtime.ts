import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types/database'

// How often the status screen re-asks the platform for the order. The anon
// role has no SELECT policy on orders, so a realtime channel would never
// deliver an event — polling the RPC is the only read path that exists.
const ORDER_POLL_INTERVAL_MS = 10_000

export function useOrderRealtime(orderId: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return

    let isActive = true

    // Reads go through the SECURITY DEFINER RPC get_customer_order: the
    // order's uuid is the capability, and anon stays blind to the table.
    const fetchOrder = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase generic DB types resolve to never due to index signature on Tenant (same cast as checkout's table calls)
      const { data, error } = await (supabase().rpc as any)('get_customer_order', {
        p_order_id: orderId,
      })

      if (!isActive) return
      const row = Array.isArray(data) ? data[0] : data
      if (!error && row) {
        setOrder(row as unknown as Order)
      }
      setIsLoading(false)
    }

    fetchOrder()
    const intervalId = setInterval(fetchOrder, ORDER_POLL_INTERVAL_MS)

    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [orderId])

  return { order, isLoading }
}
