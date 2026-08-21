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

export interface LoyverseInventoryLevel {
  variant_id: string
  store_id: string
  in_stock?: number | null
}

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
  const menuItemByVariant = new Map<string, string>()
  const variantsByMenuItem = new Map<string, string[]>()
  for (const row of mapRows) {
    if (row.kind !== 'variant' || !row.menu_item_id || !row.loyverse_variant_id) continue
    menuItemByVariant.set(row.loyverse_variant_id, row.menu_item_id)
    const list = variantsByMenuItem.get(row.menu_item_id) ?? []
    variantsByMenuItem.set(row.menu_item_id, [...list, row.loyverse_variant_id])
  }

  // Last known level per variant, from the map. `undefined` = unknown.
  const knownStock = new Map<string, number | undefined>()
  for (const row of mapRows) {
    if (row.kind !== 'variant' || !row.loyverse_variant_id) continue
    knownStock.set(row.loyverse_variant_id, row.in_stock ?? undefined)
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

  const makeAvailable = new Set<string>()
  const makeUnavailable = new Set<string>()
  for (const menuItemId of touchedMenuItems) {
    const allVariants = variantsByMenuItem.get(menuItemId) ?? []
    // Unknown counts as sellable: a dish stuck invisible because Loyverse
    // never reported a variant is a worse failure than one oversold.
    const anySellable = allVariants.some((variantId) => {
      const stock = knownStock.get(variantId)
      return stock === undefined || stock > 0
    })
    if (anySellable) makeAvailable.add(menuItemId)
    else makeUnavailable.add(menuItemId)
  }

  return {
    makeUnavailable: [...makeUnavailable],
    makeAvailable: [...makeAvailable],
    stockUpdates,
  }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mapRows } = await (admin as any)
    .from('loyverse_item_map')
    .select('kind, local_key, menu_item_id, loyverse_variant_id, in_stock')
    .eq('tenant_id', tenantId)
    .eq('kind', 'variant')

  const changes = partitionAvailabilityChanges(
    levels,
    storeId,
    (mapRows ?? []) as AvailabilityMapRow[]
  )

  if (changes.makeUnavailable.length > 0) {
    await admin
      .from('menu_items')
      .update({ is_available: false } as never)
      .eq('tenant_id', tenantId)
      .in('id', changes.makeUnavailable)
  }
  if (changes.makeAvailable.length > 0) {
    await admin
      .from('menu_items')
      .update({ is_available: true } as never)
      .eq('tenant_id', tenantId)
      .in('id', changes.makeAvailable)
  }

  // Remember the levels so the NEXT single-variant delta can reason about the
  // whole dish. Without this the merge above has nothing to merge over.
  for (const update of changes.stockUpdates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('loyverse_item_map')
      .update({ in_stock: update.in_stock })
      .eq('tenant_id', tenantId)
      .eq('kind', 'variant')
      .eq('loyverse_variant_id', update.variant_id)
  }

  return { disabled: changes.makeUnavailable.length, restored: changes.makeAvailable.length }
}
