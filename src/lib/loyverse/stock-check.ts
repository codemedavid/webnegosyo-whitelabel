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
import type { LoyverseCatalogStockLevel } from '@/lib/loyverse/catalog-mapper'

export interface StockCheckMapRow {
  kind: string
  menu_item_id: string | null
  loyverse_variant_id: string | null
}

export interface StockCheckLine {
  menu_item_id: string
  menu_item_name: string
}

/**
 * Which ordered dishes Loyverse currently reports as empty.
 *
 * A dish is blocked only when EVERY one of its mapped variants was reported
 * at or below zero for this store. Negative levels count as empty: Loyverse
 * permits them when a sale outruns its receipt.
 */
export function findOutOfStockLines(
  lines: readonly StockCheckLine[],
  levels: readonly LoyverseCatalogStockLevel[],
  storeId: string,
  mapRows: readonly StockCheckMapRow[]
): StockCheckLine[] {
  const variantsByMenuItem = new Map<string, string[]>()
  for (const row of mapRows) {
    if (row.kind !== 'variant' || !row.menu_item_id || !row.loyverse_variant_id) continue
    const list = variantsByMenuItem.get(row.menu_item_id) ?? []
    variantsByMenuItem.set(row.menu_item_id, [...list, row.loyverse_variant_id])
  }

  const reported = new Map<string, number>()
  for (const level of levels) {
    if (level.store_id !== storeId) continue
    reported.set(level.variant_id, level.in_stock ?? 0)
  }

  const blocked: StockCheckLine[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (seen.has(line.menu_item_id)) continue
    const variants = variantsByMenuItem.get(line.menu_item_id) ?? []
    // Not a synced dish — Loyverse has no opinion on it.
    if (variants.length === 0) continue

    const anySellable = variants.some((variantId) => {
      const stock = reported.get(variantId)
      return stock === undefined || stock > 0
    })
    if (anySellable) continue

    seen.add(line.menu_item_id)
    blocked.push({ menu_item_id: line.menu_item_id, menu_item_name: line.menu_item_name })
  }
  return blocked
}

/**
 * Fetches live levels and applies {@link findOutOfStockLines}.
 *
 * Best effort by construction: any failure — network, auth, rate limit —
 * resolves to "nothing blocked" so a Loyverse outage can never stop the
 * merchant taking orders.
 */
export async function findLiveOutOfStockLines(
  tenantId: string,
  accessToken: string,
  storeId: string,
  lines: readonly StockCheckLine[]
): Promise<StockCheckLine[]> {
  if (lines.length === 0) return []
  try {
    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mapRows } = await (admin as any)
      .from('loyverse_item_map')
      .select('kind, menu_item_id, loyverse_variant_id')
      .eq('tenant_id', tenantId)
      .eq('kind', 'variant')
      .in(
        'menu_item_id',
        [...new Set(lines.map((line) => line.menu_item_id))]
      )

    const rows = (mapRows ?? []) as StockCheckMapRow[]
    if (rows.length === 0) return []

    const levels = await loyverseListAll<LoyverseCatalogStockLevel>(
      accessToken,
      '/inventory',
      'inventory_levels',
      { query: { store_ids: storeId } }
    )
    return findOutOfStockLines(lines, levels, storeId, rows)
  } catch {
    // Never let a stock check be the reason an order cannot be placed.
    return []
  }
}
