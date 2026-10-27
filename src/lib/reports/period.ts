/**
 * Report periods: the one place that turns "This week" into instants.
 *
 * Every report screen, export and insight sentence needs the same answers to
 * "from when to when", "compared with what" and "how fine a chart". Left to
 * each page, they drift (a week that starts on Sunday here, a month cut at UTC
 * there) and two screens show different totals for the same label.
 *
 * - Days are the store's BUSINESS days (`business-day/trading-day.ts`): every
 *   function that names a day takes an optional cutoff `schedule`, and without
 *   one a day is the Manila calendar day of `inventory/business-day.ts`,
 *   exactly as before. Days are not assumed to be 24 h (the day a cutoff
 *   changes is longer or shorter): spans come from day starts. The HOUR grain
 *   stays wall clock.
 * - SQL must agree: `report_sales_by_period` buckets on the Manila calendar
 *   day until its business-day twin ships (`20261027140000`). Until then pass a
 *   schedule to `bucketKey`/`bucketKeys` ONLY where the buckets are built here
 *   in TS, never to zero-fill keys for the SQL buckets.
 * - Windows are half-open [start, end): an order at exactly Manila midnight
 *   belongs to the new day, and consecutive periods never overlap.
 * - Weeks start Monday (ISO 8601).
 * - A period that contains `now` is PARTIAL: its end is `now`, and its figures
 *   are "so far". Its comparison is cut at the same elapsed time, so
 *   "today at 2pm" is never judged against last week's whole day.
 * - Pure: `now` is passed in, nothing reads the clock.
 */
import { z } from 'zod'
import { MIDNIGHT_SCHEDULE, tradingDayOf, tradingDayWindow, type CutoffSchedule } from '@/lib/business-day/trading-day'

export const REPORT_PRESETS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom'] as const
export type ReportPreset = (typeof REPORT_PRESETS)[number]

export const REPORT_PRESET_LABELS: Readonly<Record<ReportPreset, string>> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom',
}

export const DEFAULT_REPORT_PRESET: ReportPreset = 'this_week'

/** Interactive range cap, the same as the SQL report functions. */
export const MAX_REPORT_DAYS = 93

/** Longest range that still reads well one bar per day. */
const MAX_DAY_GRAIN_DAYS = 31

export type ReportGrain = 'hour' | 'day' | 'week' | 'month'

export interface ReportPeriod {
  preset: ReportPreset
  /** First Manila day, YYYY-MM-DD (inclusive). */
  from: string
  /** Last Manila day, YYYY-MM-DD (inclusive). */
  to: string
  /** Half-open [start, end) epoch ms. For a period containing `now`, end = now ("so far"). */
  start: number
  end: number
  /** The period's natural end (end of its last day), had it finished. */
  fullEnd: number
  /** True when the period contains now: its figures are "so far". */
  isPartial: boolean
  grain: ReportGrain
  /** "This week", "Oct 1 – 14", "Tue, Oct 13" … */
  label: string
  /** Mid-sentence: "this week", "today", "on Oct 13", "from Oct 1 to Oct 14". */
  phrase: string
}

export interface ComparePeriod {
  start: number
  end: number
  /** "last week", "the same day last week", "the previous 14 days" … */
  label: string
  /** Reads after "up 12%": "on last week", "on the same day last week" … */
  phrase: string
  kind: 'same_weekday_last_week' | 'previous_period'
}

export interface ReportPeriodInput {
  preset: ReportPreset
  from?: string | null
  to?: string | null
}

export type ReportPeriodResult = { ok: true; period: ReportPeriod } | { ok: false; error: string }

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MANILA_OFFSET_MS = 8 * HOUR_MS
const DAYS_PER_WEEK = 7

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

// ---------------------------------------------------------------------------
// Calendar helpers on YYYY-MM-DD keys
// ---------------------------------------------------------------------------

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRealDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function keyToUtcMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`)
}

function utcMsToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function addDays(dayKey: string, days: number): string {
  return utcMsToKey(keyToUtcMs(dayKey) + days * DAY_MS)
}

function dayCountBetween(from: string, to: string): number {
  return Math.round((keyToUtcMs(to) - keyToUtcMs(from)) / DAY_MS) + 1
}

function mondayOf(dayKey: string): string {
  const weekday = new Date(keyToUtcMs(dayKey)).getUTCDay()
  return addDays(dayKey, -((weekday + 6) % 7))
}

function firstOfMonth(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`
}

