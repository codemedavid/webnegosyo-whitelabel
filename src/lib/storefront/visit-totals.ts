/**
 * Storefront visit totals for the owner: `storefront_visits` holds one row per
 * store per Manila business day. Pure, so the reader and the copy share it.
 * Visits are advisory (see POST /api/storefront/visit) — encouragement for
 * the owner, never a signal that ticks a step.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export interface VisitTotals {
  total: number
  today: number
}

export interface VisitDayRow {
  day: string
  visits: number
}

/** The Manila calendar date (YYYY-MM-DD) of an instant — the rows' key. */
export function manilaDate(at: Date): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

export function sumVisits(rows: readonly VisitDayRow[], now: Date): VisitTotals {
  const today = manilaDate(now)
  return rows.reduce(
    (totals, row) => ({
      total: totals.total + row.visits,
      today: totals.today + (row.day === today ? row.visits : 0),
    }),
    { total: 0, today: 0 },
  )
}

/** "12 people opened your store · 3 today"; a nudge to share when nobody has yet. */
export function visitLine(totals: VisitTotals): string {
  if (totals.total === 0) return 'Nobody has opened your store yet. Share your link'
  const people = totals.total === 1 ? '1 person' : `${totals.total.toLocaleString('en-PH')} people`
  return totals.today > 0 ? `${people} opened your store · ${totals.today.toLocaleString('en-PH')} today` : `${people} opened your store`
}
