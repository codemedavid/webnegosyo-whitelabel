/**
 * Backend-agnostic "push this order into Loyverse" entry point, shaped like
 * depleteStockForOrder: best-effort, idempotent, never throws, callable from
 * the checkout action, the web-admin confirm path, and the /api/loyverse route
 * the merchant app uses.
 *
 * Idempotency: a platform order is CLAIMED before anything is sent — one
 * conditional UPDATE flips it to `pending` only when it has no receipt and no
 * live claim — so two confirms racing (web admin + app, two staff) produce one
 * receipt, not two. A claim older than CLAIM_TTL_MS is treated as abandoned
 * (the function died mid-push) and may be re-taken.
 *
 * Convex / tenant-Supabase orders have no platform row (orderId is null);
 * their single-call guarantee is the status transition that triggers the push.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ModifierGroup, OrderItem } from '@/types/database'
import { isUuid } from '@/lib/uuid'
import { resolveLoyverseConfig, type LoyversePushMode } from '@/lib/loyverse/config'
import { loadLoyverseTenant, type LoyverseTenant } from '@/lib/loyverse/tenant'
import {
  sendLoyverseReceipt,
  type LoyverseReceiptCatalog,
  type LoyversePushResult,
} from '@/lib/loyverse/order-push'

type AdminClient = ReturnType<typeof createAdminClient>

export type LoyversePushTrigger = 'create' | 'confirm' | 'manual'

/** How long an in-flight claim blocks a second push before it counts as abandoned. */
export const CLAIM_TTL_MS = 2 * 60 * 1000

export interface LoyversePushRequest {
  tenantId: string
  /** Platform orders row id; null for Convex / tenant-Supabase orders. */
  orderId?: string | null
  orderNumber?: string
  items: OrderItem[]
  trigger: LoyversePushTrigger
  /**
   * Skip re-reading the tenant when the caller already holds its Loyverse
   * columns AND the access token (checkout does).
   */
  tenant?: LoyverseTenant
}

export interface LoyversePushOutcome extends LoyversePushResult {
  /** true = nothing was attempted (disabled, wrong mode, or already pushed). */
  skipped: boolean
}

const skippedOutcome = (reason?: string, receiptNumber?: string): LoyversePushOutcome => ({
  success: Boolean(receiptNumber),
  skipped: true,
  unmapped: [],
  ...(receiptNumber ? { receiptNumber } : {}),
  error: reason,
})

export function triggerMatchesMode(trigger: LoyversePushTrigger, mode: LoyversePushMode): boolean {
  if (trigger === 'manual') return true
  return (trigger === 'create') === (mode === 'on_create')
}

/**
 * Only uuid ids can be looked up: one POS custom line (or a deleted dish's
 * empty id) inside `.in('id', …)` fails the WHOLE query in Postgres, which
 * used to leave every line of the receipt unmapped.
 */
export function receiptMenuItemIds(items: readonly OrderItem[]): string[] {
  return [...new Set(items.map((item) => item.menu_item_id).filter((id) => isUuid(id)))]
}

