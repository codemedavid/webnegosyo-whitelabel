/**
 * Which stretch of days the superadmin "Store activity" screen reports on.
 *
 * Pure, so the URL → window rule is testable without a clock. Days are Manila
 * days — the same boundary the order numbers and the daily report use — and a
 * window is whole days, `[start of fromDay, end of toDay)`, so "last 7 days"
 * means seven calendar days in the shop, today included, not 168 rolling
 * hours that start mid-afternoon.
 *
 * Every malformed input resolves to the default rather than throwing: this
 * reads straight from the query string, and a mistyped date should show last
 * week, not an error page.
 */

import { resolveBusinessDayWindow, toBusinessDayKey } from '@/lib/inventory/business-day'

export type ActivityPreset = 'today' | '7d' | '30d' | '90d' | 'custom'

type NamedPreset = Exclude<ActivityPreset, 'custom'>

export const DEFAULT_ACTIVITY_PRESET: NamedPreset = '7d'

/** A year and a day, so "same date last year" is always reachable. */
export const MAX_ACTIVITY_SPAN_DAYS = 366

const PRESET_DAYS: Record<NamedPreset, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface ActivityWindowParams {
  range?: string | null
  from?: string | null
  to?: string | null
}

export interface ActivityWindow {
  preset: ActivityPreset
  /** First Manila day in the window, `YYYY-MM-DD`. */
  fromDayKey: string
  /** Last Manila day in the window, inclusive. */
  toDayKey: string
  /** Inclusive lower bound, epoch ms. */
  startMs: number
  /** EXCLUSIVE upper bound, epoch ms. */
  endMs: number
  dayCount: number
}

function isPreset(value: string | null | undefined): value is NamedPreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRESET_DAYS, value)
}

/** A real `YYYY-MM-DD`, or null. Rejects "2026-02-31". */
function toDayKeyOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10) === value ? value : null
}

function shiftDayKey(dayKey: string, days: number): string {
  const shifted = Date.parse(`${dayKey}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY
  return new Date(shifted).toISOString().slice(0, 10)
}

function daysInclusive(fromDayKey: string, toDayKey: string): number {
  const span = Date.parse(`${toDayKey}T00:00:00.000Z`) - Date.parse(`${fromDayKey}T00:00:00.000Z`)
  return Math.round(span / MILLISECONDS_PER_DAY) + 1
}

function buildWindow(preset: ActivityPreset, fromDayKey: string, toDayKey: string): ActivityWindow {
  return {
    preset,
    fromDayKey,
    toDayKey,
    startMs: Date.parse(resolveBusinessDayWindow(fromDayKey).startIso),
    endMs: Date.parse(resolveBusinessDayWindow(toDayKey).endIso),
    dayCount: daysInclusive(fromDayKey, toDayKey),
  }
}

function presetWindow(preset: NamedPreset, todayKey: string): ActivityWindow {
  return buildWindow(preset, shiftDayKey(todayKey, 1 - PRESET_DAYS[preset]), todayKey)
}

/** The custom window, or null when the dates cannot make one. */
function customWindow(params: ActivityWindowParams, todayKey: string): ActivityWindow | null {
  const from = toDayKeyOrNull(params.from)
  const to = toDayKeyOrNull(params.to)
  if (!from && !to) return null

  // One date alone still means something: "from" runs to today, "to" is a
  // single day.
  let fromDayKey = from ?? (to as string)
  let toDayKey = to ?? todayKey
  if (fromDayKey > toDayKey) [fromDayKey, toDayKey] = [toDayKey, fromDayKey]

  if (fromDayKey > todayKey) return null
  if (toDayKey > todayKey) toDayKey = todayKey

  if (daysInclusive(fromDayKey, toDayKey) > MAX_ACTIVITY_SPAN_DAYS) {
    fromDayKey = shiftDayKey(toDayKey, 1 - MAX_ACTIVITY_SPAN_DAYS)
  }

  return buildWindow('custom', fromDayKey, toDayKey)
}

/**
 * The window a request asks for. A named preset wins over stray dates; dates
 * with no preset are a custom range; anything unusable is the default.
 */
export function resolveActivityWindow(
  params: ActivityWindowParams,
  nowIso: string
): ActivityWindow {
  const todayKey = toBusinessDayKey(nowIso)

  if (isPreset(params.range)) return presetWindow(params.range, todayKey)

  return customWindow(params, todayKey) ?? presetWindow(DEFAULT_ACTIVITY_PRESET, todayKey)
}
