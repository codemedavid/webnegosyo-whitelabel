/**
 * The business ("trading") day: the day a sale counts toward, from the store's
 * point of view.
 *
 * A bar that closes at 2 AM sells Friday's last rounds on Saturday's calendar
 * date. With the plain Manila day, those sales land on Saturday, the night
 * shift's report is split in two and the order number resets mid-service. A
 * store therefore picks a CUTOFF (00:00 to 11:45, in 15-minute steps): day D
 * runs from D + cutoff(D) to D+1 + cutoff(D+1), half-open, and is named after
 * the calendar date it STARTS on, the way Toast and Square name it.
 *
 * The cutoff is EFFECTIVE-DATED (`business_day_cutoffs`): a change applies from
 * a future day only, so past days keep their bounds forever and the day of the
 * change is simply longer or shorter than 24 h. NO ROW = MANILA MIDNIGHT: an
 * empty schedule gives exactly `inventory/business-day.ts`, the day every report
 * used before 2026-10-27 (pinned by the property tests).
 *
 * SQL twin: `business_day_cutoff_for` / `business_day_of` / `business_day_bounds`
 * (`20261027120000_business_day_cutoffs.sql`). Change both together.
 *
 * App twin: `webnegosyo-app/lib/business-day/trading-day.ts`, text-identical
 * apart from the import lines (`lib/business-day/parity.test.ts`). The app has
 * no zod, which is why the row check below is written by hand.
 *
 * Pure: nothing here reads the clock or the network.
 */
import {
  nextBusinessDayKey,
  previousBusinessDayKey,
  resolveBusinessDayWindow,
  toBusinessDayKey,
  type BusinessDayWindow,
} from '@/lib/inventory/business-day'

export interface CutoffChange {
  /** First business day (YYYY-MM-DD) that starts at this cutoff. */
  effectiveFrom: string
  /** Minutes after Manila midnight, 0..705 in 15-minute steps. */
  cutoffMinutes: number
}

/** Ascending by `effectiveFrom`; empty = Manila midnight. */
export type CutoffSchedule = readonly CutoffChange[]

export const MIDNIGHT_SCHEDULE: CutoffSchedule = Object.freeze([])

/** The latest cutoff the setting allows: 11:45 AM. A day that starts in the evening is nonsense. */
export const MAX_CUTOFF_MINUTES = 705
export const CUTOFF_STEP_MINUTES = 15

const MINUTE_MS = 60 * 1000
const MINUTES_PER_DAY = 24 * 60
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A Friday, so the example reads "Fri … Sat". Its date is never shown. */
const EXAMPLE_DAY_KEY = '2026-10-23'

export function isValidCutoffMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CUTOFF_MINUTES &&
    value % CUTOFF_STEP_MINUTES === 0
  )
}

function isRealDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return false
  // `Date.parse` rolls "2026-02-30" over on some engines; the round trip refuses it.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function readField(row: Record<string, unknown>, camel: string, snake: string): unknown {
  return camel in row ? row[camel] : row[snake]
}

function parseCutoffRow(row: unknown, index: number): CutoffChange {
  if (typeof row !== 'object' || row === null) {
    throw new Error(`Business day cutoff row ${index} is not an object`)
  }
  const record = row as Record<string, unknown>
  const effectiveFrom = readField(record, 'effectiveFrom', 'effective_from')
  const cutoffMinutes = readField(record, 'cutoffMinutes', 'cutoff_minutes')
  if (!isRealDayKey(effectiveFrom)) {
    throw new Error(`Business day cutoff row ${index} has no valid effective date`)
  }
  if (!isValidCutoffMinutes(cutoffMinutes)) {
    throw new Error(`Business day cutoff row ${index} has an invalid cutoff (${String(cutoffMinutes)})`)
  }
  return { effectiveFrom, cutoffMinutes }
}

/**
 * Validates `business_day_cutoffs` rows (snake_case from the database, or this
 * module's own camelCase from a cached copy) into a sorted schedule.
 *
 * Throws on anything malformed: a wrong schedule silently moves money between
 * days, so a reader either gets a schedule it can trust or an error it must
 * handle (writers fail closed, displays fall back to midnight and say so).
 */
