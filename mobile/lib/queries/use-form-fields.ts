import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CustomerFormField } from '@/types/database'

export function useFormFields(orderTypeId: string | undefined) {
  return useQuery<CustomerFormField[]>({
    queryKey: ['form-fields', orderTypeId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('customer_form_fields')
        .select('*')
        .eq('order_type_id', orderTypeId!)
        .order('order_index')

      if (error) throw error
      return data as unknown as CustomerFormField[]
    },
    enabled: !!orderTypeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
