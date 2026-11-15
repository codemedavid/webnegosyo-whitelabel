/**
 * "When" for every time-based Owl tool: yesterday, last Saturday, Nov 1–10,
 * this month, 2–5 PM on Tuesday.
 *
 * A thin layer over the Reports period engine (`reports/period.ts`), so Owl's
 * "yesterday" is the SAME window the Reports page shows: the store's business
 * day (cutoff schedule) when it has one, Manila midnight otherwise; half-open;
 * a period that contains now is "so far" and is compared at the same elapsed
 * time. One day is compared with the same weekday last week.
 *
 * The model passes calendar dates (it knows today from the context note) and
 * never computes offsets. Pure: `now` and the schedule are passed in.
 */

import { z } from 'zod'
import { MIDNIGHT_SCHEDULE, tradingDayOf, type CutoffSchedule } from '@/lib/business-day/trading-day'
import {
  resolveComparePeriod,
  resolveReportPeriod,
  type ReportPeriodInput,
  type ReportPreset,
} from '@/lib/reports/period'

export const WHEN_PERIODS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'last_90_days',
] as const
export type WhenPeriod = (typeof WHEN_PERIODS)[number]

/**
 * Longest window one question may cover. The sales tools read raw orders for
 * the window AND the one before it, so this bounds the read like the
 * dashboard's 90-day range does; Reports covers longer spans.
 */
export const MAX_WHEN_DAYS = 93

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Spread into a tool's zod input. Field descriptions are terse: they sit in the cached prompt prefix. */
export const whenFields = {
  period: z.enum(WHEN_PERIODS).optional().describe('Named period; ignored when from is set'),
  from: z.string().regex(DAY_KEY).optional().describe('First day YYYY-MM-DD (exact dates, e.g. "last Saturday")'),
  to: z.string().regex(DAY_KEY).optional().describe('Last day YYYY-MM-DD; default = from'),
  fromTime: z.string().regex(CLOCK).optional().describe('HH:MM 24h, single day only'),
  toTime: z.string().regex(CLOCK).optional().describe('HH:MM 24h, single day only'),
}

export const whenSchema = z.object(whenFields)
export type WhenInput = z.infer<typeof whenSchema>

export interface ResolvedWhen {
  /** Half-open [start, end) epoch ms; end = now while the period is still running. */
  start: number
  end: number
  /** First and last business day, YYYY-MM-DD. */
  from: string
  to: string
  dayCount: number
  /** The period contains now: its figures are "so far". */
  isPartial: boolean
  /** "Yesterday", "Tue, Nov 11", "Nov 1 – 10", "Yesterday, 2 PM – 5 PM". */
  label: string
  compare: { start: number; end: number; label: string }
  /** A clock time was asked for a window longer than a day, so it was not applied. */
  timesIgnored: boolean
}

export type WhenResult = { ok: true; when: ResolvedWhen } | { ok: false; error: string }

/** A calendar day key `days` away ("2026-11-13", -1 → "2026-11-12"). Pure date arithmetic, no time zone. */
export function shiftDayKey(dayKey: string, days: number): string {
  const date = new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + days * DAY_MS)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function dayCountBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1
}

function toReportInput(input: WhenInput, today: string, fallback: WhenPeriod): ReportPeriodInput & { labelOverride?: string } {
  if (input.from || input.to) {
    const from = input.from ?? input.to
    return { preset: 'custom', from, to: input.to ?? from }
  }
  const period = input.period ?? fallback
  if (period === 'last_90_days') {
    return { preset: 'custom', from: shiftDayKey(today, -89), to: today, labelOverride: 'Last 90 days' }
  }
  return { preset: period satisfies ReportPreset }
}

export function formatClock(clock: string): string {
  const [hours, minutes] = clock.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return minutes === 0 ? `${display} ${suffix}` : `${display}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/**
 * The instant of a wall-clock time inside the business day that opens at
 * `dayStart`: 1 AM on a store whose day runs 4 AM – 4 AM is the NEXT calendar
 * date's 1 AM, still the same business day.
 */
function clockInBusinessDay(dayKey: string, clock: string, dayStart: number): number {
  const sameDate = Date.parse(`${dayKey}T${clock}:00.000+08:00`)
  return sameDate < dayStart ? sameDate + DAY_MS : sameDate
}

export function resolveWhen(
  input: WhenInput,
  now: number,
  schedule: CutoffSchedule = MIDNIGHT_SCHEDULE,
  fallback: WhenPeriod = 'last_7_days',
): WhenResult {
  const today = tradingDayOf(new Date(now).toISOString(), schedule)
  const reportInput = toReportInput(input, today, fallback)
  if (reportInput.preset === 'custom' && reportInput.from && reportInput.to && reportInput.from > reportInput.to) {
    // Read "Nov 10 to Nov 1" as the range it obviously means.
    const { from, to } = reportInput
    reportInput.from = to
    reportInput.to = from
  }
  const resolved = resolveReportPeriod(reportInput, now, schedule)
  if (!resolved.ok) return resolved
  const period = resolved.period

  const dayCount = dayCountBetween(period.from, period.to)
  if (dayCount > MAX_WHEN_DAYS) {
    return { ok: false, error: `Owl can look at up to ${MAX_WHEN_DAYS} days at a time. Ask for a shorter range, or open Reports for longer ones.` }
  }

  const compare = resolveComparePeriod(period, schedule)
  const base: ResolvedWhen = {
    start: period.start,
    end: period.end,
    from: period.from,
    to: period.to,
    dayCount,
    isPartial: period.isPartial,
    label: reportInput.labelOverride ?? period.label,
    compare: { start: compare.start, end: compare.end, label: compare.label },
    timesIgnored: false,
  }

  if (!input.fromTime && !input.toTime) return { ok: true, when: base }
  if (dayCount !== 1) return { ok: true, when: { ...base, timesIgnored: true } }

  const start = input.fromTime ? Math.max(period.start, clockInBusinessDay(period.from, input.fromTime, period.start)) : period.start
  const asked = input.toTime ? clockInBusinessDay(period.from, input.toTime, period.start) : period.fullEnd
  const end = Math.min(asked, period.fullEnd, now)
  if (start >= now) return { ok: false, error: "That time hasn't happened yet." }
  if (start >= end) return { ok: false, error: 'The end time has to come after the start time.' }

  // The comparison moves by the same amount: 2–5 PM against 2–5 PM a week before.
  const shift = compare.start - period.start
  const times = `${input.fromTime ? formatClock(input.fromTime) : 'start of day'} – ${input.toTime ? formatClock(input.toTime) : 'now'}`
  return {
    ok: true,
    when: {
      ...base,
      start,
      end,
      isPartial: end === now && asked > now,
      label: `${base.label}, ${times}`,
      compare: { start: start + shift, end: end + shift, label: compare.label },
    },
  }
}

/** What the model reads about the window: dates, not epoch numbers. */
export function whenFacts(when: ResolvedWhen): Record<string, unknown> {
  return {
    period: when.label,
    dates: when.from === when.to ? when.from : `${when.from} to ${when.to}`,
    ...(when.isPartial ? { soFar: true } : {}),
    ...(when.timesIgnored ? { note: 'Times only work for a single day; showing whole days.' } : {}),
  }
}
