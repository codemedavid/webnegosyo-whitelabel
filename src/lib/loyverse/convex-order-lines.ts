/**
 * Turns a Convex order's saved lines into the platform `OrderItem` shape the
 * Loyverse receipt builder consumes.
 *
 * The merchant app can confirm an order from surfaces that never loaded its
 * dishes — the orders list and the register drawer show a total and an item
 * COUNT — so those surfaces can only name the order. The platform reads the
 * lines back out of the tenant's own Convex deployment instead, which is also
 * the stricter trust boundary: nothing about the sale comes from the caller.
 * `/api/inventory/customer-order-stock` resolves Convex orders the same way.
 *
 * Rows are `unknown` on purpose — this is an HTTP response from an external
 * deployment, and a malformed row must drop, never throw.
 */

import type { OrderItem } from '@/types/database'

interface ConvexLine {
  menuItemId?: unknown
  menuItemName?: unknown
  quantity?: unknown
  subtotal?: unknown
  price?: unknown
  variation?: unknown
  variationSelections?: unknown
  addons?: unknown
  specialInstructions?: unknown
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Convex records selections as a list of typed picks; receipts want a map. */
function toVariationsMap(value: unknown): Record<string, string> | undefined {
  if (!Array.isArray(value)) return undefined

  const variations: Record<string, string> = {}
  for (const selection of value) {
    if (typeof selection !== 'object' || selection === null) continue
    const { typeName, optionName } = selection as {
      typeName?: unknown
      optionName?: unknown
    }
    if (typeof typeName === 'string' && typeof optionName === 'string') {
      variations[typeName] = optionName
    }
  }

  // An empty map would be indistinguishable from "no options chosen" to the
  // receipt builder, and it resolves the base variant on `undefined`.
  return Object.keys(variations).length > 0 ? variations : undefined
}

/** Receipt building looks modifier options up by name, so only names travel. */
function toAddonNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((addon) => {
    if (typeof addon !== 'object' || addon === null) return []
    const { name } = addon as { name?: unknown }
    return typeof name === 'string' && name !== '' ? [name] : []
  })
}

export function buildLoyverseOrderItemsFromConvexOrder(
  rows: readonly unknown[]
): OrderItem[] {
  return rows.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []

    const line = row as ConvexLine

    // A deleted dish leaves the name behind and the id empty. Nothing maps to a
    // Loyverse variant without it, and there is nothing safe to guess.
    const menuItemId = optionalString(line.menuItemId)
    if (!menuItemId) return []

    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return []

    const subtotal = Number(line.subtotal)
    if (!Number.isFinite(subtotal)) return []

    // Loyverse prices per line, and `price` on a Convex line is the dish's base
    // price — option surcharges live only in the subtotal. Dividing recovers
    // what the customer actually paid per unit; quantity is positive here.
    const unitPrice = subtotal / quantity

    return [
      {
        menu_item_id: menuItemId,
        menu_item_name: optionalString(line.menuItemName) ?? menuItemId,
        variation: optionalString(line.variation),
        variations: toVariationsMap(line.variationSelections),
        addons: toAddonNames(line.addons),
        quantity,
        price: unitPrice,
        subtotal,
        special_instructions: optionalString(line.specialInstructions),
      },
    ]
  })
}
