/**
 * One timeline of everything inventory has done.
 *
 * `stock-history.ts` already renders the ledger, but one ingredient at a time —
 * seeing a whole day means opening every ingredient and merging them by hand.
 * And a single order that consumed four ingredients writes four ledger rows, so
 * the raw feed reads as four unrelated events rather than one sale.
 *
 * So this does two things the per-ingredient view cannot: it interleaves every
 * ingredient into one order, and it folds an order's rows back into the one
 * thing that actually happened.
 *
 * Wording is borrowed from `MOVEMENT_REASON_LABELS` rather than restated, so
 * the feed and the per-ingredient history can never call the same event by two
 * different names. Pure, and no dates are formatted — the caller does that.
 */

import { MOVEMENT_REASON_LABELS } from '@/lib/inventory/stock-ledger'
import type { StockMovement } from '@/types/database'

export interface ActivityFeedContext {
  /** Null when the ingredient is gone — costs a name, not the entry. */
  ingredientName: (inventoryItemId: string) => string | null
}

export interface ActivityFeedEntry {
  id: string
  /** `Received Mozzarella`, or just `Sold` when the lines carry the names. */
  title: string
  /** One line per ingredient moved, already signed. */
  lines: string[]
  direction: 'in' | 'out' | 'mixed'
  /** Raw ISO. Earliest row of a group, so a group cannot drift as it grows. */
  createdAt: string
  /** Written by the order pipeline rather than typed by a person. */
  isAutomatic: boolean
}

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

function signed(delta: number): string {
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : '-'}${formatQuantity(Math.abs(delta))}`
}

function resolveDirection(deltas: readonly number[]): ActivityFeedEntry['direction'] {
  const hasIn = deltas.some((delta) => delta > 0)
  const hasOut = deltas.some((delta) => delta < 0)
  if (hasIn && hasOut) return 'mixed'
  return hasIn ? 'in' : 'out'
}

/**
 * Grouped by order AND reason, never by order alone.
 *
 * A cancellation reverses its sale under the same order id. Folding the two
 * together would net them to nothing and erase the fact that an order was
 * cancelled at all — the single most important thing on the feed.
 */
function groupKey(movement: StockMovement): string {
  return movement.order_id ? `${movement.order_id}:${movement.reason}` : `row:${movement.id}`
}

function toEntry(group: readonly StockMovement[], context: ActivityFeedContext): ActivityFeedEntry {
  // Earliest first, so the entry's id and timestamp stay put no matter what
  // order the rows arrived in.
  const rows = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const first = rows[0]
  const verb = MOVEMENT_REASON_LABELS[first.reason]

  // A lone row has room to name its ingredient in the title; a group cannot, so
  // its names go on the lines instead and are not repeated above them.
  if (rows.length === 1) {
    const name = context.ingredientName(first.inventory_item_id)
    return {
      id: first.id,
      title: name ? `${verb} ${name}` : verb,
      lines: [signed(first.quantity_delta)],
      direction: resolveDirection([first.quantity_delta]),
      createdAt: first.created_at,
      isAutomatic: Boolean(first.order_id),
    }
  }

  return {
    id: first.id,
    title: verb,
    lines: rows.map((row) => {
      const name = context.ingredientName(row.inventory_item_id) ?? 'Removed ingredient'
      return `${name} ${signed(row.quantity_delta)}`
    }),
    direction: resolveDirection(rows.map((row) => row.quantity_delta)),
    createdAt: first.created_at,
    isAutomatic: Boolean(first.order_id),
  }
}

/** Newest first — the thing a merchant is standing there wondering about. */
export function buildActivityFeed(
  movements: readonly StockMovement[],
  context: ActivityFeedContext,
): ActivityFeedEntry[] {
  const groups = new Map<string, StockMovement[]>()
  for (const movement of movements) {
    const key = groupKey(movement)
    const existing = groups.get(key)
    if (existing) existing.push(movement)
    else groups.set(key, [movement])
  }

  return [...groups.values()]
    .map((group) => toEntry(group, context))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
