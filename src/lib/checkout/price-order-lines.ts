/**
 * Server-side pricing of every line in a checkout, in one pass.
 *
 * Each line is held to the price the storefront showed for it: the dish's
 * effective (sale-aware) price at the chosen branch, plus what its options and
 * add-ons are worth according to the dish's OWN JSON. The browser's price can
 * only raise that; its subtotal is never used; the dish name stored is the
 * menu's, so a cheap dish cannot be sent to the kitchen under a dear name.
 *
 * Pure: the caller loads the rows. Returns new line objects, never mutates.
 */

import { resolveOrderLinePrice, type StoreMenuItemPricing } from '@/lib/order-line-price-floor'
import {
  priceLineModifiers,
  type LinkedModifierItem,
  type ModifierCatalogSource,
  type ModifierSelectionLine,
} from '@/lib/order-line-modifier-pricing'
import {
  findOutletMenuOverride,
  type OutletMenuIndex,
} from '@/lib/outlets/outlet-menu-overrides'

/** Every `menu_items` column line pricing reads. */
export const MENU_ITEM_PRICING_SELECT =
  'id, name, price, discounted_price, is_available, modifier_groups, variation_types, variations, addons'

export type StoreMenuItemRow = StoreMenuItemPricing & ModifierCatalogSource & { name?: string | null }

export interface PriceableOrderLine extends ModifierSelectionLine {
  menu_item_id: string
  menu_item_name: string
  price: number
  quantity: number
  subtotal: number
}

export interface PriceOrderLinesContext {
  storeItems: ReadonlyMap<string, StoreMenuItemRow>
  branchOverrides: OutletMenuIndex
  outletId: string | null
  linkedItems: ReadonlyMap<string, LinkedModifierItem>
}

export type PriceOrderLinesResult<T> =
  | { ok: true; lines: T[]; itemsSubtotal: number }
  | { ok: false; error: string }

const round = (value: number): number => Math.round(value * 100) / 100

function reportSelectionGaps(line: PriceableOrderLine, unknownIds: string[], unpricedLabels: string[]): void {
  if (unknownIds.length === 0 && unpricedLabels.length === 0) return
  // Not a refusal: a stale cart after a menu edit produces exactly this. The
  // log is how a merchant dispute ("I was charged for X") gets answered.
  console.warn('[createOrderAction] Line selections not on the dish', {
    menuItemId: line.menu_item_id,
    unknownIds,
    unpricedLabels,
  })
}

export function priceOrderLines<T extends PriceableOrderLine>(
  lines: readonly T[],
  context: PriceOrderLinesContext
): PriceOrderLinesResult<T> {
  const priced: T[] = []

  for (const line of lines) {
    const storeItem = context.storeItems.get(line.menu_item_id)
    const modifiers = storeItem
      ? priceLineModifiers(line, storeItem, context.linkedItems)
      : { delta: 0, unknownIds: [], unpricedLabels: [] }

    const result = resolveOrderLinePrice(
      line,
      storeItem,
      findOutletMenuOverride(context.branchOverrides, context.outletId, line.menu_item_id),
      modifiers.delta
    )
    if (!result.ok) return { ok: false, error: result.error }

    reportSelectionGaps(line, modifiers.unknownIds, modifiers.unpricedLabels)

    const menuName = typeof storeItem?.name === 'string' && storeItem.name.trim() !== '' ? storeItem.name : line.menu_item_name
    priced.push({ ...line, menu_item_name: menuName, price: result.price, subtotal: result.subtotal })
  }

  return {
    ok: true,
    lines: priced,
    itemsSubtotal: round(priced.reduce((sum, line) => sum + line.subtotal, 0)),
  }
}
