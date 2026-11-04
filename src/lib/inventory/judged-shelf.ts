/**
 * Which ingredients a stock LIMIT may be judged on.
 *
 * Industry rule (Toast, Square, Shopify): tracking starts once a quantity is
 * recorded. An ingredient nobody has ever received or counted
 * (`counted_at` NULL, maintained by the database — 20261103120000) has no
 * limit: its zero is a blank form, not an empty shelf. Before this, a store
 * that set up recipes before its opening count had every dish refused online,
 * while auto-86 — which only saw crossings — never hid them: two opinions
 * about one shelf.
 *
 * One rule for every reader that turns stock into "can this be sold": the
 * checkout guard and the storefront/register ceilings (`stock-graph-read.ts`)
 * and auto-86 (`auto-86-service.ts`), so they can never disagree.
 */

import type { ProducibleStock } from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

/** The columns a judged shelf row needs. `counted_at` must be selected. */
export interface JudgedShelfRow {
  id: string
  stock_unit_id: string
  current_qty: number | string
  is_active: boolean
  counted_at?: string | null
}

/** True once a delivery, count or transfer arrival was ever recorded. */
export function isCounted(row: { counted_at?: string | null }): boolean {
  return Boolean(row.counted_at)
}

/**
 * The shelf a limit may be judged on: counted ingredients whose stock unit is
 * known and whose quantity is a number. Everything else is left off — absent
 * means "no opinion" to `producible.ts` and `auto-86.ts`, never zero.
 */
export function toJudgedShelf(
  rows: readonly JudgedShelfRow[],
  unitsById: ReadonlyMap<string, InventoryUnit>,
): ProducibleStock[] {
  return rows.flatMap((row) => {
    if (!isCounted(row)) return []
    const stockUnit = unitsById.get(row.stock_unit_id)
    const onHand = Number(row.current_qty)
    if (!stockUnit || !Number.isFinite(onHand)) return []
    return [{ id: row.id, current_qty: onHand, is_active: row.is_active, stockUnit }]
  })
}
