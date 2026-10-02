/**
 * "When did this store last take an order?", in words.
 *
 * Counted in Manila days, so an order at 11:30pm is "Yesterday" the next
 * morning in the shop rather than "Today" because UTC had not turned over.
 */

import { toBusinessDayKey } from '@/lib/inventory/business-day'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365

function safeDayKey(iso: string): string | null {
  try {
    return toBusinessDayKey(iso)
  } catch {
    return null
  }
}

/** Whole Manila days since the order, or null when there is none to read. */
export function daysSinceLastOrder(lastOrderAt: string | null, nowIso: string): number | null {
  if (!lastOrderAt) return null
  const orderDay = safeDayKey(lastOrderAt)
  const today = safeDayKey(nowIso)
  if (!orderDay || !today) return null
  const span = Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${orderDay}T00:00:00.000Z`)
  return Math.max(0, Math.round(span / MILLISECONDS_PER_DAY))
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

export function lastOrderLabel(lastOrderAt: string | null, nowIso: string): string {
  const days = daysSinceLastOrder(lastOrderAt, nowIso)
  if (days === null) return 'Never'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < DAYS_PER_WEEK * 2) return plural(days, 'day')
  if (days < DAYS_PER_MONTH * 2) return plural(Math.floor(days / DAYS_PER_WEEK), 'week')
  if (days < DAYS_PER_YEAR) return plural(Math.floor(days / DAYS_PER_MONTH), 'month')
  return 'Over a year ago'
}
