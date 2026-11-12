import { MAX_LINE_QUANTITY, type CartLine } from '@/lib/cart/cart'
import { describeSelections, unitPriceCentavos, type Selections } from '@/lib/cart/pricing'
import type { AppMenuItem } from '@/lib/contract'

export const clampItemQuantity = (quantity: number) => Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)))

/** The bag line for a dish as the customer built it; the server reprices it at checkout anyway. */
export function buildCartLine(item: AppMenuItem, selections: Selections, quantity: number, lineId: string): CartLine {
  return {
    lineId,
    itemId: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    selections,
    optionLabels: describeSelections(item, selections),
    quantity: clampItemQuantity(quantity),
    unitCentavos: unitPriceCentavos(item, selections),
  }
}
