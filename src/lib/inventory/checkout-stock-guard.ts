/**
 * The one decision checkout makes about whether the kitchen can fill a cart.
 *
 * `producible.ts` holds the arithmetic and `stock-graph-read.ts` the read; this
 * is the decision `createOrderAction` calls. It sits beside the live Loyverse
 * check in the same action and answers the question that check never could: not
 * "is this dish above zero?" — which stays true right up until the order that
 * empties the shelf is accepted in full — but "can the kitchen make the number
 * in this cart?".
 *
 * It shares its read with `menu-ceilings.ts`, which caps the customer's
 * quantity stepper, so the number a customer is shown and the number they are
 * refused by come from the same place.
 *
 * Each line is judged in its configuration — base recipe plus the recipes of
 * its selected options and add-ons × portions — exactly as
 * `order-stock-service` will spend it.
 *
 * SILENCE IS THE DEFAULT. Inventory off, a failed read, an empty cart, a dish
 * with no recipe, an ingredient with no row at this branch — every one of those
 * returns "no opinion" rather than a refusal. A wrongly refused order costs a
 * real sale and a customer who does not come back; a wrongly accepted one costs
 * an apology from a merchant who already knew their shelf was thin.
 */

import {
  findCartStockShortfalls,
  describeStockShortfalls,
  type CartStockLine,
} from '@/lib/inventory/producible'
import { readTenantStockGraph, type TenantStockGraph } from '@/lib/inventory/stock-graph-read'
import { expandLinkedStockItems, recipeOptionNames } from '@/lib/inventory/option-stock'

/**
 * The cart as depletion will spend it: a simple-stock option's leftover recipe
 * is dropped (its counter is checked separately), a linked option spends its
 * linked dish's recipe, and each line carries the names of its recipe-bearing
 * picks so a refusal can say "Milk Tea (Pearls)", not just "Milk Tea".
 */
function asDepletionWillSpend(
  lines: readonly CartStockLine[],
  graph: TenantStockGraph,
): CartStockLine[] {
  const catalog = graph.catalog ?? []
  return lines.flatMap((line) => {
    // The label is always the store's own option names — never text from the
    // caller (the preflight's lines come from the browser).
    const selection: CartStockLine = {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      optionIds: line.optionIds,
      addonIds: line.addonIds,
      modifierOptionIds: line.modifierOptionIds,
      addonQuantities: line.addonQuantities,
    }
    const [own, ...linked] = expandLinkedStockItems([selection], catalog, graph.recipes)
    const names = recipeOptionNames(own, catalog, graph.recipes)
    return [{ ...own, ...(names.length > 0 ? { optionLabel: names.join(', ') } : {}) }, ...linked]
  })
}

/** No opinion. Every failure path returns this. */
const NO_OPINION = ''

/**
 * The message to refuse a cart with, or `''` when there is nothing to say.
 *
 * @param outletId the branch the order is being placed against, if any. It
 *   comes from the order being built, never from the customer's payload.
 */
export async function findCheckoutStockShortfallMessage(
  tenantId: string,
  lines: readonly CartStockLine[],
  outletId: string | null = null,
): Promise<string> {
  if (lines.length === 0) return NO_OPINION

  const graph = await readTenantStockGraph(tenantId, outletId)
  if (!graph) return NO_OPINION

  const shortfalls = findCartStockShortfalls(
    asDepletionWillSpend(lines, graph),
    graph.recipes,
    graph.components,
    graph.shelf,
    graph.units,
  )
  if (shortfalls.length === 0) return NO_OPINION

  return describeStockShortfalls(shortfalls, graph.namesByMenuItemId)
}
