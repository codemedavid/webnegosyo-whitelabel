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
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { createOrderTenantSupabase } from '@/lib/tenant-supabase-orders'
import { resolveOrderBackend, assertOrderBackendReady } from '@/lib/order-backend'
import { generateTrackingToken } from '@/lib/tracking-token'
import { getAdvanceOrderConfig } from '@/lib/advance-order-utils'
import { resolveDistanceDeliveryConfig, quoteDistanceDelivery } from '@/lib/delivery-fee'
import { checkOrderMinimum, formatOrderMinimumMessage } from '@/lib/order-minimum'
import { computeOrderTotals } from '@/lib/order-totals'
import { priceOrderWithVouchers } from '@/lib/vouchers/order-pricing'
import { createVoucherLookup } from '@/lib/vouchers/repository'
import { burnRedemptions, loadCategoryMap } from '@/lib/vouchers/order-voucher-flow'
import { writeOrderDiscount } from '@/lib/order-discount'
import { resolveOrderContact } from '@/lib/customer-identity'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { resolveOrderOutlet, withOrderOutlet } from '@/lib/outlets/order-outlet'
import {
  resolveOrderLinePrice,
  type StoreMenuItemPricing,
} from '@/lib/order-line-price-floor'
import {
  buildOutletMenuIndex,
  findOutletMenuOverride,
  type OutletMenuIndex,
  type OutletMenuOverrideRow,
} from '@/lib/outlets/outlet-menu-overrides'
import { OUTLET_MENU_OVERRIDE_SELECT } from '@/lib/outlets/outlet-menu-repository'
import type { OrderItem } from '@/types/database'

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

/**
 * Spend the order's ingredients. Stock lives in the platform Supabase for every
 * tenant regardless of where their orders live, so all three backends funnel
 * through here rather than reimplementing depletion each.
 *
 * Best-effort by design: the order is already saved when this runs.
 */
async function depleteStockForOrder(
  tenantConfig: Record<string, unknown>,
  tenantId: string,
  orderId: string,
  items: Array<{
    menu_item_id: string
    quantity: number
    option_ids?: string[]
    addon_ids?: string[]
  }>,
  /**
   * Branch that took the order — the already-validated `resolvedOutlet`, never
   * the id the browser sent. Stock is spent from the shop that served it, and a
   * client-chosen branch would let a customer deplete someone else's shelf.
   * Null for a single-location tenant, whose stock is the unbranched pool.
   */
  outletId: string | null,
) {
  if (tenantConfig.inventory_enabled !== true) return
  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  await applyOrderStockBestEffort(
    tenantId,
    orderId,
    items.map((item) => ({
      menuItemId: item.menu_item_id,
      quantity: item.quantity,
      // The same id set feeds both buckets: variation options and unified
      // modifier options both arrive here and ids are unique per option, so
      // whichever recipe target exists matches and the other finds nothing.
      optionIds: item.option_ids ?? [],
      modifierOptionIds: item.option_ids ?? [],
      addonIds: item.addon_ids ?? [],
    })),
    'sale',
    0,
    outletId,
  )
}

/**
 * Loyverse twin of depleteStockForOrder: every backend branch funnels through
 * here so an "on order placed" push behaves identically wherever the order
 * row lives. The push service itself checks the tenant flag, the on_create
 * push mode, and idempotency; platformOrderId is null for Convex and
 * tenant-Supabase orders, whose receipt outcome has no platform row to land on.
 *
 * Best-effort by design: the order is already saved when this runs.
 */
