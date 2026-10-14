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

import {
  resolveOptionCeilings,
  resolveProducibleUnits,
  type OptionStockCeilings,
} from '@/lib/inventory/producible'
import { readTenantStockGraph, type TenantStockGraph } from '@/lib/inventory/stock-graph-read'
import type { StockOptionCatalogItem } from '@/lib/inventory/option-stock'

/** Menu item id → whole units producible. Absent means no ceiling. */
export type MenuStockCeilings = ReadonlyMap<string, number>

export type { OptionStockCeilings }

/** Everything a storefront needs to know about what the kitchen can make. */
export interface MenuStockAvailability {
  /** Per dish, plain (base recipe only). */
  dishes: MenuStockCeilings
  /**
   * Per dish, per option carrying its own recipe: how many of the dish can be
   * made WITH that option. Zero = that choice is sold out. Absent = no opinion.
   */
  options: OptionStockCeilings
}

const NO_CEILINGS: MenuStockCeilings = new Map()
const NO_AVAILABILITY: MenuStockAvailability = { dishes: NO_CEILINGS, options: new Map() }

/** Options counted by their own simple-stock counter: a leftover recipe on them is never spent. */
function simpleStockOptionIds(catalog: readonly StockOptionCatalogItem[]): Set<string> {
  return new Set(catalog.flatMap((item) => (item.modifier_groups ?? []).flatMap((group) =>
    (group.options ?? []).flatMap((option) => (option.stock_mode === 'simple' ? [option.id] : [])),
  )))
}

function dishCeilings(graph: TenantStockGraph): MenuStockCeilings {
  const ceilings = new Map<string, number>()

  // Only base recipes carry a dish ceiling, matching auto-86: an ingredient
  // used solely by an option or addon leaves the dish sellable in its other
  // configurations — that option gets its own ceiling instead.
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

/**
 * Dish AND option ceilings from ONE read of the stock graph — the same read
 * and arithmetic the checkout guard refuses with, so a choice the storefront
 * shows as available is one checkout will accept.
 *
 * @param outletId the branch being ordered from, if any. A branch sees its own
 *   shelf (an ingredient with no row there is unknown, never zero).
 */
export async function getMenuStockAvailability(
  tenantId: string,
  outletId: string | null = null,
): Promise<MenuStockAvailability> {
  const graph = await readTenantStockGraph(tenantId, outletId)
  if (!graph) return NO_AVAILABILITY

  return {
    dishes: dishCeilings(graph),
    options: resolveOptionCeilings(
      graph.recipes,
      graph.components,
      graph.shelf,
      graph.units,
      simpleStockOptionIds(graph.catalog ?? []),
    ),
  }
}

/**
 * @param outletId the branch being ordered from, if any. A branch sees its own
 *   shelf; a store-wide read sees the roll-up.
 */
export async function getMenuStockCeilings(
  tenantId: string,
  outletId: string | null = null,
): Promise<MenuStockCeilings> {
  return (await getMenuStockAvailability(tenantId, outletId)).dishes
}
