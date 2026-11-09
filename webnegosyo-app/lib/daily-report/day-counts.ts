/**
 * How far a day's counting got, across every shelf that was counted.
 *
 * A store-wide report spans several branches, and each branch opens its own
 * count. Reading only one of them would grade the whole store by a single
 * branch's shelf, so every shelf's latest count is merged: the denominators
 * add up and an ingredient counts once PER SHELF it was counted on.
 *
 * Pure, so the rule is tested without a database. The app keeps a copy that
 * `parity.test.ts` holds identical.
 */

import { judgeCountSession, type CountSessionProgress } from './count-session'

export interface DayCountRow {
  id: string
  outlet_id: string | null
  expected_item_count: number
  closed_at: string | null
}

export interface DayCountMovement {
  inventory_item_id: string
  inventory_count_id: string | null
}

/**
 * `counts` must arrive latest-started first. A shelf recounted in the evening
 * describes how the day ended, so only the first count per shelf is used —
 * the morning's abandoned attempt would otherwise double its denominator.
 *
 * Still running on any shelf = the day's count is still running. Otherwise it
 * closed when the last shelf did.
 */
export function judgeDaysCounts(
  counts: readonly DayCountRow[],
  movements: readonly DayCountMovement[],
): CountSessionProgress | null {
  const seenShelves = new Set<string>()
  const latestPerShelf = counts.filter((count) => {
    const shelf = count.outlet_id ?? 'store-pool'
    if (seenShelves.has(shelf)) return false
    seenShelves.add(shelf)
    return true
  })
  if (latestPerShelf.length === 0) return null

  const countIds = new Set(latestPerShelf.map((count) => count.id))
  const isRunning = latestPerShelf.some((count) => count.closed_at === null)
  const lastClosedAt = latestPerShelf
    .map((count) => count.closed_at)
    .filter((closedAt): closedAt is string => closedAt !== null)
    .sort()
    .pop() ?? null

  return judgeCountSession({
    expectedItemCount: latestPerShelf.reduce((sum, count) => sum + Number(count.expected_item_count), 0),
    // The count id keeps the same ingredient on two shelves as two entries.
    countedItemIds: movements
      .filter((row) => row.inventory_count_id !== null && countIds.has(row.inventory_count_id))
      .map((row) => `${row.inventory_count_id}:${row.inventory_item_id}`),
    closedAt: isRunning ? null : lastClosedAt,
  })
}
