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

export interface OrdersPaginationParams {
  page?: number
  limit?: number
  status?: string
  orderType?: string
  dateFrom?: string
  dateTo?: string
}

export interface PaginatedOrdersResult {
  orders: OrderWithItems[]
  totalCount: number
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export async function getOrdersByTenant(
  tenantId: string,
  params?: OrdersPaginationParams
): Promise<OrderWithItems[] | PaginatedOrdersResult> {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()
  
  // If no pagination params provided, return all orders (legacy behavior)
  if (!params) {
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

  // Pagination logic
  const page = params.page || 1
  const limit = params.limit || 20
  const offset = (page - 1) * limit

  // Build query with filters
  let query = supabase
    .from('orders')
    .select(`
      *,
      order_items(*)
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)

  // Apply filters
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status)
  }

  if (params.orderType && params.orderType !== 'all') {
    query = query.eq('order_type', params.orderType)
  }

  if (params.dateFrom) {
    query = query.gte('created_at', params.dateFrom)
  }

  if (params.dateTo) {
    query = query.lte('created_at', params.dateTo)
  }

  // Apply pagination and ordering
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / limit)

  return {
    orders: data as OrderWithItems[],
    totalCount,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
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

  // Get order first to check if we need to create Lalamove order
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

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

  // If order is being confirmed and has Lalamove quotation but no Lalamove order yet,
  // trigger Lalamove order creation (async, don't wait)
  if (status === 'confirmed' && existingOrder && (existingOrder as Order).lalamove_quotation_id && !(existingOrder as Order).lalamove_order_id) {
    const order = existingOrder as Order
    
    // Extract customer info for Lalamove
    const customerName = order.customer_name || 'Customer'
    const customerContact = order.customer_contact || ''
    const customerData = (order.customer_data as Record<string, unknown>) || {}
    
    // Get delivery address from customer data
    const deliveryAddress = customerData.delivery_address as string
    
    // Get tenant info for sender details
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()
    
    const tenantName = (tenant as { name?: string } | null)?.name || 'Restaurant'
    // Use customer contact as sender phone for now (tenant phone should be added to tenant table)
    const senderPhone = customerContact || ''
    
    // Only create if we have the necessary info
    // Double-check the database to ensure no other process created it while we were processing
    if (order.lalamove_quotation_id && customerContact && deliveryAddress && senderPhone) {
      // Check database one more time before creating (race condition prevention)
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('lalamove_order_id')
        .eq('id', orderId)
        .single()
      
      // If order already has lalamove_order_id, skip creation
      if (currentOrder && (currentOrder as { lalamove_order_id?: string | null }).lalamove_order_id) {
        const existingId = (currentOrder as { lalamove_order_id: string }).lalamove_order_id
        if (existingId && String(existingId).trim() !== '') {
          console.log('Lalamove order already exists, skipping automatic creation')
          return data as Order
        }
      }

      // Trigger Lalamove order creation asynchronously
      import('@/app/actions/lalamove')
        .then(({ createLalamoveOrderAction }) => {
          return createLalamoveOrderAction(
            tenantId,
            orderId,
            order.lalamove_quotation_id!,
            tenantName,
            senderPhone,
            customerName,
            customerContact,
            { orderId, tenantId }
          )
        })
        .then((result) => {
          if (!result.success) {
            console.error('Failed to create Lalamove order:', result.error)
          } else {
            console.log('Lalamove order created successfully via automatic trigger')
          }
        })
        .catch((error) => {
          console.error('Error creating Lalamove order:', error)
        })
    }
  }

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
  },
  orderTypeId?: string,
  customerData?: Record<string, unknown>,
  deliveryFee?: number,
  lalamoveQuotationId?: string,
  paymentMethodId?: string,
  paymentMethodName?: string,
  paymentMethodDetails?: string,
  paymentMethodQrCodeUrl?: string
) {
  const supabase = await createClient()

  const total = items.reduce((sum, item) => sum + item.subtotal, 0)
  const finalTotal = total + (deliveryFee || 0)

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_type_id: orderTypeId || null,
      order_type: orderTypeId ? await getOrderTypeName(orderTypeId) : null,
      customer_name: customerInfo?.name,
      customer_contact: customerInfo?.contact,
      customer_data: customerData || {},
      total: finalTotal,
      delivery_fee: deliveryFee || 0,
      lalamove_quotation_id: lalamoveQuotationId || null,
      payment_method_id: paymentMethodId || null,
      payment_method_name: paymentMethodName || null,
      payment_method_details: paymentMethodDetails || null,
      payment_method_qr_code_url: paymentMethodQrCodeUrl || null,
      payment_status: 'pending',
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

// Helper function to get order type name
async function getOrderTypeName(orderTypeId: string): Promise<string | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('order_types')
    .select('name')
    .eq('id', orderTypeId)
    .single()

  if (error) return null
  return (data as { name?: string } | null)?.name ?? null
}

