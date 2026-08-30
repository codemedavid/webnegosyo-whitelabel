/**
 * The authoritative presell decision `createOrderAction` calls.
 *
 * Direction of failure is the OPPOSITE of `checkout-stock-guard.ts`. There,
 * silence is the default: a failed read must not close a shop that never
 * promised anything. Presell IS a promise — "only 20 on Dec 24" — so once the
 * tenant has the feature on, an unreadable shelf refuses rather than
 * overselling a date the kitchen cannot cover.
 *
 * The tenant flag itself stays fail-open: presell off, or unknowable (the
 * migration not yet applied is exactly this case), means the store behaves as
 * it did before the feature existed. The flag read is the only fail-open step.
 *
 * This guard pre-judges with a customer-readable message; the race-time
 * backstop is `apply_presell_order()` itself, whose conditional decrement can
 * still refuse between this check and the claim.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePresellRemaining } from '@/lib/presell/availability'

/** No opinion. */
const NO_OPINION = ''

/** The refusal when presell is on but its shelf cannot be read. */
const UNVERIFIABLE_MESSAGE =
  'We could not verify pre-order availability. Please try again in a moment.'

/** One order line as the guard judges it. `presellDate` is YYYY-MM-DD. */
export interface PresellGuardLine {
  menuItemId: string
  quantity: number
  presellDate?: string
}

interface PresellMenuItemRow {
  id: string
  name: string
  presell_enabled: boolean
}

interface PresellAllocationReadRow {
  menu_item_id: string
  presell_date: string
  stock_qty: number
  sold_qty: number
}

/** "Dec 24" from "2026-12-24" — hand-rolled like advance-order-utils, no locale drift. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatPresellDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  const monthLabel = MONTHS[Number(month) - 1]
  if (!monthLabel || !day) return dateKey
  return `${monthLabel} ${Number(day)}`
}

/**
 * The message to refuse an order with, or `''` when there is nothing to say.
 */
export async function findPresellViolationMessage(
  tenantId: string,
  lines: readonly PresellGuardLine[],
): Promise<string> {
  if (lines.length === 0) return NO_OPINION

  const supabase = createAdminClient()

  // Fail-open step: an unreadable or absent flag is the feature being off.
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('presell_enabled')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError || !tenant || (tenant as { presell_enabled?: boolean }).presell_enabled !== true) {
    return NO_OPINION
  }

  // From here on the tenant has promised dates; failure refuses.
  const menuItemIds = [...new Set(lines.map((line) => line.menuItemId))]
  const { data: menuItems, error: itemsError } = await supabase
    .from('menu_items')
    .select('id, name, presell_enabled')
    .eq('tenant_id', tenantId)
    .in('id', menuItemIds)
  if (itemsError || !menuItems) {
    console.error('[presell] Menu item read failed', tenantId, itemsError)
    return UNVERIFIABLE_MESSAGE
  }

  const presellItems = new Map(
    (menuItems as PresellMenuItemRow[])
      .filter((item) => item.presell_enabled === true)
      .map((item) => [item.id, item]),
  )
  if (presellItems.size === 0) return NO_OPINION

  // Aggregate the demand per (item, date) so split cart lines cannot each
  // pass a check their sum fails. A presell item without a date is a
  // violation on its own — the date requirement is what presell is.
  const demand = new Map<string, { item: PresellMenuItemRow; presellDate: string; quantity: number }>()
  for (const line of lines) {
    const item = presellItems.get(line.menuItemId)
    if (!item) continue
    if (!line.presellDate) {
      return `${item.name} is a pre-order item — please choose a pickup date for it.`
    }
    const key = `${line.menuItemId}|${line.presellDate}`
    const existing = demand.get(key)
    demand.set(key, {
      item,
      presellDate: line.presellDate,
      quantity: (existing?.quantity ?? 0) + line.quantity,
    })
  }
  if (demand.size === 0) return NO_OPINION

  const { data: allocations, error: allocationsError } = await supabase
    .from('presell_stock')
    .select('menu_item_id, presell_date, stock_qty, sold_qty')
    .eq('tenant_id', tenantId)
    .in('menu_item_id', [...presellItems.keys()])
  if (allocationsError || !allocations) {
    console.error('[presell] Allocation read failed', tenantId, allocationsError)
    return UNVERIFIABLE_MESSAGE
  }

  const remainingByKey = new Map<string, number>()
  for (const row of allocations as PresellAllocationReadRow[]) {
    remainingByKey.set(
      `${row.menu_item_id}|${row.presell_date}`,
      resolvePresellRemaining(row.stock_qty, row.sold_qty),
    )
  }

  for (const [key, { item, presellDate, quantity }] of demand) {
    // A date with no allocation offers zero — the missing row is the refusal.
    const remaining = remainingByKey.get(key) ?? 0
    if (quantity <= remaining) continue

    const dateLabel = formatPresellDate(presellDate)
    if (remaining <= 0) {
      return `${item.name} is sold out for ${dateLabel}. Please pick another date.`
    }
    return `${item.name} has only ${remaining} left for ${dateLabel}.`
  }

  return NO_OPINION
}
