'use server'

import { revalidatePath } from 'next/cache'
import {
  getOrdersByTenant,
  getOrderById,
  updateOrderStatus,
  getOrderStats,
  createOrder,
} from '@/lib/orders-service'

export async function getOrdersAction(tenantId: string) {
  try {
    const orders = await getOrdersByTenant(tenantId)
    return { success: true, data: orders }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch orders' }
  }
}

export async function getOrderAction(orderId: string, tenantId: string) {
  try {
    const order = await getOrderById(orderId, tenantId)
    return { success: true, data: order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order' }
  }
}

export async function updateOrderStatusAction(
  orderId: string,
  tenantId: string,
  tenantSlug: string,
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
) {
  try {
    const order = await updateOrderStatus(orderId, tenantId, status)
    revalidatePath(`/${tenantSlug}/admin/orders`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update order status' }
  }
}

export async function getOrderStatsAction(tenantId: string) {
  try {
    const stats = await getOrderStats(tenantId)
    return { success: true, data: stats }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch order stats' }
  }
}

export async function createOrderAction(
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
  try {
    const order = await createOrder(
      tenantId, 
      items, 
      customerInfo, 
      orderTypeId, 
      customerData, 
      deliveryFee, 
      lalamoveQuotationId,
      paymentMethodId,
      paymentMethodName,
      paymentMethodDetails,
      paymentMethodQrCodeUrl
    )
    return { success: true, data: order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create order' }
  }
}

export async function updatePaymentStatusAction(
  orderId: string,
  tenantId: string,
  tenantSlug: string,
  paymentStatus: 'pending' | 'paid' | 'failed' | 'verified'
) {
  try {
    const supabase = await (await import('@/lib/supabase/server')).createClient()
    
    // Verify admin access
    const { verifyTenantAdmin } = await import('@/lib/admin-service')
    await verifyTenantAdmin(tenantId)

    const query = supabase
      .from('orders')
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Database types need regeneration for payment_status field
      .update({ payment_status: paymentStatus })
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select()
      .single()
    
    const { data, error } = await query

    if (error) throw error

    revalidatePath(`/${tenantSlug}/admin/orders`)
    revalidatePath(`/${tenantSlug}/admin`)
    
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update payment status' }
  }
}

