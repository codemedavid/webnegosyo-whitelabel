/**
 * Everything `createOrderAction` does once an order row exists, for every
 * order backend.
 *
 * - Stock depletion stays ON the request: the next order's stock guard judges
 *   the shelf this leaves behind, so it must not trail the response.
 * - The merchant email (PostHog), the Loyverse receipt push and the
 *   Regulars-list capture are notifications. The customer is not waiting for
 *   them, so they run after the response (`runAfterResponse`) instead of
 *   holding checkout — and the tracking-page redirect — behind PostHog,
 *   Loyverse and the customer-profile queries.
 *
 * All of it is best-effort by design: the order is already saved.
 */

import { computeOrderTotals } from '@/lib/order-totals'
import type { LoyverseTenant } from '@/lib/loyverse/tenant'
import type { OrderItem } from '@/types/database'
import { runAfterResponse, type AfterScheduler } from '@/lib/checkout/after-response'

export interface FollowUpOrderLine {
  menu_item_id: string
  menu_item_name: string
  variation?: string
  addons: string[]
  quantity: number
  subtotal: number
  option_ids?: string[]
  addon_ids?: string[]
  addon_quantities?: Record<string, number>
}

/** What the merchant's order email needs beyond the lines. */
export interface MerchantOrderNotice {
  orderTypeName: string | null
  deliveryFee: number | undefined
  serviceCharge: number | undefined
  paymentMethodName: string | null | undefined
  customerData: Record<string, unknown> | undefined
}

export interface OrderFollowUpInput {
  tenantConfig: Record<string, unknown>
  tenantId: string
  /** The saved order's id on its own backend. */
  orderId: string
  /** The platform row id, or null for Convex / tenant-Supabase orders. */
  platformOrderId: string | null
  items: readonly FollowUpOrderLine[]
  /** The already-validated branch — never the id the browser sent. */
  outletId: string | null
  /** The Loyverse snapshot checkout read; null skips the push entirely. */
  loyverse: LoyverseTenant | null
  notice: MerchantOrderNotice
  /** Extra post-response capture (the tenant-Supabase Regulars list). */
  captureCustomer?: () => Promise<unknown>
}

/**
 * Spend the order's ingredients. Stock lives in the platform Supabase for every
 * tenant regardless of where their orders live, so all three backends funnel
 * through here. A client-chosen branch would let a customer deplete someone
 * else's shelf, hence `outletId` is the validated one.
 */
async function depleteStockForOrder(input: OrderFollowUpInput): Promise<void> {
  if (input.tenantConfig.inventory_enabled !== true) return
  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  await applyOrderStockBestEffort(
    input.tenantId,
    input.orderId,
    input.items.map((item) => ({
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
    input.outletId,
    // A diner placing an order online has no merchant account behind it.
    { context: { source: 'web_checkout' } },
  )
}

/** The "on order placed" receipt push; the service checks push mode and idempotency. */
async function pushLoyverseOnCreate(input: OrderFollowUpInput): Promise<void> {
  if (!input.loyverse) return
  const { pushOrderToLoyverseBestEffort } = await import('@/lib/loyverse/push-service')
  await pushOrderToLoyverseBestEffort({
    tenantId: input.loyverse.id,
    orderId: input.platformOrderId,
    items: input.items as unknown as OrderItem[],
    trigger: 'create',
    tenant: input.loyverse,
  })
}

/** The human schedule label stays; the raw UTC instant is not for an email. */
function emailCustomerData(customerData: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!customerData || typeof customerData !== 'object') return customerData ?? null
  const { scheduled_for: _omitted, ...rest } = customerData
  void _omitted
  return rest
}

async function notifyMerchant(input: OrderFollowUpInput): Promise<void> {
  const config = input.tenantConfig
  if (!config.email_notifications_enabled || !config.admin_email) return
  const { captureOrderCreated } = await import('@/lib/posthog')
  const { notice, items } = input
  await captureOrderCreated({
    tenantId: input.tenantId,
    tenantName: (config.name as string | undefined) ?? '',
    tenantSlug: (config.slug as string | undefined) ?? '',
    adminEmail: config.admin_email as string,
    orderId: input.orderId,
    items: items.map((item) => ({
      name: item.menu_item_name,
      quantity: item.quantity,
      variation: item.variation ?? null,
      addons: item.addons,
      subtotal: item.subtotal,
    })),
    // The merchant's copy of the total must be the same arithmetic the
    // customer was shown, or a discount lands on one side only.
    orderTotal: computeOrderTotals({
      subtotal: items.reduce((sum, item) => sum + item.subtotal, 0),
      deliveryFee: notice.deliveryFee,
      serviceCharge: notice.serviceCharge,
    }).grandTotal,
    deliveryFee: notice.deliveryFee ?? 0,
    orderType: notice.orderTypeName,
    paymentMethod: notice.paymentMethodName ?? null,
    customerData: emailCustomerData(notice.customerData),
  })
}

export async function runOrderFollowUps(input: OrderFollowUpInput, schedule?: AfterScheduler): Promise<void> {
  await depleteStockForOrder(input)

  const capture = input.captureCustomer
  if (capture) await runAfterResponse('customer capture', async () => { await capture() }, schedule)
  await runAfterResponse('Loyverse push', () => pushLoyverseOnCreate(input), schedule)
  await runAfterResponse('merchant notification', () => notifyMerchant(input), schedule)
}
