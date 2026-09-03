/**
 * Every tracked dish's producible ceiling, in one read.
 *
 * The cart guard asks "can this cart be filled?"; a stepper needs the prior
 * question, per dish: "how many of THIS can the kitchen make?". Same graph,
 * same arithmetic — deliberately, so the number a customer is shown and the
 * number they are refused by cannot drift apart.
 *
 * UNTRACKED DISHES ARE ABSENT from the map rather than present with a sentinel.
 * A map answering "no entry" for both "unlimited" and "unknown" is the only
 * shape a caller cannot misread as zero — and misreading it as zero would take
 * a whole uncosted menu off sale.
 */

import { resolveProducibleUnits } from '@/lib/inventory/producible'
import { readTenantStockGraph } from '@/lib/inventory/stock-graph-read'

/** Menu item id → whole units producible. Absent means no ceiling. */
export type MenuStockCeilings = ReadonlyMap<string, number>

const NO_CEILINGS: MenuStockCeilings = new Map()

/**
 * @param outletId the branch being ordered from, if any. A branch sees its own
 *   shelf; a store-wide read sees the roll-up.
 */
export async function getMenuStockCeilings(
  tenantId: string,
  outletId: string | null = null,
): Promise<MenuStockCeilings> {
  const graph = await readTenantStockGraph(tenantId, outletId)
  if (!graph) return NO_CEILINGS

  const ceilings = new Map<string, number>()

  // Only base recipes carry a ceiling, matching auto-86: an ingredient used
  // solely by an option or addon leaves the dish sellable in its other
  // configurations.
  for (const recipe of graph.recipes) {
    if (recipe.target_type !== 'menu_item') continue
    if (!recipe.menu_item_id) continue
    if (ceilings.has(recipe.menu_item_id)) continue

    const units = resolveProducibleUnits(
      { menuItemId: recipe.menu_item_id },
      graph.recipes,
      graph.components,
      graph.shelf,
      graph.units,
    )
    if (units === null) continue // Empty shell, or nothing judgeable in it.

    ceilings.set(recipe.menu_item_id, units)
  }

  return ceilings
}
