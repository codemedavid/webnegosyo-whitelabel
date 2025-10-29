/**
 * Client-side Order Types Service for Customer-facing Components
 */

import { createClient } from '@/lib/supabase/client'
import type { OrderType, CustomerFormField } from '@/types/database'

// ============================================
// Client-side Order Types Operations
// ============================================

export async function getEnabledOrderTypesByTenantClient(tenantId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as OrderType[]
}

export async function getCustomerFormFieldsByOrderTypeClient(orderTypeId: string, tenantId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('customer_form_fields')
    .select('*')
    .eq('order_type_id', orderTypeId)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as CustomerFormField[]
}
