/**
 * The thin pair of calls around `apply_presell_order()`.
 *
 * The database function is the real guard — idempotency claim, row lock and
 * conditional decrement in one transaction (migration 20260830120000). This
 * module only translates its three outcomes into shapes the order action can
 * act on, and never mistakes an outage for any of them: 'applied' and
 * 'shortfall' are both definite answers, and a network error is neither.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { PresellCartLine } from '@/lib/presell/availability'

/** The marker `apply_presell_order()` raises when a date cannot cover a sale. */
const SHORTFALL_PATTERN = /PRESELL_SHORTFALL:([^:\s]+):(\d{4}-\d{2}-\d{2})/

/** The service-role client's rpc surface — typed against the generated function signature. */
export type RpcClient = Pick<SupabaseClient<Database>, 'rpc'>

export type PresellApplyResult =
  | { status: 'applied' }
  | { status: 'already_applied' }
  | { status: 'shortfall'; menuItemId: string; presellDate: string }
  | { status: 'error'; message: string }

/** The item and date a shortfall exception names, or null for any other error. */
export function parsePresellShortfall(
  message: string,
): { menuItemId: string; presellDate: string } | null {
  const match = SHORTFALL_PATTERN.exec(message)
  if (!match) return null
  return { menuItemId: match[1], presellDate: match[2] }
}

/**
 * Consume (direction 'sale') or give back (direction 'void') an order's
 * presell allocations. Idempotent per (order, direction) — a repeat reports
 * `already_applied` and moves nothing.
 */
export async function applyPresellOrder(
  supabase: RpcClient,
  tenantId: string,
  orderId: string,
  direction: 'sale' | 'void',
  lines: readonly PresellCartLine[],
): Promise<PresellApplyResult> {
  if (lines.length === 0) return { status: 'applied' }

  const { data, error } = await supabase.rpc('apply_presell_order', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_direction: direction,
    p_lines: lines.map((line) => ({
      menu_item_id: line.menuItemId,
      presell_date: line.presellDate,
      quantity: line.quantity,
    })),
  })

  if (error) {
    const shortfall = parsePresellShortfall(error.message ?? '')
    if (shortfall) return { status: 'shortfall', ...shortfall }
    console.error('[presell] apply_presell_order failed', { tenantId, orderId, direction }, error)
    return { status: 'error', message: error.message ?? 'unknown error' }
  }

  if (data === 'already_applied') return { status: 'already_applied' }
  return { status: 'applied' }
}