async function loadReceiptCatalog(
  admin: AdminClient,
  tenantId: string,
  menuItemIds: string[]
): Promise<LoyverseReceiptCatalog> {
  const catalog: LoyverseReceiptCatalog = {}
  if (menuItemIds.length === 0) return catalog

  const [menuItems, mapRows] = await Promise.all([
    admin
      .from('menu_items')
      .select('id, modifier_groups')
      .eq('tenant_id', tenantId)
      .in('id', menuItemIds),
    admin
      .from('loyverse_item_map')
      .select('menu_item_id, loyverse_variant_id')
      .eq('tenant_id', tenantId)
      .eq('kind', 'variant')
      .eq('local_key', '')
      .in('menu_item_id', menuItemIds),
  ])
  if (menuItems.error) throw new Error(`Failed to read menu items: ${menuItems.error.message}`)
  if (mapRows.error) throw new Error(`Failed to read the Loyverse item map: ${mapRows.error.message}`)

  for (const row of (menuItems.data ?? []) as unknown as Array<{ id: string; modifier_groups: ModifierGroup[] | null }>) {
    catalog[row.id] = { baseVariantId: null, modifierGroups: row.modifier_groups ?? [] }
  }
  for (const row of mapRows.data ?? []) {
    const entry = row.menu_item_id ? catalog[row.menu_item_id] : undefined
    if (entry) entry.baseVariantId = row.loyverse_variant_id
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
 * Ownership is already verified by the claim (tenant-filtered) before this
 * runs; order_items itself is keyed only by order_id. A line whose dish was
 * deleted keeps its name, so it is reported as unmapped rather than vanishing.
 */
async function loadPlatformOrderItems(admin: AdminClient, orderId: string): Promise<OrderItem[]> {
  const { data, error } = await admin
    .from('order_items')
    .select('menu_item_id, menu_item_name, variation, variation_selections, addons, quantity, price, subtotal, special_instructions')
    .eq('order_id', orderId)
  if (error) throw new Error(`Failed to read order lines: ${error.message}`)
  return ((data ?? []) as unknown as PlatformOrderItemRow[]).map((row) => ({
    menu_item_id: row.menu_item_id ?? '',
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

type ClaimResult =
  | { claimed: true }
  | { claimed: false; receiptNumber?: string; reason: string }

async function claimPlatformOrder(
  admin: AdminClient,
  orderId: string,
  tenantId: string,
  now: Date
): Promise<ClaimResult> {
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS).toISOString()
  const { data: claimed, error } = await admin
    .from('orders')
    .update({
      loyverse_push_status: 'pending',
      // While pending, pushed_at is the claim time (it is what CLAIM_TTL_MS
      // measures); the outcome below overwrites it.
      loyverse_pushed_at: now.toISOString(),
      loyverse_push_error: null,
    })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .is('loyverse_receipt_number', null)
    // Claimable: never tried, failed, or an abandoned claim. `pushed` is never
    // re-claimed even without a receipt number (Loyverse's reply may omit it).
    .or(
      `loyverse_push_status.is.null,loyverse_push_status.in.(failed,skipped),` +
        `and(loyverse_push_status.eq.pending,loyverse_pushed_at.lt."${staleBefore}")`
    )
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Failed to claim the order for Loyverse: ${error.message}`)
  if (claimed) return { claimed: true }

  const { data: current } = await admin
    .from('orders')
    .select('loyverse_receipt_number, loyverse_push_status')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!current) return { claimed: false, reason: 'Order not found' }
  if (current.loyverse_receipt_number || current.loyverse_push_status === 'pushed') {
    return { claimed: false, receiptNumber: current.loyverse_receipt_number ?? undefined, reason: 'Already pushed' }
  }
  return { claimed: false, reason: 'A Loyverse push for this order is already in progress' }
}

async function recordOutcome(
  admin: AdminClient,
  orderId: string,
  tenantId: string,
  result: LoyversePushResult
): Promise<void> {
  const { error } = await admin
    .from('orders')
    .update({
      loyverse_receipt_number: result.receiptNumber ?? null,
      loyverse_push_status: result.success ? 'pushed' : 'failed',
      loyverse_pushed_at: result.success ? new Date().toISOString() : null,
      loyverse_push_error: result.error ?? null,
    })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
  if (error) console.error('[Loyverse] could not record the push outcome:', error.message)
}

async function pushClaimed(
  admin: AdminClient,
  request: LoyversePushRequest,
  tenant: LoyverseTenant
): Promise<LoyversePushOutcome> {
  const resolved = resolveLoyverseConfig(tenant)
  if (resolved.status !== 'ready') return skippedOutcome('Loyverse is not configured')

  let orderItems = request.items
  if (orderItems.length === 0 && request.orderId) {
    orderItems = await loadPlatformOrderItems(admin, request.orderId)
  }
  if (orderItems.length === 0) return skippedOutcome('Order has no line items')

  const catalog = await loadReceiptCatalog(admin, request.tenantId, receiptMenuItemIds(orderItems))
  const result = await sendLoyverseReceipt(
    resolved.config,
    { orderNumber: request.orderNumber, items: orderItems },
    catalog
  )
  if (!result.success) console.error('[Loyverse] receipt push failed:', result.error)
  return { ...result, skipped: false }
}

export async function pushOrderToLoyverseBestEffort(
  request: LoyversePushRequest
): Promise<LoyversePushOutcome> {
  let claimedOrderId: string | null = null
  let admin: AdminClient | null = null
  try {
    admin = createAdminClient()
    const tenant = request.tenant ?? (await loadLoyverseTenant(admin, request.tenantId))
    if (!tenant) return skippedOutcome('Tenant not found')

    const resolved = resolveLoyverseConfig(tenant)
    if (resolved.status === 'disabled') return skippedOutcome()
    if (resolved.status === 'incomplete') {
      return skippedOutcome(`Loyverse configuration incomplete: missing ${resolved.missing.join(', ')}`)
    }
    if (!triggerMatchesMode(request.trigger, resolved.config.pushMode)) return skippedOutcome()

    if (request.orderId) {
      const claim = await claimPlatformOrder(admin, request.orderId, request.tenantId, new Date())
      if (!claim.claimed) return skippedOutcome(claim.reason, claim.receiptNumber)
      claimedOrderId = request.orderId
    }

    const outcome = await pushClaimed(admin, request, tenant)
    if (claimedOrderId) {
      await recordOutcome(admin, claimedOrderId, request.tenantId, outcome.skipped
        ? { ...outcome, success: false }
        : outcome)
    }
    return outcome
  } catch (error: unknown) {
    // Best-effort by contract: an exception here must never break checkout or
    // order confirmation. A held claim is released as `failed` so the next
    // confirm can retry instead of waiting out CLAIM_TTL_MS.
    const message = error instanceof Error ? error.message : 'Loyverse push failed'
    console.error('[Loyverse] receipt push crashed:', message)
    const outcome: LoyversePushOutcome = { success: false, skipped: false, unmapped: [], error: message }
    if (admin && claimedOrderId) {
      await recordOutcome(admin, claimedOrderId, request.tenantId, outcome).catch(() => undefined)
    }
    return outcome
  }
}
