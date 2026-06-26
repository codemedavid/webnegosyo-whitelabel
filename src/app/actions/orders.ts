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
import { getAdvanceOrderConfig } from '@/lib/advance-order-utils'
import { resolveDistanceDeliveryConfig, quoteDistanceDelivery } from '@/lib/delivery-fee'

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
  serviceChargeAmount?: number,
  scheduledForISO?: string,
  paymentProof?: {
    url?: string | null
    publicId?: string | null
    reference?: string | null
  }
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
      .select('convex_deployment_url, convex_deploy_key, admin_email, email_notifications_enabled, name, slug, is_active, lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, restaurant_latitude, restaurant_longitude')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantConfig = tenantConfigData as Record<string, any> | null

    if (!tenantConfig) {
      return { success: false, error: 'Restaurant not found or is currently inactive' }
    }

    // ── Advance-order schedule validation (authoritative; covers BOTH Supabase + Convex) ──
    // The client sends scheduledForISO and may also stash scheduled_for/scheduled_for_label in
    // customerData. Re-validate the requested time against the order type's advance config and
    // keep customer_data in lockstep with what we actually persist, so DB filtering and every
    // display agree (no "ASAP column but scheduled label" desync).
    let validatedScheduledISO: string | undefined = undefined
    if (scheduledForISO && orderTypeId) {
      const when = new Date(scheduledForISO)
      const whenMs = when.getTime()
      if (!Number.isNaN(whenMs)) {
        const { data: otRow } = await supabaseAdmin
          .from('order_types')
          .select('advance_order_enabled, advance_order_allow_asap, advance_order_lead_time_minutes, advance_order_max_days_ahead, advance_order_slot_interval_minutes')
          .eq('id', orderTypeId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
        const cfg = getAdvanceOrderConfig(otRow as Parameters<typeof getAdvanceOrderConfig>[0])
        const nowMs = Date.now()
        const minMs = nowMs + cfg.leadTimeMinutes * 60_000 - 5 * 60_000 // 5-min submit grace
        const maxMs = nowMs + (cfg.maxDaysAhead + 1) * 24 * 60 * 60_000 // generous horizon
        if (cfg.enabled && whenMs >= minMs && whenMs <= maxMs) {
          validatedScheduledISO = when.toISOString()
        } else {
          // Log the parsed/normalized timestamp, never the raw client string.
          console.warn('[Order] Rejected out-of-policy scheduled_for', { orderTypeId, requestedAt: when.toISOString() })
        }
      }
    }

    // Reconcile customer_data with the validated schedule.
    let effectiveCustomerData = customerData
    if (customerData && typeof customerData === 'object') {
      const cd = customerData as Record<string, unknown>
      if (!validatedScheduledISO) {
        if ('scheduled_for' in cd || 'scheduled_for_label' in cd) {
          effectiveCustomerData = { ...cd }
          delete (effectiveCustomerData as Record<string, unknown>).scheduled_for
          delete (effectiveCustomerData as Record<string, unknown>).scheduled_for_label
        }
      } else {
        const rawLabel = cd.scheduled_for_label
        const cleanLabel = typeof rawLabel === 'string'
          ? rawLabel.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80)
          : undefined
        effectiveCustomerData = {
          ...cd,
          scheduled_for: validatedScheduledISO,
          ...(cleanLabel ? { scheduled_for_label: cleanLabel } : {}),
        }
      }
    }

    // ── Server-side distance-based delivery fee (authoritative) ──
    // For tenants on the non-Lalamove distance path, recompute the fee from the
    // store↔customer straight-line distance + tenant config, and reject out-of-range
    // addresses. The client-sent deliveryFee is never trusted here. Lalamove tenants keep
    // their quotation-derived fee (it can't be recomputed without re-quoting Lalamove).
    let effectiveDeliveryFee = deliveryFee
    const distanceCfg = resolveDistanceDeliveryConfig({
      enabled: tenantConfig.distance_delivery_enabled === true && tenantConfig.lalamove_enabled !== true,
      perKm: tenantConfig.delivery_price_per_km,
      minFee: tenantConfig.delivery_min_fee,
      radiusKm: tenantConfig.delivery_radius_km,
    })
    if (distanceCfg && orderTypeId) {
      const { data: otTypeRow } = await supabaseAdmin
        .from('order_types')
        .select('type')
        .eq('id', orderTypeId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const isDeliveryOrder = (otTypeRow as { type?: string } | null)?.type === 'delivery'
      if (!isDeliveryOrder) {
        // A distance tenant should never carry a delivery fee on a non-delivery order
        // (pickup/dine-in). Be fully authoritative — ignore any client-sent fee.
        effectiveDeliveryFee = undefined
      } else {
        const storeLat = Number(tenantConfig.restaurant_latitude)
        const storeLng = Number(tenantConfig.restaurant_longitude)
        const cd = (effectiveCustomerData ?? {}) as Record<string, unknown>
        const destLat = Number(cd.delivery_lat)
        const destLng = Number(cd.delivery_lng)
        if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng)) {
          return { success: false, error: 'Delivery is unavailable: the store location has not been configured.' }
        }
        if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
          return { success: false, error: 'Please select your delivery address from the suggestions so we can calculate the delivery fee.' }
        }
        const quote = quoteDistanceDelivery(
          { lat: storeLat, lng: storeLng },
          { lat: destLat, lng: destLng },
          distanceCfg
        )
        if (!quote.withinRadius) {
          return { success: false, error: `Sorry, this address is outside our delivery area (${distanceCfg.radiusKm} km).` }
        }
        effectiveDeliveryFee = quote.fee
      }
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
            orderTotal: orderItems.reduce((sum, i) => sum + i.subtotal, 0) + (effectiveDeliveryFee ?? 0) + (serviceChargeAmount ?? 0),
            deliveryFee: effectiveDeliveryFee ?? 0,
            orderType: orderTypeName,
            paymentMethod: paymentMethodName ?? null,
            // Surface the human "scheduled_for_label" but drop the raw UTC ISO from the email payload.
            customerData: (() => {
              if (!effectiveCustomerData || typeof effectiveCustomerData !== 'object') return effectiveCustomerData ?? null
              const copy = { ...(effectiveCustomerData as Record<string, unknown>) }
              delete copy.scheduled_for
              return copy
            })(),
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

    // Convex has no payment-proof columns, so proof rides in customerData (same
    // pattern as advance-order schedule) to stay cross-tenant compatible.
    const hasProof = Boolean(paymentProof?.url || paymentProof?.reference)
    const convexCustomerData = hasProof
      ? {
          ...(effectiveCustomerData || {}),
          payment_proof_url: paymentProof?.url || undefined,
          payment_proof_public_id: paymentProof?.publicId || undefined,
          payment_proof_reference: paymentProof?.reference || undefined,
        }
      : effectiveCustomerData

    if (tenantConfig?.convex_deployment_url && tenantConfig?.convex_deploy_key) {
      // Route to Convex (prices already validated above)
      const result = await createOrderConvex(
        tenantConfig.convex_deployment_url,
        tenantConfig.convex_deploy_key,
        tenantId,
        items,
        customerInfo,
        orderTypeId,
        convexCustomerData,
        effectiveDeliveryFee,
        lalamoveQuotationId,
        paymentMethodId,
        paymentMethodName,
        paymentMethodDetails,
        paymentMethodQrCodeUrl,
        serviceChargeAmount,
        validatedScheduledISO
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
      effectiveCustomerData,
      effectiveDeliveryFee,
      lalamoveQuotationId,
      paymentMethodId,
      paymentMethodName,
      paymentMethodDetails,
      paymentMethodQrCodeUrl,
      serviceChargeAmount,
      validatedScheduledISO,
      paymentProof
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

    // Storage hygiene: once payment is verified, purge the proof screenshot from
    // ImageKit and null its columns (the reference + timestamp are kept as a record).
    // payment_proof_public_id now holds the ImageKit fileId; the filePath used to
    // scope deletion is derived from the stored URL.
    if (paymentStatus === 'verified') {
      const row = data as {
        payment_proof_public_id?: string | null
        payment_proof_url?: string | null
      }
      const fileId = row?.payment_proof_public_id
      const proofUrl = row?.payment_proof_url
      if (fileId && proofUrl) {
        try {
          const { deleteImageKitAsset, isDeletablePaymentProofPath } = await import('@/lib/imagekit-server')
          const { extractImageKitFilePath } = await import('@/lib/imagekit-utils')
          const filePath = extractImageKitFilePath(proofUrl)
          if (filePath && isDeletablePaymentProofPath(filePath) && (await deleteImageKitAsset(fileId))) {
            await supabase
              .from('orders')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({ payment_proof_url: null, payment_proof_public_id: null } as any)
              .eq('id', orderId)
              .eq('tenant_id', tenantId)
          }
        } catch (purgeError) {
          console.warn('[updatePaymentStatusAction] Proof purge failed:', purgeError)
        }
      }
    }

    revalidatePath(`/${tenantSlug}/admin/orders`)
    revalidatePath(`/${tenantSlug}/admin`)

    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update payment status' }
  }
}

