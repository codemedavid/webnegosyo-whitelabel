/**
 * Pure arithmetic for the stock movement ledger.
 *
 * Every writer of stock — a manual receive, a stocktake, an order depletion —
 * goes through `resolveMovementDelta`, so the signing and unit conversion have
 * exactly one definition. A mistake here corrupts stock silently and for every
 * tenant at once, which is why it lives apart from the database and is tested
 * exhaustively.
 *
 * The ledger is the source of truth: `inventory_items.current_qty` is a running
 * total maintained from these deltas, never edited directly. That is what makes
 * "why is this number wrong?" an answerable question.
 */

import { convertQuantity, type InventoryUnit } from '@/lib/inventory/unit-conversion'

/**
 * Why stock moved. `sale` and `void` are written by order depletion
 * (Phase 4B/4C), `transfer_out`/`transfer_in` by a branch transfer; the rest
 * are merchant actions.
 */
export type StockMovementReason =
  | 'receive'
  | 'stocktake'
  | 'waste'
  | 'sale'
  | 'void'
  | 'transfer_out'
  | 'transfer_in'

/**
 * Movements a merchant records by hand, in the order they are offered.
 *
 * Transfers are deliberately absent. A transfer is two movements that must
 * agree — stock leaving North has to arrive at South — and offering one leg on
 * the manual form would let a merchant write a half-transfer that loses stock
 * with a plausible-looking reason attached. Both legs are written by the
 * transfer document, which owns the pairing.
 */
export const MANUAL_MOVEMENT_REASONS: readonly StockMovementReason[] = [
  'receive',
  'stocktake',
  'waste',
]

export const MOVEMENT_REASON_LABELS: Record<StockMovementReason, string> = {
  receive: 'Received',
  stocktake: 'Counted',
  waste: 'Wasted',
  sale: 'Sold',
  void: 'Order voided',
  transfer_out: 'Sent to branch',
  transfer_in: 'Received from branch',
}

export interface MovementDeltaInput {
  reason: StockMovementReason
  /** Always a magnitude — the reason carries the direction. */
  quantity: number
  /** Unit the merchant entered the quantity in. */
  unit: InventoryUnit
  /** Unit the ingredient is stocked in; the delta is expressed in this. */
  stockUnit: InventoryUnit
  /** On-hand quantity in stock units, needed only to reconcile a stocktake. */
  currentQty: number
}

/**
 * Signed change to apply to `current_qty`, in stock units.
 *
 * A stocktake is the one reason whose quantity is a *count* rather than a
 * change: the merchant reports what is physically there and the ledger records
 * the discrepancy, so the count and the correction are both recoverable later.
 */
export function resolveMovementDelta(input: MovementDeltaInput): number {
  const { reason, quantity, unit, stockUnit, currentQty } = input

  if (quantity < 0) {
    throw new Error('Quantity must be a positive amount — the reason sets the direction')
  }

  const inStockUnit = convertQuantity(quantity, unit, stockUnit)

  switch (reason) {
    case 'receive':
    case 'void':
    case 'transfer_in':
      return inStockUnit
    case 'waste':
    case 'sale':
    case 'transfer_out':
      return -inStockUnit
    case 'stocktake':
      return inStockUnit - currentQty
  }
}

export interface MovingAverageInput {
  currentQty: number
  currentUnitCost: number
  receivedQty: number
  receivedUnitCost: number
}

/**
 * Weighted-average unit cost after a delivery, so a price change is blended in
 * rather than rewriting the cost of stock already on the shelf.
 *
 * Non-positive on-hand stock takes the delivery price outright: stock can go
 * negative when a sale lands before its delivery is recorded, and using that as
 * a weight would produce a nonsense — possibly negative — cost.
 */
export function movingAverageUnitCost(input: MovingAverageInput): number {
  const { currentQty, currentUnitCost, receivedQty, receivedUnitCost } = input
  if (currentQty <= 0) return receivedUnitCost

  const totalQty = currentQty + receivedQty
  if (totalQty <= 0) return receivedUnitCost

  return (currentQty * currentUnitCost + receivedQty * receivedUnitCost) / totalQty
}

/**
 * What the confirm button will do, per reason.
 *
 * A bare "Record" leaves the merchant's own choice off the one control they
 * are about to press. Mid-service the default movement is a delivery, and a
 * delivery ADDS stock and can blend a new cost into the average — so the
 * button says which movement it is writing, and a distracted tap is a thing
 * that can be read rather than a thing that is discovered later.
 *
 * Lives beside `MOVEMENT_REASON_LABELS` for the same reason it does: the
 * merchant app writes the same movements and must not invent its own words.
 */
export const MOVEMENT_ACTION_LABELS: Record<StockMovementReason, string> = {
  receive: 'Record delivery',
  stocktake: 'Record count',
  waste: 'Record waste',
  sale: 'Record sale',
  void: 'Record void',
  transfer_out: 'Send to branch',
  transfer_in: 'Receive from branch',
}
