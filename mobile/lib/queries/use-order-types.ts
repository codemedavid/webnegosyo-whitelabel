import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { OrderType } from '@/types/database'

export function useOrderTypes(tenantId: string | undefined) {
  return useQuery<OrderType[]>({
    queryKey: ['order-types', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('order_types')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('is_enabled', true)
        .order('order_index')

      if (error) throw error
      return data as unknown as OrderType[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
