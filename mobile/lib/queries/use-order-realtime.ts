import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types/database'

export function useOrderRealtime(orderId: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return

    // Initial fetch
    const fetchOrder = async () => {
      const { data, error } = await supabase()
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (!error && data) {
        setOrder(data as unknown as Order)
      }
      setIsLoading(false)
    }

    fetchOrder()

    // Realtime subscription
    const channel = supabase()
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(payload.new as unknown as Order)
        }
      )
      .subscribe()

    return () => {
      supabase().removeChannel(channel)
    }
  }, [orderId])

  return { order, isLoading }
}
