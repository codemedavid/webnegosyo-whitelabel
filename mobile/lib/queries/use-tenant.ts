import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { TENANT_SLUG } from '@/lib/constants'
import type { Tenant } from '@/types/database'

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ['tenant', TENANT_SLUG],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('tenants')
        .select('*')
        .eq('slug', TENANT_SLUG)
        .single()

      if (error) throw error
      return data as unknown as Tenant
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