async function pushLoyverseOnCreate(
  tenantId: string,
  platformOrderId: string | null,
  items: OrderItem[],
) {
  try {
    const { pushOrderToLoyverseBestEffort } = await import('@/lib/loyverse/push-service')
    await pushOrderToLoyverseBestEffort({
      tenantId,
      orderId: platformOrderId,
      items,
      trigger: 'create',
    })
  } catch (error) {
    console.error('[createOrderAction] Loyverse push failed:', error)
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
    // Selected option / addon ids, carried alongside the display strings so
    // inventory can spend what an option adds. Optional: callers that predate
    // this (mobile apps, older clients) simply deplete base recipes.
    option_ids?: string[]
    addon_ids?: string[]
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
  },
  /**
   * The branch the customer chose, as claimed by their browser. Re-validated
   * here against the tenant's own outlets — never trusted as sent. Ignored
   * entirely unless the tenant enabled multi-branch.
   */
  outletId?: string,
  /**
   * Voucher codes as the customer typed them. CODES, never amounts — the
   * discount is recomputed here from the tenant's own voucher rows, the same
   * way the delivery fee and the outlet id are re-validated rather than
   * trusted. A client-supplied amount would let anyone check out for nothing.
   */
  voucherCodes?: string[]
) {
  try {
    // Basic input sanity checks before hitting the database
    if (!tenantId || typeof tenantId !== 'string') {
      return { success: false, error: 'Invalid tenant ID' }
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Order must contain at least one item' }
    }

    // Resolve where this tenant's orders live (Convex / their own Supabase /
    // the shared platform DB) AND that the tenant is active.
    // Using is_active check prevents order creation for deactivated tenants.
    const supabaseAdmin = createAdminClient()
    const { data: tenantConfigData } = await supabaseAdmin
      .from('tenants')
      .select('order_backend, supabase_order_url, supabase_order_anon_key, supabase_order_service_key, inventory_enabled, convex_deployment_url, convex_deploy_key, admin_email, email_notifications_enabled, name, slug, is_active, lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, restaurant_latitude, restaurant_longitude, multi_branch_enabled')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantConfig = tenantConfigData as Record<string, any> | null

    if (!tenantConfig) {
      return { success: false, error: 'Restaurant not found or is currently inactive' }
    }

    // ── Minimum-order enforcement (authoritative; covers EVERY order backend) ──
    // Runs before any backend dispatch, because the checkout button is only a
    // courtesy: the mobile apps, a stale tab, and a direct action call all reach
    // here without it. Measured against the ITEM subtotal so a delivery fee can
    // never carry a small cart over a delivery minimum.
    if (orderTypeId) {
      const { data: minRow } = await supabaseAdmin
        .from('order_types')
        .select('name, minimum_order_amount')
        .eq('id', orderTypeId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      const minOrderType = minRow as { name?: string; minimum_order_amount?: number | string | null } | null
      const itemsSubtotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)
      const minimumStatus = checkOrderMinimum(itemsSubtotal, minOrderType)

      if (!minimumStatus.meets) {
        return {
          success: false,
          error:
            formatOrderMinimumMessage(minimumStatus, minOrderType?.name) ??
            'This order is below the minimum for checkout',
        }
      }
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

    // ── Which branch is fulfilling this order (authoritative) ──
    // The browser tells us what the customer picked; we only believe it if the
    // tenant opted in AND the id names one of their own branches. Both
    // conditions are checked before the query runs, so a tenant without the
    // feature issues exactly the queries they issue today.
    let resolvedOutlet: { id: string; name: string } | null = null
    if (isMultiBranchEnabled(tenantConfig) && typeof outletId === 'string' && outletId.trim() !== '') {
      const { data: outletRows } = await supabaseAdmin
        .from('outlets')
        .select('id, name, is_active')
        .eq('tenant_id', tenantId)
      resolvedOutlet = resolveOrderOutlet({
        isEnabled: true,
        requestedOutletId: outletId,
        outlets: (outletRows ?? []) as Array<{ id: string; name: string; is_active: boolean }>,
      })
    }

    // Convex and tenant-owned Supabase projects have no outlet column, so the
    // branch rides in customer_data for every backend. Returns the very same
    // object when no branch resolved — see withOrderOutlet.
    effectiveCustomerData = withOrderOutlet(effectiveCustomerData, resolvedOutlet)

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
            // The merchant's copy of the total must be the same arithmetic the
            // customer was shown, or a discount lands on one side only.
            orderTotal: computeOrderTotals({
              subtotal: orderItems.reduce((sum, i) => sum + i.subtotal, 0),
              deliveryFee: effectiveDeliveryFee,
              serviceCharge: serviceChargeAmount,
            }).grandTotal,
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
    //
    // The floor each line is held to is decided in `resolveOrderLinePrice`, from
    // the price the customer was actually shown: the store-wide dish, its sale
    // price if it has one, and then the chosen branch's override on top. A floor
    // built from the bare list price overcharges every discounted line and undoes
    // per-branch pricing in the direction merchants use it most — cheaper here.
    const menuItemIds = [...new Set(items.map(i => i.menu_item_id))]
    const { data: dbItems, error: priceCheckError } = await supabaseAdmin
      .from('menu_items')
      .select('id, price, discounted_price, is_available, name')
      .eq('tenant_id', tenantId)
      .in('id', menuItemIds)

    if (priceCheckError) {
      return { success: false, error: 'Failed to verify item prices' }
    }

    const storeItems = new Map(
      ((dbItems ?? []) as unknown as StoreMenuItemPricing[]).map(i => [i.id, i])
    )

    // Only a branch-carrying order needs overrides, and only for the dishes in
    // it. A tenant without the feature issues exactly the queries it does today.
    let branchOverrides: OutletMenuIndex = buildOutletMenuIndex([])
    if (resolvedOutlet) {
      const { data: overrideRows, error: overrideError } = await supabaseAdmin
        .from('outlet_menu_items')
        .select(OUTLET_MENU_OVERRIDE_SELECT)
        .eq('tenant_id', tenantId)
        .eq('outlet_id', resolvedOutlet.id)
        .in('menu_item_id', menuItemIds)

      // Not swallowed. An empty override set is the specific claim "this branch
      // sells at the store-wide price", which on a failed query would charge one
      // branch's customers another branch's prices.
      if (overrideError) {
        return { success: false, error: 'Failed to verify branch prices' }
      }
      branchOverrides = buildOutletMenuIndex(
        (overrideRows ?? []) as unknown as OutletMenuOverrideRow[]
      )
    }

    // Rebuilt rather than mutated in place: the caller's array is not ours to
    // rewrite, and a re-priced copy is what every downstream path should use.
    const pricedItems: typeof items = []
    for (const item of items) {
      const result = resolveOrderLinePrice(
        item,
        storeItems.get(item.menu_item_id),
        findOutletMenuOverride(branchOverrides, resolvedOutlet?.id ?? null, item.menu_item_id)
      )

      if (!result.ok) {
        return { success: false, error: result.error }
      }

      pricedItems.push({ ...item, price: result.price, subtotal: result.subtotal })
    }
    items = pricedItems

    // ---- Vouchers -------------------------------------------------------
    // Priced here, after the server has re-priced every line and settled the
    // delivery fee, so the discount is computed against numbers the customer
    // could not influence. Only codes came from the browser.
    const requestedCodes = Array.isArray(voucherCodes)
      ? voucherCodes.filter((code): code is string => typeof code === 'string')
      : []

    // Category-scoped vouchers need to know each item's category. Loaded only
    // when a code was actually presented — an ordinary order pays nothing for
    // this feature. An empty map matches nothing, which is the safe direction.
    const categoryByMenuItemId =
      requestedCodes.length === 0
        ? {}
        : await loadCategoryMap(supabaseAdmin, tenantId, items.map((i) => i.menu_item_id))

    const customerKey = resolveOrderContact({
      name: customerInfo?.name,
      contact: customerInfo?.contact,
      customerData: effectiveCustomerData,
    })

    const pricing = await priceOrderWithVouchers({
      tenantId,
      items,
      deliveryFee: effectiveDeliveryFee,
      serviceCharge: serviceChargeAmount,
      voucherCodes: requestedCodes,
      channel: 'checkout',
      now: new Date(),
      lookup: createVoucherLookup(supabaseAdmin),
      categoryByMenuItemId,
      outletId: resolvedOutlet?.id ?? null,
      customerKey,
    })

    // The breakdown rides in customerData so it reaches Convex tenants too,
    // whose schema is deployed per tenant and would not have a new column.
    // `total` is already net of the discount on every backend; this is the
    // receipt detail, never the source of the amount charged.
    const customerDataWithDiscount = writeOrderDiscount(
      effectiveCustomerData,
      pricing.discountPayload
    )
    effectiveCustomerData = customerDataWithDiscount

    /** Burns the uses once an order row exists. Never before. */
    const burnFor = async (orderId: string) => {
      const outcome = await burnRedemptions(supabaseAdmin, {
        tenantId,
        orderId,
        channel: 'checkout',
        redemptions: pricing.redemptions,
        customerKey,
        outletId: resolvedOutlet?.id ?? null,
      })

      if (outcome.failures.length > 0) {
        // Not fatal: the order is saved and paid for. Losing a coupon count is
        // the cheaper failure, but it must be visible.
        console.error(
          `[createOrderAction] Order ${orderId} saved but ${outcome.failures.length} voucher redemption(s) failed:`,
          outcome.failures
        )
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

    // Route to the tenant's OWN Supabase project when that is the selected
    // backend. Checked before the Convex branch so an explicit selection always
    // wins; `assertOrderBackendReady` makes a half-configured tenant fail loudly
    // instead of silently writing into the shared platform database, which would
    // split that merchant's orders across two backends unnoticed.
    if (resolveOrderBackend(tenantConfig) === 'supabase') {
      assertOrderBackendReady(tenantConfig)

      // The order type lives on the platform; carry its display name across so
      // the merchant queue doesn't render every order as "N/A".
      let orderTypeName: string | null = null
      if (orderTypeId) {
        const { data: otNameRow } = await supabaseAdmin
          .from('order_types')
          .select('name')
          .eq('id', orderTypeId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
        orderTypeName = (otNameRow as { name?: string } | null)?.name ?? null
      }

      const tenantClient = createTenantOrderWriteClient(tenantConfig)
      const result = await createOrderTenantSupabase(tenantClient, {
        tenantId,
        items,
        customerInfo,
        orderTypeId,
        orderTypeName,
        customerData: effectiveCustomerData,
        deliveryFee: effectiveDeliveryFee,
        lalamoveQuotationId,
        paymentMethodId,
        paymentMethodName,
        paymentMethodDetails,
        paymentMethodQrCodeUrl,
        serviceChargeAmount,
        scheduledForISO: validatedScheduledISO,
        paymentProof,
        discounts: pricing.application.discountLines,
      })

      await burnFor(result.order.id)

      // Same reason as the Convex branch: this order lives in the tenant's own
      // project, so nothing else would ever roll it into the platform-side
      // customers table. Best-effort and non-blocking — the order is saved.
      const { captureExternalOrderBestEffort } = await import('@/lib/customer-external-orders')
      await captureExternalOrderBestEffort(supabaseAdmin, tenantId, {
        backend: 'tenant_supabase',
        externalOrderId: result.order.id,
        name: customerInfo?.name ?? null,
        contact: customerInfo?.contact ?? null,
        customerData: effectiveCustomerData ?? null,
        total: Number(result.order.total) || 0,
        createdAt: new Date().toISOString(),
        channel: orderTypeName,
        items: items.map((item) => ({
          name: item.menu_item_name,
          quantity: item.quantity,
        })),
      })

      await depleteStockForOrder(tenantConfig, tenantId, result.order.id, items, resolvedOutlet?.id ?? null)
      await pushLoyverseOnCreate(tenantId, null, items)
      await firePostHogNotification(result.order.id, items)
      let trackingToken: string | undefined
      try { trackingToken = generateTrackingToken(result.order.id) } catch { /* API_SECRET may be missing */ }
      return { success: true, data: result.order, orderToken: result.orderToken, trackingToken }
    }

    // Route on the same resolver the admin queue reads with, so a write can
    // never land in a backend the merchant's order page isn't looking at.
    // `assertOrderBackendReady` turns a half-configured Convex tenant into a
    // loud failure rather than a silent write into the shared platform DB.
    if (resolveOrderBackend(tenantConfig) === 'convex') {
      assertOrderBackendReady(tenantConfig)
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
        validatedScheduledISO,
        pricing.application.discountLines
      )
      await burnFor(result.order.id)
      await depleteStockForOrder(tenantConfig, tenantId, result.order.id, items, resolvedOutlet?.id ?? null)
      await pushLoyverseOnCreate(tenantId, null, items)
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
      paymentProof,
      // Only the platform database has an outlet_id column; the other two
      // backends carry the branch in customer_data (stamped above).
      resolvedOutlet?.id ?? null,
      pricing.application.discountLines
    )
    await burnFor(result.order.id)
    // Return both order and token for secure public API access
    await depleteStockForOrder(tenantConfig, tenantId, result.order.id, items, resolvedOutlet?.id ?? null)
    await pushLoyverseOnCreate(tenantId, result.order.id, items)
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
    const { verifyTenantPermission } = await import('@/lib/admin-service')
    await verifyTenantPermission(tenantId, 'orders')

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

