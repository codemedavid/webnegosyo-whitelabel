'use server'

import { revalidatePath } from 'next/cache'
import {
  getOrdersByTenant,
  getOrderById,
  updateOrderStatus,
  getOrderStats,
  createOrder,
  createOrderConvex,
} from '@/lib/orders-service'
import { createAdminClient } from '@/lib/supabase/admin'

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
    isUpsellItem?: boolean
    isBundleItem?: boolean
    bundleId?: string
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
    // Check if tenant has Convex configured
    const supabaseAdmin = createAdminClient()
    const { data: tenantConfigData } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, convex_deploy_key, admin_email, email_notifications_enabled, name, slug')
      .eq('id', tenantId)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantConfig = tenantConfigData as Record<string, any> | null

    // PostHog email notification - awaited to ensure flush completes
    const firePostHogNotification = async (orderId: string, orderItems: typeof items) => {
      if (tenantConfig?.email_notifications_enabled && tenantConfig?.admin_email) {
        try {
          const { captureOrderCreated } = await import('@/lib/posthog')
          await captureOrderCreated({
            tenantId,
            tenantName: tenantConfig.name ?? '',
            tenantSlug: tenantConfig.slug ?? '',
            adminEmail: tenantConfig.admin_email,
            orderId,
            customerName: customerInfo?.name,
            customerContact: customerInfo?.contact,
            items: orderItems.map(i => ({
              name: i.menu_item_name,
              quantity: i.quantity,
              variation: i.variation ?? null,
              addons: i.addons,
              subtotal: i.subtotal,
            })),
            orderTotal: orderItems.reduce((sum, i) => sum + i.subtotal, 0) + (deliveryFee ?? 0),
            deliveryFee: deliveryFee ?? 0,
            orderType: null,
            paymentMethod: paymentMethodName ?? null,
            deliveryAddress: (customerData?.address as string) ?? null,
          })
        } catch (err) {
          console.error('[PostHog] Email notification failed:', err)
        }
      }
    }

    if (tenantConfig?.convex_deployment_url && tenantConfig?.convex_deploy_key) {
      // Route to Convex
      const result = await createOrderConvex(
        tenantConfig.convex_deployment_url,
        tenantConfig.convex_deploy_key,
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
      await firePostHogNotification(result.order.id, items)
      return { success: true, data: result.order, orderToken: result.orderToken }
    }

    // Otherwise, continue with existing Supabase flow
    const result = await createOrder(
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
    // Return both order and token for secure public API access
    await firePostHogNotification(result.order.id, items)
    return { success: true, data: result.order, orderToken: result.orderToken }
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

