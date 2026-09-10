import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { TENANT_SLUG } from '@/lib/constants'
import type { Tenant } from '@/types/database'

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ['tenant', TENANT_SLUG],
    queryFn: async () => {
      // `is_active` is not cosmetic: the anon INSERT policy orders_insert_customer
      // requires tenants.is_active = true. Without this filter (the web app has
      // always had it — src/lib/tenant.ts) a deactivated merchant's branded app
      // kept serving menu and checkout while RLS refused every order with 42501.
      const { data, error } = await supabase()
        .from('tenants')
        .select('*')
        .eq('slug', TENANT_SLUG)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      // Same shape as a slug that never existed, which app/index.tsx already
      // renders as "Unable to load store" with a Retry.
      if (!data) throw new Error('Store not found or no longer active')
      return data as unknown as Tenant
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
