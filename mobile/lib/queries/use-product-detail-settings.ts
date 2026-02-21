import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

export function useProductDetailSettings(tenantId: string | undefined) {
  return useQuery<ProductDetailSettings | null>({
    queryKey: ['product-detail-settings', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('product_detail_settings')
        .select('*')
        .eq('tenant_id', tenantId!)
        .maybeSingle()

      if (error) {
        console.error('Error fetching product detail settings:', error)
        return null
      }

      return data as unknown as ProductDetailSettings | null
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
