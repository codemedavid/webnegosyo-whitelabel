import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types/database'

export function useCategories(tenantId: string | undefined) {
  return useQuery<Category[]>({
    queryKey: ['categories', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('categories')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('order')

      if (error) throw error
      return data as unknown as Category[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
