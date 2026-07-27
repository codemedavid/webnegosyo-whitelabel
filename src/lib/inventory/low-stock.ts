/**
 * Low-stock evaluation and crossing detection.
 *
 * Pure by design, like `stock-history.ts`: no React, no Supabase, no
 * formatting. The web admin, the merchant app, and the server-side alert path
 * all need the same answer to "is this ingredient low?", and a second opinion
 * on that question would mean a badge and an alert that disagree.
 *
 * The central distinction is **state vs. crossing**. Being low is a state that
 * persists across every sale until a delivery arrives; alerting on it would
 * mean an alert per sale. Only the movement that carries an ingredient *across*
 * a line is news, so that is what `detectStockCrossings` reports.
 */

/**
 * Quantities are NUMERIC(16,4) in the database, so anything smaller than a
 * ten-thousandth is round-trip dust rather than stock. Reading that dust as
 * remaining stock would keep an exhausted ingredient out of the `out` bucket.
 */
const QUANTITY_EPSILON = 1e-4

export type StockLevel = 'ok' | 'low' | 'out'

/** The subset of `inventory_items` a level decision depends on. */
export interface StockLevelInput {
  id: string
  name: string
  current_qty: number
  reorder_level: number
  is_active: boolean
}

export interface StockCrossing {
  itemId: string
  name: string
  from: StockLevel
  to: StockLevel
  /** On-hand quantity in stock units after the movement. */
  quantity: number
  reorderLevel: number
}

/** Ranked worst-last, so a downward crossing is simply an increase in rank. */
const LEVEL_RANK: Record<StockLevel, number> = { ok: 0, low: 1, out: 2 }

/**
 * Where one ingredient's quantity sits relative to its reorder level.
 *
 * A reorder level of 0 means the merchant never set one, so `low` is never
 * reported for it — otherwise every ingredient would flag the moment stock
 * tracking is switched on. `out` is unconditional: an empty shelf is empty
 * whether or not anyone configured a threshold.
 */
export function evaluateStockLevel(item: {
  current_qty: number
  reorder_level: number
}): StockLevel {
  if (item.current_qty <= QUANTITY_EPSILON) return 'out'
  if (item.reorder_level > 0 && item.current_qty <= item.reorder_level) return 'low'
  return 'ok'
}

/**
 * The ingredients a batch of movements pushed onto a worse level.
 *
 * Takes the pre-movement rows plus the signed deltas that were applied, which
 * is exactly what a caller holds after writing to the ledger — it reads the
 * items to compute the deltas in the first place, so no re-read is needed and
 * no race with the running-total trigger is possible.
 *
 * Upward crossings are deliberately unreported: a delivery restoring stock is
 * not something to interrupt a merchant about.
 */
export function detectStockCrossings(
  before: readonly StockLevelInput[],
  deltas: ReadonlyMap<string, number>,
): StockCrossing[] {
  const crossings: StockCrossing[] = []

  for (const item of before) {
    if (!item.is_active) continue

    const delta = deltas.get(item.id)
    if (delta === undefined) continue

    const quantity = item.current_qty + delta
    const from = evaluateStockLevel(item)
    const to = evaluateStockLevel({ current_qty: quantity, reorder_level: item.reorder_level })
    if (LEVEL_RANK[to] <= LEVEL_RANK[from]) continue

    crossings.push({
      itemId: item.id,
      name: item.name,
      from,
      to,
      quantity,
      reorderLevel: item.reorder_level,
    })
  }

  return crossings
}
