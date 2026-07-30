/**
 * Pure form mapping for the stock movement dialog.
 *
 * The dialog holds every field as a string while it is being edited; this
 * coerces a draft into the validated service input, reusing the same zod schema
 * the server parses so the merchant sees identical messages either side.
 */

import {
  stockMovementInputSchema,
  type StockMovementInput,
} from '@/lib/inventory/schemas'
import type { StockMovementReason } from '@/lib/inventory/stock-ledger'

export interface StockMovementDraft {
  reason: StockMovementReason
  quantity: string
  unit_id: string
  unit_cost: string
  note: string
}

export const EMPTY_STOCK_DRAFT: StockMovementDraft = {
  reason: 'receive',
  quantity: '',
  unit_id: '',
  unit_cost: '',
  note: '',
}

/**
 * A blank price means "leave the cost alone", never "this delivery was free" —
 * treating it as zero would drag the weighted average toward nothing.
 */
function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * A blank quantity is rejected rather than coerced to 0: zero is a meaningful
 * stocktake ("we ran out"), so it must be typed deliberately.
 */
function requiredNumber(value: string): number {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error('Enter a quantity')
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed)) throw new Error('Quantity must be a number')
  return parsed
}

export function buildStockMovementInput(
  draft: StockMovementDraft,
  inventoryItemId: string,
): StockMovementInput {
  const note = draft.note.trim()
  return stockMovementInputSchema.parse({
    inventory_item_id: inventoryItemId,
    reason: draft.reason,
    quantity: requiredNumber(draft.quantity),
    unit_id: draft.unit_id,
    unit_cost: optionalNumber(draft.unit_cost),
    note: note === '' ? undefined : note,
  })
}

export interface DeliveryPriceUnitCopy {
  /** Field label, naming the unit the merchant is quoting a price in. */
  label: string
  /** Only when the shelf is measured differently; null when there is nothing to convert. */
  conversionHint: string | null
}

/**
 * How the delivery-price field describes itself.
 *
 * A price is per-unit, so it must state WHICH unit. The merchant enters a
 * quantity in whatever unit they buy in, the server converts the price into the
 * ingredient's stock unit, and the two are only sometimes the same — so the
 * label follows the entered unit and the hint appears only when a conversion
 * actually happens. Saying "converted to g" on a gram-entered price is noise
 * that trains merchants to stop reading the line that matters.
 *
 * Pure, and separate from the dialog: the unit picker is a Radix `Select` that
 * cannot be driven under jsdom, so a rule proven only through the widget would
 * not be proven at all.
 */
export function describeDeliveryPriceUnit(
  enteredUnitId: string,
  stockUnitId: string,
  unitLabel: (unitId: string) => string,
): DeliveryPriceUnitCopy {
  // Before the merchant picks anything the dialog is quoting the shelf's unit.
  const effectiveUnitId = enteredUnitId || stockUnitId
  const isConverted = effectiveUnitId !== stockUnitId

  return {
    label: `Cost per ${unitLabel(effectiveUnitId)} (₱, optional)`,
    conversionHint: isConverted
      ? `It is converted to ${unitLabel(stockUnitId)} to match the shelf.`
      : null,
  }
}
