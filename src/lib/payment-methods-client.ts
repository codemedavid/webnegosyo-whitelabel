/**
 * Client-side Payment Methods Service for Customer-facing Components
 */

import { createClient } from '@/lib/supabase/client'
import type { PaymentMethod } from '@/types/database'

// ============================================
// Client-side Payment Methods Operations
// ============================================

export async function getPaymentMethodsByOrderTypeClient(orderTypeId: string, tenantId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('payment_methods')
    .select(`
      *,
      payment_method_order_types!inner(order_type_id)
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('payment_method_order_types.order_type_id', orderTypeId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as PaymentMethod[]
}

export async function getActivePaymentMethodsClient(tenantId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as PaymentMethod[]
}

