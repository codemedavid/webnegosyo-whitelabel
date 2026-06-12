import { supabase } from './supabase'
import type { Category, MenuItem, OrderType, PaymentMethod } from './menu-types'

// Plain async fetchers for the POS register. These mirror the mobile customer
// app's react-query hooks (mobile/lib/queries/*) but return raw promises since
// the desktop app uses zustand + direct awaits rather than react-query.

export async function fetchCategories(tenantId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('order')

  if (error) throw error
  return (data ?? []) as unknown as Category[]
}

export async function fetchMenuItems(tenantId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .order('order')

  if (error) throw error
  return (data ?? []) as unknown as MenuItem[]
}

export async function fetchOrderTypes(tenantId: string): Promise<OrderType[]> {
  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('order_index')

  if (error) throw error
  return (data ?? []) as unknown as OrderType[]
}

export async function fetchPaymentMethods(
  tenantId: string,
  orderTypeId?: string
): Promise<PaymentMethod[]> {
  let query = supabase
    .from('payment_methods')
    .select('*, payment_method_order_types!inner(order_type_id)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('order_index')

  if (orderTypeId) {
    query = query.eq('payment_method_order_types.order_type_id', orderTypeId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as PaymentMethod[]
}
