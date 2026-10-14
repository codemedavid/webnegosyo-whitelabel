/**
 * Small pure helpers behind the breakdown pages. The figures themselves come
 * from the report functions; this only ranks, shares and classifies them.
 */

import { classifyMenu, type ClassifiableItem, type MenuClassification } from '@/lib/menu-engineering-classify'
import { buildMenuPerformance } from '@/lib/queries/menu-performance-merge'
import type { HourCell, ItemRow } from './sales-breakdowns'

const DAY_MS = 24 * 60 * 60 * 1000

/** A row's share of its column. null when the column sums to nothing: "—", not 0%. */
export function rowShare(value: number, total: number): number | null {
  return total > 0 ? value / total : null
}

export function windowDays(start: number, end: number): number {
  return Math.max(1, Math.round((end - start) / DAY_MS))
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** "Friday 7 PM" for an ISO weekday (1 = Monday) and a Manila hour. */
export function slotLabel(weekday: number, hour: number): string {
  const day = WEEKDAY_NAMES[weekday - 1] ?? `Day ${weekday}`
  return `${day} ${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`
}

/** The busiest slots by orders; ties go to the larger sales, then the earlier slot. Empty slots never count. */
export function busiestHours(cells: readonly HourCell[], limit: number): HourCell[] {
  return cells
    .filter((cell) => cell.orders > 0)
    .toSorted(
      (a, b) =>
        b.orders - a.orders || b.netCents - a.netCents || a.weekday - b.weekday || a.hour - b.hour,
    )
    .slice(0, limit)
}

/**
 * The Menu matrix (plan §2.2: Product Analytics folded into Items), built
 * from the SAME item totals as the table so the two can never disagree.
 * Profitability is ranked by price until recipe costs feed it (Phase 5);
 * `classifyMenu` says so in its warnings.
 */
export function menuMatrix(items: readonly ItemRow[], menu: readonly ClassifiableItem[], days: number): MenuClassification {
  const performance = buildMenuPerformance({
    dataSource: 'platform',
    windowDays: days,
    rows: items
      .filter((row) => !row.isUnrecorded)
      .map((row) => ({ menuItemId: row.menuItemId, name: row.label, quantity: row.quantity, revenue: row.netCents / 100 })),
  })
  return classifyMenu({ items: menu, performance })
}