function firstOfPreviousMonth(dayKey: string): string {
  return firstOfMonth(addDays(firstOfMonth(dayKey), -1))
}

function dayStartMs(dayKey: string, schedule: CutoffSchedule): number {
  return Date.parse(tradingDayWindow(dayKey, schedule).startIso)
}

function nowToDayKey(ms: number, schedule: CutoffSchedule): string {
  return tradingDayOf(new Date(ms).toISOString(), schedule)
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function monthDay(dayKey: string): string {
  const month = MONTH_NAMES[Number(dayKey.slice(5, 7)) - 1].slice(0, 3)
  return `${month} ${Number(dayKey.slice(8, 10))}`
}

function weekdayName(dayKey: string): string {
  return WEEKDAY_NAMES[new Date(keyToUtcMs(dayKey)).getUTCDay()]
}

function customLabel(from: string, to: string): string {
  if (from === to) return `${weekdayName(from).slice(0, 3)}, ${monthDay(from)}`
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${monthDay(from)}, ${from.slice(0, 4)} – ${monthDay(to)}, ${to.slice(0, 4)}`
  }
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  return `${monthDay(from)} – ${sameMonth ? Number(to.slice(8, 10)) : monthDay(to)}`
}

function customPhrase(from: string, to: string): string {
  return from === to ? `on ${monthDay(from)}` : `from ${monthDay(from)} to ${monthDay(to)}`
}

const PRESET_PHRASES: Readonly<Record<Exclude<ReportPreset, 'custom'>, string>> = {
  today: 'today',
  yesterday: 'yesterday',
  this_week: 'this week',
  last_week: 'last week',
  this_month: 'this month',
  last_month: 'last month',
}

// ---------------------------------------------------------------------------
// Resolving a period
// ---------------------------------------------------------------------------

interface DayRange {
  from: string
  to: string
}

function presetRange(preset: Exclude<ReportPreset, 'custom'>, today: string): DayRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const yesterday = addDays(today, -1)
      return { from: yesterday, to: yesterday }
    }
    case 'this_week':
      return { from: mondayOf(today), to: today }
    case 'last_week': {
      const monday = mondayOf(today)
      return { from: addDays(monday, -7), to: addDays(monday, -1) }
    }
    case 'this_month':
      return { from: firstOfMonth(today), to: today }
    case 'last_month': {
      const thisMonth = firstOfMonth(today)
      return { from: firstOfPreviousMonth(today), to: addDays(thisMonth, -1) }
    }
  }
}

function validateCustomRange(input: ReportPeriodInput, today: string): { ok: true; range: DayRange } | { ok: false; error: string } {
  const { from, to } = input
  if (!from || !to) return { ok: false, error: 'Pick a start date and an end date.' }
  if (!isRealDayKey(from) || !isRealDayKey(to)) {
    return { ok: false, error: "One of those dates doesn't look right. Pick them again from the calendar." }
  }
  if (from > to) return { ok: false, error: 'The start date has to come before the end date.' }
  if (to > today) return { ok: false, error: "The end date can't be in the future." }
  if (dayCountBetween(from, to) > MAX_REPORT_DAYS) {
    return { ok: false, error: `Pick a range of ${MAX_REPORT_DAYS} days or less.` }
  }
  return { ok: true, range: { from, to } }
}

export function grainFor(dayCount: number): ReportGrain {
  if (dayCount <= 1) return 'hour'
  return dayCount <= MAX_DAY_GRAIN_DAYS ? 'day' : 'week'
}

function buildPeriod(preset: ReportPreset, range: DayRange, now: number, schedule: CutoffSchedule): ReportPeriod {
  const start = dayStartMs(range.from, schedule)
  const fullEnd = dayStartMs(addDays(range.to, 1), schedule)
  const isPartial = now < fullEnd
  const isCustom = preset === 'custom'
  return {
    preset,
    from: range.from,
    to: range.to,
    start,
    end: isPartial ? now : fullEnd,
    fullEnd,
    isPartial,
    grain: grainFor(dayCountBetween(range.from, range.to)),
    label: isCustom ? customLabel(range.from, range.to) : REPORT_PRESET_LABELS[preset],
    phrase: isCustom ? customPhrase(range.from, range.to) : PRESET_PHRASES[preset],
  }
}

export function resolveReportPeriod(
  input: ReportPeriodInput,
  now: number,
  schedule: CutoffSchedule = MIDNIGHT_SCHEDULE,
): ReportPeriodResult {
  const today = nowToDayKey(now, schedule)

  if (input.preset !== 'custom') {
    return { ok: true, period: buildPeriod(input.preset, presetRange(input.preset, today), now, schedule) }
  }

  const checked = validateCustomRange(input, today)
  if (!checked.ok) return checked
  return { ok: true, period: buildPeriod('custom', checked.range, now, schedule) }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function compareWindow(start: number, elapsed: number, naturalLength: number, isPartial: boolean) {
  return { start, end: start + (isPartial ? Math.min(elapsed, naturalLength) : naturalLength) }
}

function compareSingleDay(period: ReportPeriod, schedule: CutoffSchedule): ComparePeriod {
  const label = period.isPartial ? 'the same time last week' : 'the same day last week'
  // The same business day last week, cut at the same elapsed time: not
  // `start − 7×24h`, which is wrong by the change when a cutoff moved since.
  const previousStart = dayStartMs(addDays(period.from, -DAYS_PER_WEEK), schedule)
  const previousLength = dayStartMs(addDays(period.from, 1 - DAYS_PER_WEEK), schedule) - previousStart
  const window = compareWindow(previousStart, period.end - period.start, previousLength, period.isPartial)
  return { ...window, label, phrase: `on ${label}`, kind: 'same_weekday_last_week' }
}

function compareMonth(period: ReportPeriod, schedule: CutoffSchedule): ComparePeriod {
  const previousFrom = firstOfPreviousMonth(period.from)
  const previousStart = dayStartMs(previousFrom, schedule)
  const previousLength = dayStartMs(firstOfMonth(period.from), schedule) - previousStart
  const window = compareWindow(previousStart, period.end - period.start, previousLength, period.isPartial)
  const label = period.preset === 'last_month' ? 'the month before' : 'last month'
  return { ...window, label, phrase: `on ${label}`, kind: 'previous_period' }
}

function comparePreviousPeriod(period: ReportPeriod, schedule: CutoffSchedule): ComparePeriod {
  const days = dayCountBetween(period.from, period.to)
  // A running week is still a seven-day week: Mon-Wed is judged against last week's Mon-Wed.
  const previousDays = period.preset === 'this_week' ? DAYS_PER_WEEK : days
  const previousStart = dayStartMs(addDays(period.from, -previousDays), schedule)
  const length = period.start - previousStart
  const window = compareWindow(previousStart, period.end - period.start, length, period.isPartial)
  const label =
    period.preset === 'this_week' ? 'last week'
    : period.preset === 'last_week' ? 'the week before'
    : `the previous ${days} days`
  return { ...window, label, phrase: `on ${label}`, kind: 'previous_period' }
}

/** Pass the same `schedule` the period was resolved with. */
export function resolveComparePeriod(period: ReportPeriod, schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): ComparePeriod {
  if (period.from === period.to) return compareSingleDay(period, schedule)
  if (period.preset === 'this_month' || period.preset === 'last_month') return compareMonth(period, schedule)
  return comparePreviousPeriod(period, schedule)
}

// ---------------------------------------------------------------------------
// Chart buckets (Manila; day/week/month follow the business day, hour is wall clock)
// ---------------------------------------------------------------------------

function wallClockHourKey(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 13)
}

export function bucketKey(ms: number, grain: ReportGrain, schedule: CutoffSchedule = MIDNIGHT_SCHEDULE): string {
  if (grain === 'hour') return wallClockHourKey(ms)
  const day = nowToDayKey(ms, schedule)
  switch (grain) {
    case 'day':
      return day
    case 'week':
      return mondayOf(day)
    case 'month':
      return firstOfMonth(day)
  }
}

function bucketStartMs(key: string, grain: ReportGrain, schedule: CutoffSchedule): number {
  if (grain === 'hour') return Date.parse(`${key}:00:00.000Z`) - MANILA_OFFSET_MS
  return dayStartMs(key, schedule)
}

function nextBucketKey(key: string, grain: ReportGrain, schedule: CutoffSchedule): string {
  switch (grain) {
    case 'hour':
      return wallClockHourKey(bucketStartMs(key, grain, schedule) + HOUR_MS)
    case 'day':
      return addDays(key, 1)
    case 'week':
      return addDays(key, DAYS_PER_WEEK)
    case 'month':
      return firstOfMonth(addDays(firstOfMonth(key), 32))
  }
}

/** Every bucket touching [start, end), in order, for zero-filling a chart. */
export function bucketKeys(
  start: number,
  end: number,
  grain: ReportGrain,
  schedule: CutoffSchedule = MIDNIGHT_SCHEDULE,
): string[] {
  if (end <= start) return []
  const keys: string[] = []
  let key = bucketKey(start, grain, schedule)
  while (bucketStartMs(key, grain, schedule) < end) {
    keys.push(key)
    key = nextBucketKey(key, grain, schedule)
  }
  return keys
}

export type BucketLabelStyle = 'chart' | 'spoken'

function hourLabel(key: string): string {
  const hour = Number(key.slice(11, 13))
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`
}

/**
 * 'chart' is the axis label ("Oct 13", "Week of Oct 12"); 'spoken' is what a
 * sentence needs ("Saturday", "The week of Oct 12").
 */
export function bucketLabel(key: string, grain: ReportGrain, style: BucketLabelStyle = 'chart'): string {
  const isSpoken = style === 'spoken'
  switch (grain) {
    case 'hour':
      return hourLabel(key)
    case 'day':
      return isSpoken ? weekdayName(key) : monthDay(key)
    case 'week':
      return `${isSpoken ? 'The week' : 'Week'} of ${monthDay(key)}`
    case 'month':
      return MONTH_NAMES[Number(key.slice(5, 7)) - 1]
  }
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

export interface ReportSearchParams {
  preset: ReportPreset
  from: string | null
  to: string | null
  branch: string | null
  compare: boolean
}

/** The URL's branch value for orders taken without a branch. */
export const UNASSIGNED_BRANCH = 'unassigned'

const firstValue = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

const presetSchema = z.enum(REPORT_PRESETS)
const branchSchema = z.union([z.literal(UNASSIGNED_BRANCH), z.uuid()])

function realDayOrNull(value: string | undefined): string | null {
  return value !== undefined && isRealDayKey(value) ? value : null
}

export function parseReportSearchParams(raw: Record<string, string | string[] | undefined>): ReportSearchParams {
  const parsedPreset = presetSchema.safeParse(firstValue(raw.period))
  const preset = parsedPreset.success ? parsedPreset.data : DEFAULT_REPORT_PRESET
  const isCustom = preset === 'custom'
  const parsedBranch = branchSchema.safeParse(firstValue(raw.branch))

  return {
    preset,
    from: isCustom ? realDayOrNull(firstValue(raw.from)) : null,
    to: isCustom ? realDayOrNull(firstValue(raw.to)) : null,
    branch: parsedBranch.success ? parsedBranch.data : null,
    compare: firstValue(raw.compare) !== '0',
  }
}

/** Inverse of `parseReportSearchParams`; defaults are left out so URLs stay short. */
export function toReportSearchParams(params: ReportSearchParams): URLSearchParams {
  const query = new URLSearchParams()
  if (params.preset !== DEFAULT_REPORT_PRESET) query.set('period', params.preset)
  if (params.preset === 'custom') {
    if (params.from) query.set('from', params.from)
    if (params.to) query.set('to', params.to)
  }
  if (params.branch) query.set('branch', params.branch)
  if (!params.compare) query.set('compare', '0')
  return query
}
