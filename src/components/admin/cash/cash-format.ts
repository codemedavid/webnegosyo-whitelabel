/**
 * How the cash screens read times, days and money. Manila wall clock, money
 * in centavos (formatted by the reports' own `formatMoney`, so "—" means
 * unknown and a false ₱0 never appears).
 */

import { formatMoney, formatSignedMoney } from '@/lib/reports/format'
import type { CashShiftVerdict } from '@/lib/cash/shifts-read'

const CLOCK = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })
const DAY_SHORT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
const DAY_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "6:02 PM". */
export function clockLabel(iso: string): string {
  return CLOCK.format(new Date(iso)).replace(/ /g, ' ').toUpperCase()
}

/** "Fri, Oct 24" for a YYYY-MM-DD business day. */
export function dayLabel(day: string): string {
  return DAY_SHORT.format(new Date(`${day}T00:00:00.000Z`))
}

/** "Friday". */
export function weekdayLabel(day: string): string {
  return WEEKDAY.format(new Date(`${day}T00:00:00.000Z`))
}

/** "Saturday, Oct 25". */
export function longDayLabel(day: string): string {
  return DAY_LONG.format(new Date(`${day}T00:00:00.000Z`))
}

/** "6:02 PM – 2:48 AM", or "6:02 PM – now" while open. */
export function shiftTimesLabel(openedAt: string, closedAt: string | null): string {
  return `${clockLabel(openedAt)} – ${closedAt ? clockLabel(closedAt) : 'now'}`
}

export type VerdictTone = 'ok' | 'bad' | 'warn' | 'muted'

/** The result pill: a word AND a tone, never colour alone. */
export function verdictPill(verdict: CashShiftVerdict): { text: string; tone: VerdictTone } {
  switch (verdict.kind) {
    case 'open':
      return { text: 'Still open', tone: 'muted' }
    case 'uncounted':
      return { text: 'Not counted', tone: 'warn' }
    case 'exact':
      return { text: 'Exact', tone: 'ok' }
    case 'short':
      return { text: `Short ${formatMoney(Math.abs(verdict.differenceCents ?? 0), { centavos: true })}`, tone: 'bad' }
    case 'over':
      return { text: `Over ${formatMoney(verdict.differenceCents ?? 0, { centavos: true })}`, tone: 'warn' }
  }
}

/** "−₱115" / "+₱5" / "₱0", or "—" when nothing was counted. */
export function netDifferenceLabel(cents: number | null): string {
  return formatSignedMoney(cents, { centavos: true })
}

export { formatMoney }
