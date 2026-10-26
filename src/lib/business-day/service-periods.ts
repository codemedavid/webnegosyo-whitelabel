/**
 * Service periods: the named shifts of a business day ("Day shift 12 PM–8 PM",
 * "Night shift 8 PM–2 AM"). The UI calls them "Shifts"; reports, the day close
 * and the clock-in picker use them to split a day the way the staff work it.
 *
 * Times are Manila wall-clock minutes (`service_periods.starts_minutes` /
 * `ends_minutes`, 0..1439). `ends <= starts` means the period ends on the next
 * calendar day; equal means a full 24 hours.
 *
 * WHICH DAY A PERIOD BELONGS TO: the occurrence that starts on calendar date D
 * belongs to business day D when it starts at or after D's cutoff; a period
 * that starts before the cutoff (a 2 AM graveyard shift with a 4 AM cutoff) is
 * the early-morning end of day D and starts on D + 1. A period is never cut at
 * the cutoff: a night shift is one shift to the people working it, so on a
 * midnight store "Night 8 PM–2 AM" still runs into the next calendar day (and
 * the cutoff suggestion card is how such a store is nudged to a 4 AM day).
 *
 * On the one day a cutoff changes, a period that starts between the old and the
 * new cutoff can occur twice or not at all; `servicePeriodOf` stays well
 * defined because it matches instants against concrete windows.
 *
 * App twin: `webnegosyo-app/lib/business-day/service-periods.ts` (parity test).
 * The stored `ServicePeriod` type and CRUD live in `lib/cash/service-periods.ts`;
 * this module needs only the two times, so any row with them fits.
 */
import { nextBusinessDayKey, previousBusinessDayKey, resolveBusinessDayWindow, type BusinessDayWindow } from '@/lib/inventory/business-day'
import { cutoffMinutesFor, tradingDayOf, type CutoffSchedule } from '@/lib/business-day/trading-day'

export interface ServicePeriodTimes {
  /** Manila wall-clock minutes the period starts at, 0..1439. */
  startsMinutes: number
  /** Manila wall-clock minutes it ends at; <= startsMinutes = the next day. */
  endsMinutes: number
}

export interface ServicePeriodMatch<T extends ServicePeriodTimes> {
  period: T
  /** The business day this occurrence of the period belongs to. */
  dayKey: string
  startIso: string
  endIso: string
}

const MINUTE_MS = 60 * 1000
const MINUTES_PER_DAY = 24 * 60
/** A period can belong to the business day it is found in, or to one of the two before it. */
const DAYS_TO_LOOK_BACK = 2

function assertMinutesOfDay(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY) {
    throw new Error(`A service period's ${field} must be whole minutes 0..${MINUTES_PER_DAY - 1}, got ${value}`)
  }
}

function calendarMidnightMs(dayKey: string): number {
  return Date.parse(resolveBusinessDayWindow(dayKey).startIso)
}

/** Half-open [startIso, endIso) of `period` on business day `dayKey`. */
export function servicePeriodWindow(
  dayKey: string,
  period: ServicePeriodTimes,
  schedule: CutoffSchedule,
): BusinessDayWindow {
  assertMinutesOfDay(period.startsMinutes, 'start')
  assertMinutesOfDay(period.endsMinutes, 'end')
  const startsBeforeCutoff = period.startsMinutes < cutoffMinutesFor(schedule, dayKey)
  const startDayKey = startsBeforeCutoff ? nextBusinessDayKey(dayKey) : dayKey
  const startMs = calendarMidnightMs(startDayKey) + period.startsMinutes * MINUTE_MS
  const lengthMinutes =
    period.endsMinutes > period.startsMinutes
      ? period.endsMinutes - period.startsMinutes
      : period.endsMinutes + MINUTES_PER_DAY - period.startsMinutes
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + lengthMinutes * MINUTE_MS).toISOString(),
  }
}

/**
 * The period running at `iso`, or null between periods (or with none set up).
 *
 * Pass only the periods that apply (not archived, this branch's or every
 * branch's): this module does not know about either. When two windows overlap,
 * the one that started most recently wins, then list order.
 */
export function servicePeriodOf<T extends ServicePeriodTimes>(
  iso: string,
  periods: readonly T[],
  schedule: CutoffSchedule,
): ServicePeriodMatch<T> | null {
  const atMs = Date.parse(iso)
  let dayKey = tradingDayOf(iso, schedule)
  let best: ServicePeriodMatch<T> | null = null
  for (let back = 0; back <= DAYS_TO_LOOK_BACK; back += 1) {
    for (const period of periods) {
      const window = servicePeriodWindow(dayKey, period, schedule)
      const isInside = Date.parse(window.startIso) <= atMs && atMs < Date.parse(window.endIso)
      if (isInside && (best === null || window.startIso > best.startIso)) {
        best = { period, dayKey, ...window }
      }
    }
    dayKey = previousBusinessDayKey(dayKey)
  }
  return best
}
