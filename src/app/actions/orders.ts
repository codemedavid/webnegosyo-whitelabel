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
import { generateTrackingToken } from '@/lib/tracking-token'

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
    bundleName?: string
    slotName?: string
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
  paymentMethodQrCodeUrl?: string,
  serviceChargeAmount?: number
) {
  try {
    // Basic input sanity checks before hitting the database
    if (!tenantId || typeof tenantId !== 'string') {
      return { success: false, error: 'Invalid tenant ID' }
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Order must contain at least one item' }
    }

    // Check if tenant has Convex configured AND that the tenant is active.
    // Using is_active check prevents order creation for deactivated tenants.
    const supabaseAdmin = createAdminClient()
    const { data: tenantConfigData } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, convex_deploy_key, admin_email, email_notifications_enabled, name, slug, is_active')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantConfig = tenantConfigData as Record<string, any> | null

    if (!tenantConfig) {
      return { success: false, error: 'Restaurant not found or is currently inactive' }
    }

    // PostHog email notification - awaited to ensure flush completes
    const firePostHogNotification = async (orderId: string, orderItems: typeof items) => {
      if (tenantConfig?.email_notifications_enabled && tenantConfig?.admin_email) {
        try {
          const { captureOrderCreated } = await import('@/lib/posthog')
          // Resolve order type name from ID
          let orderTypeName: string | null = null
          if (orderTypeId) {
            const { data: otData } = await supabaseAdmin
              .from('order_types')
              .select('name')
              .eq('id', orderTypeId)
              .single()
            orderTypeName = (otData as { name: string } | null)?.name ?? null
          }

          await captureOrderCreated({
            tenantId,
            tenantName: tenantConfig.name ?? '',
            tenantSlug: tenantConfig.slug ?? '',
            adminEmail: tenantConfig.admin_email,
            orderId,
            items: orderItems.map(i => ({
              name: i.menu_item_name,
              quantity: i.quantity,
              variation: i.variation ?? null,
              addons: i.addons,
              subtotal: i.subtotal,
            })),
            orderTotal: orderItems.reduce((sum, i) => sum + i.subtotal, 0) + (deliveryFee ?? 0) + (serviceChargeAmount ?? 0),
            deliveryFee: deliveryFee ?? 0,
            orderType: orderTypeName,
            paymentMethod: paymentMethodName ?? null,
            customerData: customerData ?? null,
          })
        } catch (err) {
          console.error('[PostHog] Email notification failed:', err)
        }
      }
    }

    // SERVER-SIDE PRICE VALIDATION (runs before BOTH Supabase and Convex paths)
    const menuItemIds = [...new Set(items.map(i => i.menu_item_id))]
    const { data: dbItems, error: priceCheckError } = await supabaseAdmin
      .from('menu_items')
      .select('id, price, name')
      .eq('tenant_id', tenantId)
      .in('id', menuItemIds)

    if (priceCheckError) {
      return { success: false, error: 'Failed to verify item prices' }
    }

    const priceMap = new Map((dbItems || []).map((i: { id: string; price: number }) => [i.id, i.price]))
    const MAX_QUANTITY = 99
    const MAX_PRICE = 1_000_000

    for (const item of items) {
      const dbPrice = priceMap.get(item.menu_item_id)
      if (dbPrice === undefined) {
        return { success: false, error: `Menu item not found: ${item.menu_item_name}` }
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
        return { success: false, error: `Invalid quantity for ${item.menu_item_name}` }
      }
      // Ensure price is at least the DB base price (variations can add to it)
      if (item.price < dbPrice - 0.01) {
        item.price = dbPrice
      }
      if (item.price > MAX_PRICE) {
        return { success: false, error: `Price exceeds maximum for ${item.menu_item_name}` }
      }
      // Enforce subtotal = price × quantity
      const expectedSubtotal = Math.round(item.price * item.quantity * 100) / 100
      const submittedSubtotal = Math.round(item.subtotal * 100) / 100
      if (Math.abs(submittedSubtotal - expectedSubtotal) > 0.02) {
        item.subtotal = expectedSubtotal
      }
    }

    if (tenantConfig?.convex_deployment_url && tenantConfig?.convex_deploy_key) {
      // Route to Convex (prices already validated above)
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
        paymentMethodQrCodeUrl,
        serviceChargeAmount
      )
      await firePostHogNotification(result.order.id, items)
      let trackingToken: string | undefined
      try { trackingToken = generateTrackingToken(result.order.id) } catch { /* API_SECRET may be missing */ }
      return { success: true, data: result.order, orderToken: result.orderToken, trackingToken }
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
      paymentMethodQrCodeUrl,
      serviceChargeAmount
    )
    // Return both order and token for secure public API access
    await firePostHogNotification(result.order.id, items)
    let trackingToken: string | undefined
    try { trackingToken = generateTrackingToken(result.order.id) } catch { /* API_SECRET may be missing */ }
    return { success: true, data: result.order, orderToken: result.orderToken, trackingToken }
  } catch (error) {
    console.error('[createOrderAction] Order creation failed:', error)
    return { success: false, error: 'Failed to create order' }
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