export function parseCutoffSchedule(rows: unknown): CutoffSchedule {
  if (!Array.isArray(rows)) throw new Error('Business day cutoffs must be a list')
  const parsed = rows.map(parseCutoffRow)
  const sorted = [...parsed].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0))
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].effectiveFrom === sorted[i - 1].effectiveFrom) {
      throw new Error(`Two business day cutoffs start on ${sorted[i].effectiveFrom}`)
    }
  }
  return Object.freeze(sorted)
}

/** The cutoff in effect for the day that STARTS on `dayKey` (0 before the first row). */
export function cutoffMinutesFor(schedule: CutoffSchedule, dayKey: string): number {
  let latest: CutoffChange | null = null
  for (const change of schedule) {
    if (change.effectiveFrom <= dayKey && (latest === null || change.effectiveFrom > latest.effectiveFrom)) {
      latest = change
    }
  }
  return latest === null ? 0 : latest.cutoffMinutes
}

function dayStartMs(dayKey: string, schedule: CutoffSchedule): number {
  const midnight = Date.parse(resolveBusinessDayWindow(dayKey).startIso)
  return midnight + cutoffMinutesFor(schedule, dayKey) * MINUTE_MS
}

/**
 * Which business day an instant belongs to.
 *
 * A cutoff is at most 11:45, so day c starts no later than c 11:45 and day c−1
 * starts before c 00:00: an instant on calendar date c is in day c or c−1.
 */
export function tradingDayOf(iso: string, schedule: CutoffSchedule): string {
  const calendarDay = toBusinessDayKey(iso)
  return Date.parse(iso) >= dayStartMs(calendarDay, schedule) ? calendarDay : previousBusinessDayKey(calendarDay)
}

/** Half-open [startIso, endIso) of one business day. Consecutive days tile exactly. */
export function tradingDayWindow(dayKey: string, schedule: CutoffSchedule): BusinessDayWindow {
  return {
    startIso: new Date(dayStartMs(dayKey, schedule)).toISOString(),
    endIso: new Date(dayStartMs(nextBusinessDayKey(dayKey), schedule)).toISOString(),
  }
}

/** 24 h, except on the day before a cutoff change (24 h + the change). */
export function tradingDayLengthMs(dayKey: string, schedule: CutoffSchedule): number {
  return dayStartMs(nextBusinessDayKey(dayKey), schedule) - dayStartMs(dayKey, schedule)
}

function clockLabel(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60)
  const minutes = minutesOfDay % 60
  const suffix = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function weekdayOf(dayKey: string): string {
  return WEEKDAYS[new Date(`${dayKey}T00:00:00.000Z`).getUTCDay()]
}

/**
 * The words the setting shows: "4:00 AM" and
 * "Sales from Fri 4:00 AM until Sat 3:59 AM count as Friday."
 */
export function describeCutoff(cutoffMinutes: number): { label: string; example: string } {
  if (!isValidCutoffMinutes(cutoffMinutes)) {
    throw new Error(`A business day cutoff is 0 to ${MAX_CUTOFF_MINUTES} minutes in ${CUTOFF_STEP_MINUTES}-minute steps`)
  }
  const lastMinute = (cutoffMinutes + MINUTES_PER_DAY - 1) % MINUTES_PER_DAY
  const endDayKey = cutoffMinutes === 0 ? EXAMPLE_DAY_KEY : nextBusinessDayKey(EXAMPLE_DAY_KEY)
  const startDay = weekdayOf(EXAMPLE_DAY_KEY)
  const label = cutoffMinutes === 0 ? '12:00 AM (midnight)' : clockLabel(cutoffMinutes)
  return {
    label,
    example:
      `Sales from ${startDay.slice(0, 3)} ${clockLabel(cutoffMinutes)} until ` +
      `${weekdayOf(endDayKey).slice(0, 3)} ${clockLabel(lastMinute)} count as ${startDay}.`,
  }
}
