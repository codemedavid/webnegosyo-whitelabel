/**
 * The two database chores that sit either side of pricing an order.
 *
 * Kept out of `createOrderAction` — which is already 640 lines across three
 * order backends — so the two rules that actually matter are testable on their
 * own:
 *
 *   1. A use is burned only for an order that exists.
 *   2. A failed burn does not fail the order.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { redeemVoucher } from './repository'
import type { PendingRedemption } from './order-pricing'
import type { VoucherChannel } from './types'

type Client = SupabaseClient<Database>

export interface BurnRedemptionsInput {
  tenantId: string
  /** The saved order. Required — there is no burning without one. */
  orderId: string
  channel: VoucherChannel
  redemptions: readonly PendingRedemption[]
  customerKey?: string | null
  outletId?: string | null
  redeemedBy?: string | null
}

export interface BurnRedemptionsResult {
  burned: number
  /** One human-readable line per voucher that could not be burned. */
  failures: readonly string[]
}

/**
 * Burns one use per applied voucher.
 *
 * Call this only after the order row exists. The unique
 * `(voucher_id, order_id)` index makes a retry a no-op rather than a second
 * burn, so a caller that retries the whole action is safe.
 *
 * A failure is collected, not thrown. By this point the customer has paid and
 * the kitchen has the order; failing it to protect a coupon count is the wrong
 * trade. The caller logs what could not be burned.
 */
export async function burnRedemptions(
  client: Client,
  input: BurnRedemptionsInput,
): Promise<BurnRedemptionsResult> {
  if (input.redemptions.length === 0) return { burned: 0, failures: [] }

  let burned = 0
  const failures: string[] = []

  // Sequential on purpose: these are a handful of rows at most, and a serial
  // loop keeps the failure attributable to a specific code.
  for (const redemption of input.redemptions) {
    const result = await redeemVoucher(client, {
      tenantId: input.tenantId,
      voucherId: redemption.voucherId,
      orderId: input.orderId,
      amount: redemption.amount,
      channel: input.channel,
      customerKey: input.customerKey,
      outletId: input.outletId,
      redeemedBy: input.redeemedBy,
    })

    if (result.redeemed) {
      burned += 1
      continue
    }

    failures.push(`${redemption.code}: ${result.error ?? 'unknown error'}`)
  }

  return { burned, failures }
}

/**
 * Category per menu item, for category-scoped vouchers.
 *
 * On a failed query this returns an empty map, which the engine reads as
 * "matches nothing". That is the safe direction: widening a category voucher to
 * the whole cart because a lookup failed would discount items it was never
 * meant to touch.
 */
export async function loadCategoryMap(
  client: Client,
  tenantId: string,
  menuItemIds: readonly string[],
): Promise<Record<string, string>> {
  if (menuItemIds.length === 0) return {}

  const { data, error } = await client
    .from('menu_items')
    .select('id, category_id')
    .eq('tenant_id', tenantId)
    .in('id', menuItemIds as string[])

  if (error || !data) return {}

  const map: Record<string, string> = {}
  for (const row of data as unknown as Array<{ id: string; category_id: string | null }>) {
    if (row.category_id) map[row.id] = row.category_id
  }

  return map
}
