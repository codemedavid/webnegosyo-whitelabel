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
}

export interface AvailabilityChanges {
  makeUnavailable: string[]
  makeAvailable: string[]
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

  const outVariants = new Set<string>()
  const backVariants = new Set<string>()
  for (const level of levels) {
    if (level.store_id !== storeId) continue
    if (!menuItemByVariant.has(level.variant_id)) continue
    if ((level.in_stock ?? 0) > 0) backVariants.add(level.variant_id)
    else outVariants.add(level.variant_id)
  }

  const makeAvailable = new Set<string>()
  for (const variantId of backVariants) {
    makeAvailable.add(menuItemByVariant.get(variantId) as string)
  }

  const makeUnavailable = new Set<string>()
  for (const variantId of outVariants) {
    const menuItemId = menuItemByVariant.get(variantId) as string
    if (makeAvailable.has(menuItemId)) continue
    const allVariants = variantsByMenuItem.get(menuItemId) ?? []
    // 86 only when every variant of the dish present in THIS batch is out.
    // Variants absent from the batch are assumed unchanged-and-in-stock.
    const everyVariantOut = allVariants.every((v) => outVariants.has(v))
    if (everyVariantOut) makeUnavailable.add(menuItemId)
  }

  return {
    makeUnavailable: [...makeUnavailable],
    makeAvailable: [...makeAvailable],
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
    .select('kind, local_key, menu_item_id, loyverse_variant_id')
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

  return { disabled: changes.makeUnavailable.length, restored: changes.makeAvailable.length }
}
