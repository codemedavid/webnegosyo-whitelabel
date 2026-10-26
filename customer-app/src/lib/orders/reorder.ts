import { describeSelections, unitPriceCentavos, validateSelections } from '@/lib/cart/pricing'
import type { CartLine } from '@/lib/cart/cart'
import type { AppMenuItem, AppOrderDetail, AppOrderLine } from '@/lib/contract'

export interface ReorderResult {
  lines: CartLine[]
  /** Names of dishes that could not go back in the bag (gone, sold out, or changed). */
  skipped: string[]
}

/** True when every picked group and option still exists and is available on the dish. */
function picksStillExist(item: AppMenuItem, selections: NonNullable<AppOrderLine['selections']>): boolean {
  return Object.entries(selections).every(([groupId, picks]) => {
    const group = item.modifierGroups.find((candidate) => candidate.id === groupId)
    if (!group) return false
    return Object.keys(picks).every((optionId) =>
      group.options.some((option) => option.id === optionId && option.isAvailable),
    )
  })
}

/**
 * "Order again": each past line back in the bag at today's price with the
 * same picks. A line is skipped rather than guessed when its dish is gone or
 * sold out, or its picks no longer fit the dish.
 */
export function reorderLines(order: AppOrderDetail, items: readonly AppMenuItem[], makeLineId: () => string): ReorderResult {
  return order.lines.reduce<ReorderResult>(
    (result, line) => {
      const item = items.find((candidate) => candidate.id === line.itemId)
      const selections = line.selections
      const isUsable =
        item !== undefined &&
        item.isAvailable &&
        selections !== undefined &&
        picksStillExist(item, selections) &&
        validateSelections(item, selections).isValid
      if (!isUsable || !item || !selections) return { ...result, skipped: [...result.skipped, line.name] }
      const cartLine: CartLine = {
        lineId: makeLineId(),
        itemId: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        selections,
        optionLabels: describeSelections(item, selections),
        quantity: line.quantity,
        unitCentavos: unitPriceCentavos(item, selections),
      }
      return { ...result, lines: [...result.lines, cartLine] }
    },
    { lines: [], skipped: [] },
  )
}
