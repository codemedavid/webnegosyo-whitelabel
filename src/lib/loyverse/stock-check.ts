/**
 * Live Loyverse stock verification at checkout.
 *
 * The local mirror can always be stale — a webhook may be unregistered,
 * disabled by Loyverse after 48h of failures, or simply in flight. Checking
 * stock at the moment the order is placed is the one read that cannot be
 * stale, and it costs a single request per order against a 300 req / 300 s
 * per-merchant budget.
 *
 * The decision is pure so the network half stays trivial and the bias is
 * testable. That bias, matching inventory-sync.ts: only a POSITIVE report of
 * zero blocks a sale. Unknown, untracked, unmapped, or another store never
 * blocks — refusing good orders because Loyverse was quiet is a worse failure
 * than occasionally overselling.
 */

import { loyverseListAll } from '@/lib/loyverse/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/uuid'
import {
  anyVariantSellable,
  groupVariantsByMenuItem,
  levelsForStore,
  type StockLevel,
  type VariantMapRow,
} from '@/lib/loyverse/stock-levels'

export type StockCheckMapRow = VariantMapRow

export interface StockCheckLine {
  menu_item_id: string
  menu_item_name: string
}

/**
 * The checkout waits on this read, and it is advisory (a failure lets the
 * order through), so it gets one short attempt instead of the client's
 * retry-with-backoff budget.
 */
const CHECKOUT_STOCK_TIMEOUT_MS = 4_000

/**
 * Which ordered dishes Loyverse currently reports as empty.
 *
 * A dish is blocked only when EVERY one of its mapped variants was reported
 * at or below zero for this store. Negative levels count as empty: Loyverse
 * permits them when a sale outruns its receipt.
 */
export function findOutOfStockLines(
  lines: readonly StockCheckLine[],
  levels: readonly StockLevel[],
  storeId: string,
  mapRows: readonly StockCheckMapRow[]
): StockCheckLine[] {
  const variantsByMenuItem = groupVariantsByMenuItem(mapRows)
  const reported = levelsForStore(levels, storeId)

  const blocked: StockCheckLine[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (seen.has(line.menu_item_id)) continue
    const variants = variantsByMenuItem.get(line.menu_item_id) ?? []
    // Not a synced dish — Loyverse has no opinion on it.
    if (variants.length === 0) continue
    if (anyVariantSellable(variants, (variantId) => reported.get(variantId))) continue

    seen.add(line.menu_item_id)
    blocked.push({ menu_item_id: line.menu_item_id, menu_item_name: line.menu_item_name })
  }
  return blocked
}

/**
 * Fetches live levels for just the ordered dishes' variants and applies
 * {@link findOutOfStockLines}. It used to page through the store's WHOLE
 * inventory on every checkout.
 *
 * Best effort by construction: any failure — network, auth, rate limit,
 * timeout — resolves to "nothing blocked" so a Loyverse outage can never stop
 * the merchant taking orders.
 */
export async function findLiveOutOfStockLines(
  tenantId: string,
  accessToken: string,
  storeId: string,
  lines: readonly StockCheckLine[]
): Promise<StockCheckLine[]> {
  const menuItemIds = [...new Set(lines.map((line) => line.menu_item_id))].filter((id) => isUuid(id))
  if (menuItemIds.length === 0) return []
  try {
    const admin = createAdminClient()
    const { data: mapRows, error } = await admin
      .from('loyverse_item_map')
      .select('kind, menu_item_id, loyverse_variant_id')
      .eq('tenant_id', tenantId)
      .eq('kind', 'variant')
      .in('menu_item_id', menuItemIds)
    if (error) throw new Error(error.message)

    const rows = (mapRows ?? []) as StockCheckMapRow[]
    const variantIds = [...new Set(rows.flatMap((row) => (row.loyverse_variant_id ? [row.loyverse_variant_id] : [])))]
    if (variantIds.length === 0) return []

    const levels = await loyverseListAll<StockLevel>(accessToken, '/inventory', 'inventory_levels', {
      query: { store_ids: storeId, variant_ids: variantIds.join(',') },
      maxAttempts: 1,
      timeoutMs: CHECKOUT_STOCK_TIMEOUT_MS,
    })
    return findOutOfStockLines(lines, levels, storeId, rows)
  } catch (error: unknown) {
    // Never let a stock check be the reason an order cannot be placed — but
    // say so, or a permanently broken check is indistinguishable from "fine".
    console.error('[Loyverse] live stock check skipped:', error instanceof Error ? error.message : error)
    return []
  }
}
