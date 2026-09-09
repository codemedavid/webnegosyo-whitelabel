/**
 * What the merchant's allocation panel says about a dish's presell dates.
 *
 * Pure, like `availability.ts`: the header totals, the upcoming/past split,
 * each date's status, and the plan for filling a range of dates with one
 * stock figure. The panel renders these; it never re-derives them.
 */

import { listDateKeys } from '@/lib/presell/month-grid'
import { resolvePresellRemaining, type PresellAllocationRow } from '@/lib/presell/availability'

export type AllocationStatus = 'open' | 'low' | 'sold-out'

/** At or below this share of stock remaining, a date reads as "low". */
const LOW_SHARE = 0.25

export interface AllocationSummary {
  upcomingDates: number
  offered: number
  sold: number
  remaining: number
  soldOutDates: number
}

export interface AllocationSplit<T extends PresellAllocationRow> {
  /** Today and later, soonest first. */
  upcoming: T[]
  /** Before today, most recent first. */
  past: T[]
}

export interface RangeAllocationPlan {
  toCreate: string[]
  toOverwrite: string[]
  skippedPast: string[]
}

export function splitAllocations<T extends PresellAllocationRow>(
  rows: readonly T[],
  todayKey: string,
): AllocationSplit<T> {
  const byDateAsc = (a: T, b: T) => a.presell_date.localeCompare(b.presell_date)
  return {
    upcoming: rows.filter((r) => r.presell_date >= todayKey).sort(byDateAsc),
    past: rows.filter((r) => r.presell_date < todayKey).sort((a, b) => byDateAsc(b, a)),
  }
}

export function summarizeAllocations(
  rows: readonly PresellAllocationRow[],
  todayKey: string,
): AllocationSummary {
  const { upcoming } = splitAllocations(rows, todayKey)
  return upcoming.reduce<AllocationSummary>(
    (acc, row) => {
      const remaining = resolvePresellRemaining(row.stock_qty, row.sold_qty)
      return {
        upcomingDates: acc.upcomingDates + 1,
        offered: acc.offered + row.stock_qty,
        sold: acc.sold + row.sold_qty,
        remaining: acc.remaining + remaining,
        soldOutDates: acc.soldOutDates + (remaining <= 0 ? 1 : 0),
      }
    },
    { upcomingDates: 0, offered: 0, sold: 0, remaining: 0, soldOutDates: 0 },
  )
}

export function describeAllocationStatus(row: PresellAllocationRow): AllocationStatus {
  const remaining = resolvePresellRemaining(row.stock_qty, row.sold_qty)
  if (remaining <= 0 || row.stock_qty <= 0) return 'sold-out'
  if (remaining / row.stock_qty <= LOW_SHARE) return 'low'
  return 'open'
}

/**
 * Which dates a range fill would touch. Past dates are skipped rather than
 * refused so a merchant dragging "from Monday" on a Wednesday still gets the
 * rest of the week; existing dates are reported so the panel can warn that
 * their stock will be replaced.
 */
export function planRangeAllocation(
  rows: readonly PresellAllocationRow[],
  startKey: string,
  endKey: string,
  todayKey: string,
): RangeAllocationPlan {
  const existing = new Set(rows.map((r) => r.presell_date))
  return listDateKeys(startKey, endKey).reduce<RangeAllocationPlan>(
    (plan, key) => {
      if (key < todayKey) return { ...plan, skippedPast: [...plan.skippedPast, key] }
      if (existing.has(key)) return { ...plan, toOverwrite: [...plan.toOverwrite, key] }
      return { ...plan, toCreate: [...plan.toCreate, key] }
    },
    { toCreate: [], toOverwrite: [], skippedPast: [] },
  )
}
