/**
 * Loyverse inventory_levels.update → local menu availability.
 *
 * Loyverse is the stock authority for synced tenants; when a tracked variant
 * runs dry at the mapped store, the local dish goes to "out of stock"
 * (is_available=false — listed but unorderable, the manual-86 semantics), and
 * comes back when stock does.
 *
 * The decision function is pure and deliberately conservative:
 * - only levels for the tenant's mapped store count;
 * - a multi-variant dish is 86'd only when every one of its variants in the
 *   webhook batch is out — one sold-out size must not hide the whole dish;
 * - any variant back in stock restores the dish (an over-eager restore is a
 *   cheaper mistake than a dish stuck invisible).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  anyVariantSellable,
  groupVariantsByMenuItem,
  type StockLevel,
} from '@/lib/loyverse/stock-levels'

export type LoyverseInventoryLevel = StockLevel

export interface AvailabilityMapRow {
  kind: string
  local_key: string
  menu_item_id: string | null
  loyverse_variant_id: string | null
  /** Last known level at the mapped store; null/absent = unknown, not zero. */
  in_stock?: number | null
}

/** A remembered level to write back, so the next delta has full state. */
export interface VariantStockUpdate {
  variant_id: string
  in_stock: number
}

export interface AvailabilityChanges {
  makeUnavailable: string[]
  makeAvailable: string[]
  stockUpdates: VariantStockUpdate[]
}

export function partitionAvailabilityChanges(
  levels: readonly LoyverseInventoryLevel[],
  storeId: string,
  mapRows: readonly AvailabilityMapRow[]
): AvailabilityChanges {
  const variantsByMenuItem = groupVariantsByMenuItem(mapRows)
  const menuItemByVariant = new Map<string, string>()
  // Last known level per variant, from the map. `undefined` = unknown.
  const knownStock = new Map<string, number | undefined>()
  for (const row of mapRows) {
    if (row.kind !== 'variant' || !row.loyverse_variant_id) continue
    knownStock.set(row.loyverse_variant_id, row.in_stock ?? undefined)
    if (row.menu_item_id) menuItemByVariant.set(row.loyverse_variant_id, row.menu_item_id)
  }

  // Merge this batch over remembered state. Loyverse sends one delta per
  // variant, so the batch alone can never describe a whole dish — deciding
  // from it in isolation is what left multi-variant dishes permanently
  // orderable.
  const stockUpdates: VariantStockUpdate[] = []
  const touchedMenuItems = new Set<string>()
  for (const level of levels) {
    if (level.store_id !== storeId) continue
    const menuItemId = menuItemByVariant.get(level.variant_id)
    if (!menuItemId) continue
    const inStock = level.in_stock ?? 0
    knownStock.set(level.variant_id, inStock)
    stockUpdates.push({ variant_id: level.variant_id, in_stock: inStock })
    touchedMenuItems.add(menuItemId)
  }

  const makeAvailable: string[] = []
  const makeUnavailable: string[] = []
  for (const menuItemId of touchedMenuItems) {
    const variants = variantsByMenuItem.get(menuItemId) ?? []
    if (anyVariantSellable(variants, (variantId) => knownStock.get(variantId))) {
      makeAvailable.push(menuItemId)
    } else {
      makeUnavailable.push(menuItemId)
    }
  }

  return { makeUnavailable, makeAvailable, stockUpdates }
}

/** Groups stock writes by level: one UPDATE per distinct value, not per variant. */
export function groupStockUpdatesByLevel(updates: readonly VariantStockUpdate[]): Map<number, string[]> {
  const grouped = new Map<number, string[]>()
  for (const update of updates) {
    const list = grouped.get(update.in_stock)
    if (list) list.push(update.variant_id)
    else grouped.set(update.in_stock, [update.variant_id])
  }
  return grouped
}

/**
 * Applies the webhook batch: reads the tenant's variant map, partitions, and
 * flips is_available. Returns the counts for the webhook response.
 */
export async function applyLoyverseInventoryLevels(
  tenantId: string,
  storeId: string,
  levels: readonly LoyverseInventoryLevel[]
): Promise<{ disabled: number; restored: number }> {
  const admin = createAdminClient()
  const { data: mapRows, error: mapError } = await admin
    .from('loyverse_item_map')
    .select('kind, local_key, menu_item_id, loyverse_variant_id, in_stock')
    .eq('tenant_id', tenantId)
    .eq('kind', 'variant')
  if (mapError) throw new Error(`Failed to read the Loyverse item map: ${mapError.message}`)

  const changes = partitionAvailabilityChanges(levels, storeId, (mapRows ?? []) as AvailabilityMapRow[])

  const setAvailability = async (ids: string[], isAvailable: boolean): Promise<void> => {
    if (ids.length === 0) return
    const { error } = await admin
      .from('menu_items')
      .update({ is_available: isAvailable })
      .eq('tenant_id', tenantId)
      .in('id', ids)
    if (error) throw new Error(`Failed to update availability: ${error.message}`)
  }

  // Remember the levels so the NEXT single-variant delta can reason about the
  // whole dish. Without this the merge above has nothing to merge over.
  const rememberLevels = [...groupStockUpdatesByLevel(changes.stockUpdates)].map(
    async ([inStock, variantIds]) => {
      const { error } = await admin
        .from('loyverse_item_map')
        .update({ in_stock: inStock })
        .eq('tenant_id', tenantId)
        .eq('kind', 'variant')
        .in('loyverse_variant_id', variantIds)
      if (error) throw new Error(`Failed to remember stock levels: ${error.message}`)
    }
  )

  await Promise.all([
    setAvailability(changes.makeUnavailable, false),
    setAvailability(changes.makeAvailable, true),
    ...rememberLevels,
  ])

  return { disabled: changes.makeUnavailable.length, restored: changes.makeAvailable.length }
}
