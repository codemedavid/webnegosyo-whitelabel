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
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { createOrderTenantSupabase } from '@/lib/tenant-supabase-orders'
import { resolveOrderBackend, assertOrderBackendReady } from '@/lib/order-backend'
import { generateTrackingToken } from '@/lib/tracking-token'
import { findCartPresellDate } from '@/lib/presell/availability'
import { presellAdvanceConfig, withPresellCustomerData, type PresellClaimRecord } from '@/lib/presell/checkout-schedule'
import { resolveDistanceDeliveryConfig } from '@/lib/delivery-fee'
import { checkOrderMinimum, formatOrderMinimumMessage } from '@/lib/order-minimum'
import {
  isOrderTypeOrderableOnWeb,
  WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE,
} from '@/lib/order-types/order-type-availability'
import { computeOrderTotals } from '@/lib/order-totals'
import { priceOrderWithVouchers } from '@/lib/vouchers/order-pricing'
import { createVoucherLookup } from '@/lib/vouchers/repository'
import { burnRedemptions, loadCategoryMap } from '@/lib/vouchers/order-voucher-flow'
import { writeOrderDiscount } from '@/lib/order-discount'
import { resolveOrderContact } from '@/lib/customer-identity'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { requireCheckoutOutlet, withOrderOutlet } from '@/lib/outlets/order-outlet'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { sanitizeCustomerData } from '@/lib/checkout/customer-data-guard'
import { sanitizePaymentProof } from '@/lib/checkout/payment-proof-guard'
import { isValidClientDeliveryFee, resolveOrderDeliveryFee } from '@/lib/checkout/order-delivery-fee'
import {
  CHECKOUT_ORDER_TYPE_SELECT,
  advanceConfigOf,
  type CheckoutOrderTypeRow,
} from '@/lib/checkout/checkout-order-type'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'
import { computeServiceCharge } from '@/lib/order-service-charge'
import type { OrderItem } from '@/types/database'

