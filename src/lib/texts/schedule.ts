/**
 * When a campaign is due. Pure.
 *
 * The first half is a port of the merchant app's due-date maths
 * (webnegosyo-app/lib/sms/schedule.ts; parity-tested): Manila wall clock
 * (UTC+8, no DST, so a fixed offset is exact), quiet hours applied last.
 *
 * The second half is the server's rule set (`nextServerDueAt`):
 *  - a one-off goes out once — any run at all finishes it;
 *  - repeats anchor on the latest run (whatever its status, so a cancelled
 *    occurrence is never re-created) or on `scheduled_from`, whichever is
 *    later — a resume never catches up on what was skipped while paused;
 *  - an occurrence more than `MISSED_AFTER_MS` late is MISSED: old promos never
 *    go out late, the caller pauses the campaign instead;
 *  - repeats stop after `endsOn` (Manila date).
 * The store's `sms_settings` quiet window is used, never the campaign's own
 * columns: the claim enforces only the store window.
 */

import type { CampaignSchedule, ScheduleKind } from './types'

const MANILA_OFFSET_MS = 8 * 3_600_000
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000
const WEEKDAY_SEARCH_DAYS = 8
/** An occurrence this late is never sent; the campaign pauses itself. */
export const MISSED_AFTER_MS = 24 * MS_PER_HOUR
/** A queued campaign text that waits longer than this "ran out of time". */
export const DEFAULT_EXPIRY_MS = 72 * MS_PER_HOUR

/** The app's schedule shape (field names kept for parity). */
export interface PhoneSchedule {
  scheduleKind: ScheduleKind
  scheduleTime: string
  scheduleDate: string | null
  scheduleIntervalDays: number | null
  scheduleWeekdays: number[]
  quietHoursStart: string
  quietHoursEnd: string
}

export interface NextDueContext {
  after: Date
  lastRunAt?: Date | null
  createdAt?: Date | null
}

export interface ManilaParts {
  date: string
  time: string
  /** ISO weekday 1=Mon..7=Sun. */
  weekday: number
}

const pad = (value: number): string => String(value).padStart(2, '0')

export function toManilaParts(instant: Date): ManilaParts {
  const local = new Date(instant.getTime() + MANILA_OFFSET_MS)
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    weekday: ((local.getUTCDay() + 6) % 7) + 1,
  }
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0
}

/** The UTC instant of a Manila date + "HH:MM"; null for a malformed date. */
export function manilaInstant(date: string, time: string): Date | null {
  const [year, month, day] = date.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(Date.UTC(year, month - 1, day) + minutesOfDay(time) * MS_PER_MINUTE - MANILA_OFFSET_MS)
}

export function addManilaDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function isWithinQuietHours(time: string, start: string, end: string): boolean {
  const current = minutesOfDay(time)
  const from = minutesOfDay(start)
  const until = minutesOfDay(end)
  if (from === until) return false
  return from < until ? current >= from && current < until : current >= from || current < until
}

export function shiftOutOfQuietHours(due: Date, start: string, end: string): Date {
  const parts = toManilaParts(due)
  if (!isWithinQuietHours(parts.time, start, end)) return due
  const opensToday = minutesOfDay(parts.time) < minutesOfDay(end)
  return manilaInstant(opensToday ? parts.date : addManilaDays(parts.date, 1), end) ?? due
}

function nextDailyOccurrence(after: Date, time: string, notBefore?: string): Date | null {
  const parts = toManilaParts(after)
  const startDate = notBefore && notBefore > parts.date ? notBefore : parts.date
  const sameDay = manilaInstant(startDate, time)
  if (sameDay && sameDay.getTime() > after.getTime()) return sameDay
  return manilaInstant(addManilaDays(startDate, 1), time)
}

function nextWeeklyOccurrence(after: Date, time: string, weekdays: readonly number[]): Date | null {
  if (weekdays.length === 0) return null
  const parts = toManilaParts(after)
  for (let offset = 0; offset < WEEKDAY_SEARCH_DAYS; offset += 1) {
    const candidate = manilaInstant(addManilaDays(parts.date, offset), time)
    if (!candidate || candidate.getTime() <= after.getTime()) continue
    if (weekdays.includes(toManilaParts(candidate).weekday)) return candidate
  }
  return null
}

function nextIntervalOccurrence(schedule: PhoneSchedule, context: NextDueContext): Date | null {
  const interval = schedule.scheduleIntervalDays
  if (!interval || interval <= 0) return null
  const anchor = context.lastRunAt ?? context.createdAt
  if (!anchor) return nextDailyOccurrence(context.after, schedule.scheduleTime)
  return nextDailyOccurrence(context.after, schedule.scheduleTime, addManilaDays(toManilaParts(anchor).date, interval))
}

function computeRawDueAt(schedule: PhoneSchedule, context: NextDueContext): Date | null {
  if (schedule.scheduleKind === 'one_off') {
    if (!schedule.scheduleDate) return null
    const due = manilaInstant(schedule.scheduleDate, schedule.scheduleTime)
    return due && due.getTime() > context.after.getTime() ? due : null
  }
  if (schedule.scheduleKind === 'every_n_days') return nextIntervalOccurrence(schedule, context)
  return nextWeeklyOccurrence(context.after, schedule.scheduleTime, schedule.scheduleWeekdays)
}

