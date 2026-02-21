import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod } from '@/types/database'

export function usePaymentMethods(tenantId: string | undefined, orderTypeId?: string) {
  return useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', tenantId, orderTypeId],
    queryFn: async () => {
      let query = supabase()
        .from('payment_methods')
        .select('*, payment_method_order_types!inner(order_type_id)')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)

      if (orderTypeId) {
        query = query.eq('payment_method_order_types.order_type_id', orderTypeId)
      }

      const { data, error } = await query
      if (error) throw error
      return data as unknown as PaymentMethod[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