const INVALID_DELIVERY_FEE_MESSAGE =
  'We couldn’t confirm the delivery fee. Please re-enter your delivery address and try again.'

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
    addon_quantities?: Record<string, number>
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
      modifierOptionIds: [...new Set([...(item.option_ids ?? []), ...(item.addon_ids ?? [])])],
      addonIds: item.addon_ids ?? [],
      ...(item.addon_quantities ? { addonQuantities: item.addon_quantities } : {}),
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
    addon_quantities?: Record<string, number>
    isUpsellItem?: boolean
    isBundleItem?: boolean
    bundleId?: string
    bundleName?: string
    slotName?: string
    /** YYYY-MM-DD pickup date for a presell line (see src/lib/presell). */
    presell_date?: string
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
  /**
   * IGNORED. Kept only so the positional signature the checkout calls stays
   * stable: the service charge is recomputed from the tenant's own order type
   * against the server-priced subtotal (see `computeServiceCharge`). A sent
   * amount — negative, say — used to be stored as-is.
   */
  _clientServiceChargeAmount?: number,
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
  voucherCodes?: string[],
  /**
   * One id per checkout attempt, minted by the client. A retry of the SAME
   * attempt (flaky network, double tap) reuses it, so the insert's unique
   * index turns the second write into a lookup of the first order instead of
   * a duplicate sale. A fresh attempt mints a fresh id, so a customer who
   * genuinely orders twice still gets two orders.
   */
  clientOrderId?: string
) {
  // Declared OUTSIDE the try so the catch below can reach them. Presell stock
  // is claimed mid-flight, and a throw after that point used to walk past every
  // release: the customer was told the order was lost while their allocation
  // stayed consumed for good. Set once the claim exists, and once an order row
  // exists to own it.
  let releasePresellClaim: (() => Promise<void>) | null = null
  let orderPersisted = false

  try {
    // Basic input sanity checks before hitting the database
    if (!tenantId || typeof tenantId !== 'string') {
      return { success: false, refused: true, error: 'Invalid tenant ID' }
    }

    // ── Boundary validation (this is a public server action) ──
    // Shape only: a price that passes is still just a claim, floored below.
    // Nothing the web checkout builds can fail these, so a refusal here never
    // hides behind the optimistic confirmation screen for a real customer.
    const parsedLines = parseOrderLines(items)
    if (!parsedLines.ok) {
      console.warn('[createOrderAction] Refused malformed order lines', {
        tenantId,
        issues: parsedLines.issues.slice(0, 10),
      })
      return { success: false, refused: true, error: parsedLines.error }
    }
    items = parsedLines.lines

    // Server-owned keys (presell claim, discount, inventory snapshot, …) are
    // stripped here, so the only copies that can exist are the server's own.
    const sanitizedCustomerData = sanitizeCustomerData(customerData)
    if (!sanitizedCustomerData.ok) {
      return { success: false, refused: true, error: sanitizedCustomerData.error }
    }
    const clientCustomerData = sanitizedCustomerData.data

    if (!isValidClientDeliveryFee(deliveryFee)) {
      return { success: false, refused: true, error: INVALID_DELIVERY_FEE_MESSAGE }
    }

    const safePaymentProof = sanitizePaymentProof(paymentProof)

    // Resolve where this tenant's orders live (Convex / their own Supabase /
    // the shared platform DB) AND that the tenant is active.
    // Using is_active check prevents order creation for deactivated tenants.
    const supabaseAdmin = createAdminClient()
    const { data: tenantConfigData } = await supabaseAdmin
      .from('tenants')
      .select('order_backend, supabase_order_url, supabase_order_anon_key, supabase_order_service_key, inventory_enabled, convex_deployment_url, admin_email, email_notifications_enabled, name, slug, is_active, lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, restaurant_latitude, restaurant_longitude, multi_branch_enabled')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    if (!tenantConfigData) {
      return { success: false, refused: true, error: 'Restaurant not found or is currently inactive' }
    }

    // Credentials live in tenant_secrets, never on the anon-readable tenants
    // row. Read once here: the Convex deploy key routes the order and the
    // Loyverse token backs the live stock check below.
    const tenantSecrets = await getTenantSecrets(supabaseAdmin, tenantId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantConfig: Record<string, any> = {
      ...(tenantConfigData as Record<string, unknown>),
      convex_deploy_key: tenantSecrets?.convex_deploy_key ?? null,
    }

    if (tenantConfig.inventory_enabled === true && items.some((item) => item.option_ids?.length || item.addon_ids?.length)) {
      const { assertSimpleOptionStockAvailable } = await import('@/lib/inventory/simple-option-stock-service')
      try {
        await assertSimpleOptionStockAvailable(tenantId, items.map((item) => ({
          menuItemId: item.menu_item_id, quantity: item.quantity,
          optionIds: item.option_ids, addonIds: item.addon_ids, addonQuantities: item.addon_quantities,
        })))
      } catch (error) {
        return { success: false, refused: true, error: error instanceof Error ? error.message : 'Could not check add-on stock' }
      }
    }

    // ── The order type: ONE tenant-scoped read serves every consumer below ──
    // (web availability, advance schedule, minimum, delivery kind, service
    // charge, and the names the backends and the merchant email carry).
    let orderTypeRow: CheckoutOrderTypeRow | null = null
    if (orderTypeId) {
      const { data: otRow, error: otError } = await supabaseAdmin
        .from('order_types')
        .select(CHECKOUT_ORDER_TYPE_SELECT)
        .eq('id', orderTypeId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (otError) {
        return { success: false, error: 'Failed to verify the order type' }
      }
      orderTypeRow = (otRow as CheckoutOrderTypeRow | null) ?? null

      // A type the merchant hid from online ordering (POS-only channels such
      // as Grab) is refused outright — the storefront never offers it, so
      // reaching here means a stale tab or a direct call.
      if (orderTypeRow && !isOrderTypeOrderableOnWeb(orderTypeRow)) {
        return { success: false, refused: true, error: WEB_UNAVAILABLE_ORDER_TYPE_MESSAGE }
      }
    }

    // ── Live Loyverse stock verification (authoritative; every order backend) ──
    // The synced mirror can always be stale — a webhook may be unregistered or
    // disabled by Loyverse after 48h of failures. One live read here is the
    // only check that cannot be stale, and it costs a single request against a
    // 300 req / 300 s per-merchant budget.
    //
    // Deliberately a SEPARATE select: the loyverse_* columns are not in the
    // tenantConfig projection above, and a column missing from a SELECT fails
    // silently rather than loudly.
    {
      const { data: loyverseRow } = await supabaseAdmin
        .from('tenants')
        .select('loyverse_enabled, loyverse_store_id')
        .eq('id', tenantId)
        .maybeSingle()

      const loyverse = loyverseRow as {
        loyverse_enabled?: boolean | null
        loyverse_store_id?: string | null
      } | null
      const loyverseToken = tenantSecrets?.loyverse_access_token ?? null

      if (loyverse?.loyverse_enabled && loyverseToken && loyverse.loyverse_store_id) {
        const { findLiveOutOfStockLines } = await import('@/lib/loyverse/stock-check')
        const blocked = await findLiveOutOfStockLines(
          tenantId,
          loyverseToken,
          loyverse.loyverse_store_id,
          items.map((item) => ({
            menu_item_id: item.menu_item_id,
            menu_item_name: item.menu_item_name,
          }))
        )
        if (blocked.length > 0) {
          const names = blocked.map((line) => line.menu_item_name).join(', ')
          return {
            success: false,
            refused: true,
            error: `Sorry, ${names} just went out of stock. Please remove ${blocked.length === 1 ? 'it' : 'them'} from your cart and try again.`,
          }
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
        // A presell cart schedules against its allocated date, which may lie
        // past the order type's horizon (or the type may never schedule at
        // all). The same stretch the checkout hook applied is applied here.
        const baseCfg = advanceConfigOf(orderTypeRow)
        const cartPresellDate = findCartPresellDate(items)
        const cfg = cartPresellDate ? presellAdvanceConfig(baseCfg, cartPresellDate, new Date()) : baseCfg
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
    let effectiveCustomerData = clientCustomerData
    if (clientCustomerData) {
      const cd = clientCustomerData
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
    if (isMultiBranchEnabled(tenantConfig)) {
      const { data: outletRows, error: outletError } = await supabaseAdmin
        .from('outlets')
        .select('id, name, is_active')
        .eq('tenant_id', tenantId)
      if (outletError) return { success: false, error: 'Unable to verify your branch. Please try again.' }
      try {
        resolvedOutlet = requireCheckoutOutlet({
          isEnabled: true,
          requestedOutletId: outletId,
          outlets: (outletRows ?? []) as Array<{ id: string; name: string; is_active: boolean }>,
        })
      } catch (error) {
        return { success: false, refused: true, error: error instanceof Error ? error.message : 'Choose a branch before placing your order.' }
      }
    }

    // Convex and tenant-owned Supabase projects have no outlet column, so the
    // branch rides in customer_data for every backend. Returns the very same
    // object when no branch resolved — see withOrderOutlet.
    effectiveCustomerData = withOrderOutlet(effectiveCustomerData, resolvedOutlet)

    // ── SERVER-SIDE PRICE VALIDATION (runs before every backend) ──
    // Each line is held to the price the customer was shown: the dish's
    // effective (sale-aware) price at the chosen branch, plus its options and
    // add-ons priced from the dish's own JSON. The browser's price can only
    // raise that; its subtotal is never used. Priced before the stock guard and
    // the presell claim so a refusal here has nothing to hand back.
    const pricedLines = await loadAndPriceOrderLines(supabaseAdmin, tenantId, items, resolvedOutlet?.id ?? null)
    if (!pricedLines.ok) {
      return pricedLines.refused
        ? { success: false, refused: true, error: pricedLines.error }
        : { success: false, error: pricedLines.error }
    }
    items = pricedLines.lines
    const itemsSubtotal = pricedLines.itemsSubtotal

    // ── Minimum-order enforcement (authoritative; covers EVERY order backend) ──
    // The checkout button is only a courtesy: the mobile apps, a stale tab, and
    // a direct action call all reach here without it. Measured against the
    // SERVER-PRICED item subtotal, so neither a delivery fee nor a forged line
    // subtotal can carry a small cart over a minimum.
    if (orderTypeRow) {
      const minimumStatus = checkOrderMinimum(itemsSubtotal, orderTypeRow)
      if (!minimumStatus.meets) {
        return {
          success: false,
          refused: true,
          error:
            formatOrderMinimumMessage(minimumStatus, orderTypeRow.name) ??
            'This order is below the minimum for checkout',
        }
      }
    }

    // ── Producible-quantity stock guard (authoritative; every order backend) ──
    // The Loyverse check above, and auto-86, both only ever ask "is this dish
    // above zero?" — which stays true right up until the order that empties the
    // shelf is accepted in full. This asks the question a quantity stepper
    // actually poses: can the kitchen make the number in this cart? Flour for
    // two burgers has always accepted a cart of fifty until now.
    //
    // Deliberately placed AFTER the branch is resolved: which shelf this is
    // judged against is the branch fulfilling the order, and that is settled
    // above from the tenant's own outlets — never from the customer's payload.
    // Silent on every failure path (inventory off, failed read, no recipe), so
    // a tenant without inventory issues exactly the queries they issue today.
    {
      const { findCheckoutStockShortfallMessage } = await import(
        '@/lib/inventory/checkout-stock-guard'
      )
      const shortfallMessage = await findCheckoutStockShortfallMessage(
        tenantId,
        items.map((item) => ({
          menuItemId: item.menu_item_id,
          quantity: item.quantity,
        })),
        resolvedOutlet?.id ?? null,
      )
      if (shortfallMessage) {
        return { success: false, refused: true, error: shortfallMessage }
      }
    }

    // ── Presell claim (per-date stock) ──
    // Reserved under a server-generated claim id BEFORE any order row exists,
    // so an oversold cart is refused with nothing written. The claim rides in
    // customer_data on every backend so a cancel can release it later. Any
    // refusal below this point hands the stock back.
    let presellClaim: PresellClaimRecord | null = null
    {
      const { claimPresellForOrder } = await import('@/lib/presell/order-claim')
      const claimId = crypto.randomUUID()
      const outcome = await claimPresellForOrder(supabaseAdmin, tenantId, claimId, items)
      if (!outcome.ok) {
        return { success: false, refused: true, error: outcome.message }
      }
      if (outcome.lines.length > 0) {
        const presellDate = findCartPresellDate(items) as string
        presellClaim = { presellDate, claimId, lines: outcome.lines }
        effectiveCustomerData = withPresellCustomerData(effectiveCustomerData, presellClaim)
      }
    }
    /** Release is idempotent: the paths that already gave the stock back must not do it twice. */
    let claimReleased = false

    // Hand the reserved pre-order stock back before answering. Both helpers do
    // it; they differ only in what the checkout is told afterwards.
    //
    // Never throws. A failed release is a stock leak worth shouting about, but
    // it is not the failure the customer is waiting to hear — letting it
    // propagate would replace a refusal they can act on ("outside our delivery
    // area") with a generic lost-order message, and bury the real exception.
    const releaseClaim = async () => {
      if (!presellClaim || claimReleased) return
      try {
        const { releasePresellForOrder } = await import('@/lib/presell/order-claim')
        await releasePresellForOrder(supabaseAdmin, tenantId, presellClaim.claimId, presellClaim.lines)
        claimReleased = true
      } catch (releaseError) {
        console.error('[createOrderAction] Presell claim release failed — stock stays reserved', {
          tenantId,
          claimId: presellClaim.claimId,
          message: releaseError instanceof Error ? releaseError.message : String(releaseError),
        })
      }
    }
    releasePresellClaim = releaseClaim

    /**
     * The store saying no on purpose. `error` is written for a diner and names
     * what to change, so the checkout shows it verbatim — and does NOT offer
     * the Messenger message, which would deliver an order we just rejected.
     */
    const refuse = async (
      error: string
    ): Promise<{ success: false; refused: true; error: string }> => {
      await releaseClaim()
      return { success: false, refused: true as const, error }
    }

    /**
     * The order genuinely going missing. `error` is diagnostic, not customer
     * copy, so the checkout keeps its own generic wording and keeps offering
     * the Messenger message — the merchant's last remaining copy of the order.
     */
    const abort = async (
      error: string
    ): Promise<{ success: false; error: string }> => {
      await releaseClaim()
      return { success: false, error }
    }

    // ── Delivery fee (authoritative) ──
    // A distance fee is recomputed from coordinates; an order with no fee
    // source (not a delivery, or neither Lalamove nor distance pricing on)
    // carries none. A Lalamove fee is range-checked only — see the residual
    // risk documented in order-delivery-fee.ts.
    const deliveryDestination = (effectiveCustomerData ?? {}) as Record<string, unknown>
    const deliveryResolution = resolveOrderDeliveryFee({
      clientFee: deliveryFee,
      isDeliveryOrder: orderTypeRow?.type === 'delivery',
      lalamoveEnabled: tenantConfig.lalamove_enabled === true,
      distanceConfig: resolveDistanceDeliveryConfig({
        enabled: tenantConfig.distance_delivery_enabled === true && tenantConfig.lalamove_enabled !== true,
        perKm: tenantConfig.delivery_price_per_km,
        minFee: tenantConfig.delivery_min_fee,
        radiusKm: tenantConfig.delivery_radius_km,
      }),
      store: { lat: Number(tenantConfig.restaurant_latitude), lng: Number(tenantConfig.restaurant_longitude) },
      destination: { lat: Number(deliveryDestination.delivery_lat), lng: Number(deliveryDestination.delivery_lng) },
    })
    if (deliveryResolution.kind === 'abort') return await abort(deliveryResolution.error)
    if (deliveryResolution.kind === 'refuse') return await refuse(deliveryResolution.error)
    const effectiveDeliveryFee = deliveryResolution.fee

    // ── Service charge (authoritative) ──
    // Recomputed from the tenant's own order type against the server-priced
    // subtotal, with the formula the checkout displays. The sent figure is
    // ignored — a negative one used to be stored as a discount.
    const serviceCharge = computeServiceCharge(orderTypeRow, itemsSubtotal)

    // PostHog email notification - awaited to ensure flush completes
    const firePostHogNotification = async (orderId: string, orderItems: typeof items) => {
      if (tenantConfig?.email_notifications_enabled && tenantConfig?.admin_email) {
        try {
          const { captureOrderCreated } = await import('@/lib/posthog')
          const orderTypeName = orderTypeRow?.name ?? null

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
              serviceCharge,
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
      serviceCharge,
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
    const hasProof = Boolean(safePaymentProof?.url || safePaymentProof?.reference)
    const convexCustomerData = hasProof
      ? {
          ...(effectiveCustomerData || {}),
          payment_proof_url: safePaymentProof?.url || undefined,
          payment_proof_public_id: safePaymentProof?.publicId || undefined,
          payment_proof_reference: safePaymentProof?.reference || undefined,
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
      const orderTypeName = orderTypeRow?.name ?? null

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
        serviceChargeAmount: serviceCharge,
        scheduledForISO: validatedScheduledISO,
        paymentProof: safePaymentProof,
        discounts: pricing.application.discountLines,
      })
      // The order row exists and carries the claim; the stock is spent for real.
      orderPersisted = true

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
        serviceCharge,
        validatedScheduledISO,
        pricing.application.discountLines
      )
      // The order row exists and carries the claim; the stock is spent for real.
      orderPersisted = true
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
      serviceCharge,
      validatedScheduledISO,
      safePaymentProof,
      // Only the platform database has an outlet_id column; the other two
      // backends carry the branch in customer_data (stamped above).
      resolvedOutlet?.id ?? null,
      pricing.application.discountLines,
      {
        clientOrderId: typeof clientOrderId === 'string' ? clientOrderId : null,
        discountPayload: pricing.discountPayload,
      }
    )
    if (result.deduped) {
      // The first attempt already burned vouchers, depleted stock, and pushed
      // notifications for this exact order — running them again is the
      // double-spend the dedupe exists to prevent.
      //
      // Its presell claim is the one the saved order carries, so the claim THIS
      // retry just took reserved the allocation a second time for an order that
      // already exists. Hand that duplicate back or the shelf shrinks on every
      // double tap.
      await releaseClaim()
      let dedupedTrackingToken: string | undefined
      try { dedupedTrackingToken = generateTrackingToken(result.order.id) } catch { /* API_SECRET may be missing */ }
      return { success: true, data: result.order, orderToken: result.orderToken, trackingToken: dedupedTrackingToken }
    }
    // The order row exists and carries the claim; the stock is spent for real.
    orderPersisted = true
    await burnFor(result.order.id)
    // Return both order and token for secure public API access
    await depleteStockForOrder(tenantConfig, tenantId, result.order.id, items, resolvedOutlet?.id ?? null)
    await pushLoyverseOnCreate(tenantId, result.order.id, items)
    await firePostHogNotification(result.order.id, items)
    let trackingToken: string | undefined
    try { trackingToken = generateTrackingToken(result.order.id) } catch { /* API_SECRET may be missing */ }
    return { success: true, data: result.order, orderToken: result.orderToken, trackingToken }
  } catch (error) {
    // Presell stock reserved for an order that never got written is stock that
    // silently evaporates: nobody holds it, and no cancel can ever give it
    // back. Handed over first, and only when no order row claimed it — after a
    // successful write the allocation belongs to that order.
    //
    // `releaseClaim` swallows nothing but never throws either, so the real
    // exception below stays the one the customer and the log hear about.
    if (!orderPersisted && releasePresellClaim) {
      await releasePresellClaim()
    }

    // A throw here means the customer has already been shown "Order Placed!"
    // and had their cart cleared for an order that does not exist. The message
    // is the only record of why, so log it with enough context to find the
    // tenant and the attempt — a bare `error` object stringifies to
    // "[object Object]" in the platform log and tells an operator nothing.
    //
    // Postgres errors additionally carry a `code`; RLS refusals arrive as
    // 42501, which is what silently destroyed a live tenant's web orders.
    const detail = error as { message?: string; code?: string; details?: string } | null
    console.error('[createOrderAction] ORDER LOST — creation threw', {
      tenantId,
      orderTypeId: orderTypeId ?? null,
      clientOrderId: typeof clientOrderId === 'string' ? clientOrderId : null,
      itemCount: Array.isArray(items) ? items.length : 0,
      code: detail?.code ?? null,
      message: detail?.message ?? String(error),
      details: detail?.details ?? null,
    })
    return {
      success: false,
      error: 'We could not save your order. Please try again or contact the store.',
    }
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

    // A settled POS sale is a completed visit; let loyalty see the settlement.
    // Best-effort and idempotent at the database.
    {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { runLoyaltyForOrder } = await import('@/lib/loyalty/lifecycle')
      await runLoyaltyForOrder(createAdminClient(), {
        tenantId,
        backend: 'platform_supabase',
        externalOrderId: orderId,
      })
    }

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

