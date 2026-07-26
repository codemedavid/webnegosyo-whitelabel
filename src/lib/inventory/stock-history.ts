/**
 * Turns a ledger row into something a merchant can read.
 *
 * The rule that governs everything here: the number shown must reconcile with
 * the balance beside it. A movement entered as 0.6 kg against an ingredient
 * stocked in grams moved the balance by 600, so the stock-unit delta leads and
 * what was actually typed is carried alongside rather than in place of it.
 *
 * Pure on purpose — no dates are formatted and no React is imported, so the
 * merchant app can render the same history from the same rules.
 */

import type { StockMovement } from '@/types/database'
import { MOVEMENT_REASON_LABELS } from '@/lib/inventory/stock-ledger'

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

export interface StockHistoryContext {
  /** The unit the ingredient is stocked in — what `quantity_delta` is measured in. */
  stockUnitId: string
  unitAbbreviation: (unitId: string) => string
}

export interface StockHistoryEntry {
  id: string
  reasonLabel: string
  /** Signed and in the stock unit, e.g. `+600 g`. Reconciles with the balance. */
  quantityLabel: string
  balanceLabel: string
  /** `entered 0.6 kg`, or null when it would only repeat the delta. */
  enteredLabel: string | null
  direction: 'in' | 'out' | 'none'
  note: string | null
  /** Raw ISO. Formatting a date server-side is a hydration bug — the caller formats. */
  createdAt: string
  /** Written by the order pipeline rather than typed by a person. */
  isAutomatic: boolean
}

function signed(delta: number, unit: string): string {
  if (delta === 0) return `0 ${unit}`
  const sign = delta > 0 ? '+' : '-'
  return `${sign}${formatQuantity(Math.abs(delta))} ${unit}`
}

function direction(delta: number): StockHistoryEntry['direction'] {
  if (delta > 0) return 'in'
  if (delta < 0) return 'out'
  return 'none'
}

/**
 * The entered figure is shown only when it says something the delta does not —
 * i.e. when the merchant typed a different unit from the one stock is kept in.
 */
function enteredLabel(
  movement: StockMovement,
  context: StockHistoryContext,
): string | null {
  const { entered_quantity: quantity, entered_unit_id: unitId } = movement
  if (quantity === null || quantity === undefined) return null
  if (!unitId || unitId === context.stockUnitId) return null

  const abbreviation = context.unitAbbreviation(unitId)
  if (!abbreviation) return null
  return `entered ${formatQuantity(quantity)} ${abbreviation}`
}

export function toStockHistoryEntry(
  movement: StockMovement,
  context: StockHistoryContext,
): StockHistoryEntry {
  const stockUnit = context.unitAbbreviation(context.stockUnitId)

  return {
    id: movement.id,
    reasonLabel: MOVEMENT_REASON_LABELS[movement.reason],
    quantityLabel: signed(movement.quantity_delta, stockUnit),
    balanceLabel: `${formatQuantity(movement.balance_after)} ${stockUnit}`,
    enteredLabel: enteredLabel(movement, context),
    direction: direction(movement.quantity_delta),
    note: movement.note ?? null,
    createdAt: movement.created_at,
    isAutomatic: Boolean(movement.order_id),
  }
}
