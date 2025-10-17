/**
 * Orders service for tenant admin operations
 */

import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { Order } from '@/types/database'

export interface OrderWithItems extends Order {
  order_items: Array<{
    id: string
    menu_item_name: string
    variation: string | null
    addons: string[]
    quantity: number
    price: number
    subtotal: number
    special_instructions: string | null
  }>
}

// ============================================
// Orders Operations
// ============================================

export async function getOrdersByTenant(tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as OrderWithItems[]
}

export async function getOrderById(orderId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*)
    `)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as OrderWithItems
}

export async function updateOrderStatus(
  orderId: string, 
  tenantId: string, 
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  const query = supabase
    .from('orders')
    // @ts-expect-error - Supabase type inference issue with update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status } as any)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as Order
}

export async function getOrderStats(tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()
  
  // Get today's orders
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('status, total, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', today.toISOString())

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersData = orders as any[] || []

  const stats = {
    todayOrders: ordersData.length || 0,
    todayRevenue: ordersData.reduce((sum, order) => sum + Number(order.total), 0) || 0,
    pendingOrders: ordersData.filter(o => o.status === 'pending').length || 0,
    confirmedOrders: ordersData.filter(o => o.status === 'confirmed').length || 0,
    preparingOrders: ordersData.filter(o => o.status === 'preparing').length || 0,
    readyOrders: ordersData.filter(o => o.status === 'ready').length || 0,
  }

  return stats
}

// ============================================
// Customer Order Creation (Public)
// ============================================

export async function createOrder(
  tenantId: string,
  items: Array<{
    menu_item_id: string
    menu_item_name: string
    variation?: string
    addons: string[]
    quantity: number
    price: number
    subtotal: number
    special_instructions?: string
  }>,
  customerInfo?: {
    name?: string
    contact?: string
  }
) {
  const supabase = await createClient()

  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      customer_name: customerInfo?.name,
      customer_contact: customerInfo?.contact,
      total,
      status: 'pending',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (orderError) throw orderError

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderData = order as any

  // Create order items
  const orderItems = items.map(item => ({
    order_id: orderData.id,
    menu_item_id: item.menu_item_id,
    menu_item_name: item.menu_item_name,
    variation: item.variation,
    addons: item.addons,
    quantity: item.quantity,
    price: item.price,
    subtotal: item.subtotal,
    special_instructions: item.special_instructions,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(orderItems as any)

  if (itemsError) throw itemsError

  return orderData as Order
}

