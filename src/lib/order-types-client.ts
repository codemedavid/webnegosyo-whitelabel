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
    .eq('available_on_web', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as unknown as OrderType[]
}

/**
 * Every enabled order type, on whichever channel it runs.
 *
 * The admin payment-method editor reads this rather than the storefront's
 * web-filtered list: it links methods to order types, so a register-only
 * channel such as Grab is precisely the row the merchant came to attach a
 * method to. Filtering it out here left those channels with no payment method
 * at all, and hid links the merchant had already made from the list's badges.
 * Mirrors `listOrderTypes` in the merchant app's pos-catalog.
 */
export async function getLinkableOrderTypesByTenantClient(tenantId: string) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as unknown as OrderType[]
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
  return data as unknown as CustomerFormField[]
}