/** The app's rule: the first occurrence strictly after `context.after`, held out of quiet hours. */
export function computeNextDueAt(schedule: PhoneSchedule, context: NextDueContext): Date | null {
  const raw = computeRawDueAt(schedule, context)
  return raw ? shiftOutOfQuietHours(raw, schedule.quietHoursStart, schedule.quietHoursEnd) : null
}

// ─── Server rules ────────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'completed' | 'cancelled'

export interface ServerRun {
  dueAt: Date
  status: RunStatus
}

export interface QuietWindow {
  start: string
  end: string
}

export interface ServerDueInput {
  schedule: CampaignSchedule
  /** Set on schedule/resume/switch: nothing before it is caught up. */
  scheduledFrom: Date | null
  createdAt: Date
  runs: readonly ServerRun[]
  quietHours: QuietWindow
  now: Date
}

export type DueState = 'upcoming' | 'due' | 'missed' | 'finished'

export interface ServerDue {
  dueAt: Date | null
  state: DueState
}

export function toPhoneSchedule(schedule: CampaignSchedule, quiet: QuietWindow): PhoneSchedule {
  return {
    scheduleKind: schedule.kind,
    scheduleTime: schedule.time,
    scheduleDate: schedule.date,
    scheduleIntervalDays: schedule.intervalDays,
    scheduleWeekdays: schedule.weekdays,
    quietHoursStart: quiet.start,
    quietHoursEnd: quiet.end,
  }
}

function classify(dueAt: Date, now: Date): ServerDue {
  if (dueAt.getTime() > now.getTime()) return { dueAt, state: 'upcoming' }
  return { dueAt, state: now.getTime() - dueAt.getTime() > MISSED_AFTER_MS ? 'missed' : 'due' }
}

const FINISHED: ServerDue = Object.freeze({ dueAt: null, state: 'finished' }) as ServerDue

function latestRunDue(runs: readonly ServerRun[]): Date | null {
  return runs.reduce<Date | null>((latest, run) => (!latest || run.dueAt > latest ? run.dueAt : latest), null)
}

function oneOffDue(input: ServerDueInput): ServerDue {
  const { schedule, quietHours, now } = input
  if (input.runs.length > 0 || !schedule.date) return FINISHED
  const raw = manilaInstant(schedule.date, schedule.time)
  return raw ? classify(shiftOutOfQuietHours(raw, quietHours.start, quietHours.end), now) : FINISHED
}

/**
 * The unshifted occurrence a stored run's `due_at` came from. A 21:30 send
 * inside a 21:00–07:00 window is stored as next morning 07:00; anchoring on
 * that would push an every-day campaign to every other day and drop the
 * end date's occurrence.
 */
export function rawOccurrenceOf(dueAt: Date, schedule: CampaignSchedule, quiet: QuietWindow): Date {
  const parts = toManilaParts(dueAt)
  if (!isWithinQuietHours(schedule.time, quiet.start, quiet.end) || parts.time !== quiet.end) return dueAt
  const isEvening = minutesOfDay(schedule.time) >= minutesOfDay(quiet.end)
  return manilaInstant(isEvening ? addManilaDays(parts.date, -1) : parts.date, schedule.time) ?? dueAt
}

/** A schedule edited since the last run can map two raw occurrences onto one held time; skip past it. */
const MAX_COLLISION_STEPS = 8

function repeatDue(input: ServerDueInput): ServerDue {
  const { schedule, quietHours } = input
  const phone = toPhoneSchedule(schedule, quietHours)
  const lastStored = latestRunDue(input.runs)
  const lastRaw = lastStored ? rawOccurrenceOf(lastStored, schedule, quietHours) : null
  const from = input.scheduledFrom ?? input.createdAt
  let after = lastRaw && lastRaw > from ? lastRaw : from
  for (let step = 0; step < MAX_COLLISION_STEPS; step += 1) {
    const raw = computeRawDueAt(phone, { after, lastRunAt: lastRaw, createdAt: null })
    if (!raw || (schedule.endsOn && toManilaParts(raw).date > schedule.endsOn)) return FINISHED
    const dueAt = shiftOutOfQuietHours(raw, quietHours.start, quietHours.end)
    if (!lastStored || dueAt.getTime() > lastStored.getTime()) return classify(dueAt, input.now)
    after = raw
  }
  return FINISHED
}

/** The campaign's next server occurrence and whether it is due, missed or done. */
export function nextServerDueAt(input: ServerDueInput): ServerDue {
  return input.schedule.kind === 'one_off' ? oneOffDue(input) : repeatDue(input)
}

/** Shortest gap (days) between consecutive selected weekdays, wrapping the week. */
function weeklyGapDays(weekdays: readonly number[]): number {
  const days = [...new Set(weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (days.length <= 1) return 7
  return days.reduce((gap, day, index) => {
    const next = index === days.length - 1 ? days[0] + 7 : days[index + 1]
    return Math.min(gap, next - day)
  }, 7)
}

/** How long a queued text may wait: 72h, or less when the next occurrence comes sooner. */
export function campaignExpiryMs(schedule: CampaignSchedule): number {
  if (schedule.kind === 'every_n_days' && schedule.intervalDays) return Math.min(DEFAULT_EXPIRY_MS, schedule.intervalDays * MS_PER_DAY)
  if (schedule.kind === 'weekly') return Math.min(DEFAULT_EXPIRY_MS, weeklyGapDays(schedule.weekdays) * MS_PER_DAY)
  return DEFAULT_EXPIRY_MS
}
