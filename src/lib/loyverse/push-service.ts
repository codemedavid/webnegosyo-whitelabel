/**
 * Backend-agnostic "push this order into Loyverse" entry point, shaped like
 * depleteStockForOrder: best-effort, idempotent, never throws, callable from
 * the checkout action, the web-admin confirm path, and the /api/loyverse route
 * the merchant app uses.
 *
 * Idempotency: platform orders carry loyverse_receipt_number — a second push
 * is a no-op. Convex / tenant-Supabase orders have no platform row (orderId is
 * null); their single-call guarantee is the status transition that triggers
 * the push.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ModifierGroup, OrderItem, Tenant } from '@/types/database'
import { resolveLoyverseConfig, type LoyversePushMode } from '@/lib/loyverse/config'
import {
  sendLoyverseReceipt,
  type LoyverseReceiptCatalog,
  type LoyversePushResult,
} from '@/lib/loyverse/order-push'

export type LoyversePushTrigger = 'create' | 'confirm' | 'manual'

export interface LoyversePushRequest {
  tenantId: string
  /** Platform orders row id; null for Convex / tenant-Supabase orders. */
  orderId?: string | null
  orderNumber?: string
  items: OrderItem[]
  trigger: LoyversePushTrigger
  /** Skip re-reading the tenant when the caller already holds the row. */
  tenant?: Tenant
}

export interface LoyversePushOutcome extends LoyversePushResult {
  /** true = nothing was attempted (disabled, wrong mode, or already pushed). */
  skipped: boolean
}

const skippedOutcome = (reason?: string): LoyversePushOutcome => ({
  success: false,
  skipped: true,
  unmapped: [],
  error: reason,
})

function triggerMatchesMode(trigger: LoyversePushTrigger, mode: LoyversePushMode): boolean {
  if (trigger === 'manual') return true
  return (trigger === 'create') === (mode === 'on_create')
}

interface MapRow {
  menu_item_id: string | null
  loyverse_variant_id: string | null
}

interface MenuItemRow {
  id: string
  modifier_groups: ModifierGroup[] | null
}

async function loadReceiptCatalog(
  tenantId: string,
  menuItemIds: string[]
): Promise<LoyverseReceiptCatalog> {
  const admin = createAdminClient()
  const catalog: LoyverseReceiptCatalog = {}
  if (menuItemIds.length === 0) return catalog

  const { data: menuItems } = await admin
    .from('menu_items')
    .select('id, modifier_groups')
    .eq('tenant_id', tenantId)
    .in('id', menuItemIds)
  for (const row of (menuItems ?? []) as unknown as MenuItemRow[]) {
    catalog[row.id] = { baseVariantId: null, modifierGroups: row.modifier_groups ?? [] }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mapRows } = await (admin as any)
    .from('loyverse_item_map')
    .select('menu_item_id, loyverse_variant_id')
    .eq('tenant_id', tenantId)
    .eq('kind', 'variant')
    .eq('local_key', '')
    .in('menu_item_id', menuItemIds)
  for (const row of (mapRows ?? []) as MapRow[]) {
    if (row.menu_item_id && catalog[row.menu_item_id]) {
      catalog[row.menu_item_id].baseVariantId = row.loyverse_variant_id
    }
  }

  return catalog
}

interface PlatformOrderItemRow {
  menu_item_id: string | null
  menu_item_name: string
  variation: string | null
  variation_selections: Record<string, string> | null
  addons: string[] | null
  quantity: number
  price: number
  subtotal: number
  special_instructions: string | null
}

/**
 * Platform orders keep their lines in order_items, not on the order row.
 * Ownership is already verified by the orders lookup (tenant-filtered) before
 * this runs; order_items itself is keyed only by order_id.
 */
async function loadPlatformOrderItems(orderId: string): Promise<OrderItem[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('order_items')
    .select('menu_item_id, menu_item_name, variation, variation_selections, addons, quantity, price, subtotal, special_instructions')
    .eq('order_id', orderId)
  return ((data ?? []) as unknown as PlatformOrderItemRow[])
    .filter((row) => row.menu_item_id)
    .map((row) => ({
      menu_item_id: row.menu_item_id as string,
      menu_item_name: row.menu_item_name,
      variation: row.variation ?? undefined,
      variations: row.variation_selections ?? undefined,
      addons: row.addons ?? [],
      quantity: row.quantity,
      price: row.price,
      subtotal: row.subtotal,
      special_instructions: row.special_instructions ?? undefined,
    }))
}

async function recordOutcome(
  orderId: string,
  tenantId: string,
  result: LoyversePushResult
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('orders')
    .update({
      loyverse_receipt_number: result.receiptNumber ?? null,
      loyverse_push_status: result.success ? 'pushed' : 'failed',
      loyverse_pushed_at: result.success ? new Date().toISOString() : null,
      loyverse_push_error: result.error ?? null,
    } as never)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
}

export async function pushOrderToLoyverseBestEffort(
  request: LoyversePushRequest
): Promise<LoyversePushOutcome> {
  try {
    const admin = createAdminClient()

    let tenant = request.tenant ?? null
    if (!tenant) {
      const { data } = await admin
        .from('tenants')
        .select('*')
        .eq('id', request.tenantId)
        .maybeSingle()
      tenant = (data as unknown as Tenant) ?? null
    }
    if (!tenant) return skippedOutcome('Tenant not found')

    const resolved = resolveLoyverseConfig(tenant)
    if (resolved.status !== 'ready') return skippedOutcome()
    if (!triggerMatchesMode(request.trigger, resolved.config.pushMode)) {
      return skippedOutcome()
    }

    if (request.orderId) {
      const { data: orderRow } = await admin
        .from('orders')
        .select('loyverse_receipt_number')
        .eq('id', request.orderId)
        .eq('tenant_id', request.tenantId)
        .maybeSingle()
      const receiptNumber = (orderRow as { loyverse_receipt_number?: string | null } | null)
        ?.loyverse_receipt_number
      if (receiptNumber) {
        return { success: true, skipped: true, receiptNumber, unmapped: [] }
      }
    }

    let orderItems = request.items
    if (orderItems.length === 0 && request.orderId) {
      orderItems = await loadPlatformOrderItems(request.orderId)
    }
    if (orderItems.length === 0) {
      return skippedOutcome('Order has no line items')
    }

    const menuItemIds = [...new Set(orderItems.map((item) => item.menu_item_id))]
    const catalog = await loadReceiptCatalog(request.tenantId, menuItemIds)

    const result = await sendLoyverseReceipt(
      resolved.config,
      { orderNumber: request.orderNumber, items: orderItems },
      catalog
    )

    if (request.orderId) {
      await recordOutcome(request.orderId, request.tenantId, result)
    }
    if (!result.success) {
      console.error('[Loyverse] receipt push failed:', result.error)
    }
    return { ...result, skipped: false }
  } catch (error: unknown) {
    // Best-effort by contract: an exception here must never break checkout or
    // order confirmation.
    const message = error instanceof Error ? error.message : 'Loyverse push failed'
    console.error('[Loyverse] receipt push crashed:', message)
    return { success: false, skipped: false, unmapped: [], error: message }
  }
}
