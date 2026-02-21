import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MenuItem } from '@/types/database'

export function useMenuItems(tenantId: string | undefined) {
  return useQuery<MenuItem[]>({
    queryKey: ['menu-items', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('menu_items')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('is_available', true)
        .order('order')

      if (error) throw error
      return data as unknown as MenuItem[]
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useMenuItem(itemId: string | undefined) {
  return useQuery<MenuItem>({
    queryKey: ['menu-item', itemId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('menu_items')
        .select('*')
        .eq('id', itemId!)
        .single()

      if (error) throw error
      return data as unknown as MenuItem
    },
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
