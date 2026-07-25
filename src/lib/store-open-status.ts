/**
 * Storefront open/closed status derived from a tenant's operating hours.
 *
 * `operating-hours.ts` models the stored config and constrains *advance-order slot
 * generation*. This module answers a different question: is the shop taking orders
 * RIGHT NOW, and if not, when does it reopen?
 *
 * Two rules keep this from ever breaking an existing store:
 *
 *  1. Opt-in only. Ordering is blocked solely when the merchant flips
 *     `enforce_operating_hours`. Every tenant that set hours purely for advance
 *     scheduling keeps taking ASAP orders exactly as before.
 *  2. Only an explicit configuration closes a store. Missing hours, malformed JSON,
 *     or a weekday absent from the config all resolve to "open" — never to a
 *     silently shuttered storefront.
 *
 * Time is read from the STORE's wall clock (tenant `timezone`), not the visitor's,
 * so a Manila shop is closed at 3am Manila regardless of where the browser is.
 * Labels are formatted manually rather than via `toLocaleString` so server and
 * client produce identical output (no hydration mismatch, no locale drift).
 */

import { normalizeOperatingHours, parseHHMM, type DayHours } from './operating-hours'

/** Tenant columns the storefront must select for this decision to work at all. */
export const OPERATING_HOURS_ENFORCEMENT_COLUMNS = [
  'operating_hours',
  'timezone',
  'enforce_operating_hours',
] as const

export type StoreClosedReason = 'closed_day' | 'before_open' | 'after_close'

export interface StoreOpenStatus {
  /** False only when enforcement is on and the store's clock is outside the window. */
  isOpen: boolean
  /** Whether the UI (and the order guard) should refuse new orders. */
  isOrderingBlocked: boolean
  reason: StoreClosedReason | null
  /** Human label for the next opening, e.g. `"today at 9:00 AM"`. Null if never. */
  nextOpenLabel: string | null
  /** Today's closing time while open, e.g. `"9:00 PM"`. Null while closed. */
  closesAt: string | null
}

/** The status every non-enforcing / unconfigured tenant gets. */
export const ALWAYS_OPEN_STATUS: StoreOpenStatus = Object.freeze({
  isOpen: true,
  isOrderingBlocked: false,
  reason: null,
  nextOpenLabel: null,
  closesAt: null,
})

/** The subset of tenant columns this module reads. */
export interface StoreHoursSource {
  operating_hours?: unknown
  timezone?: string | null
  enforce_operating_hours?: boolean | null
}

/** Weekday (0=Sun..6=Sat) plus minutes from midnight, in a specific timezone. */
export interface ZonedNow {
  weekday: number
  minutes: number
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const MINUTES_PER_DAY = 24 * 60
const DAYS_PER_WEEK = 7

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Runtime-local reading, used whenever the tenant timezone is missing or invalid. */
function localNow(now: Date): ZonedNow {
  return { weekday: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() }
}

/**
 * Resolve `now` into the store's local weekday + minutes.
 *
 * Falls back to the runtime clock on any bad timezone rather than throwing — an
 * unparseable IANA string must not take the storefront down.
 */
export function getZonedNow(now: Date, timeZone?: string | null): ZonedNow {
  if (!timeZone) return localNow(now)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const read = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const weekday = WEEKDAY_INDEX[read('weekday')]
    // `hour12: false` renders midnight as "24" in some ICU versions.
    const hour = Number(read('hour')) % 24
    const minute = Number(read('minute'))
    if (weekday === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return localNow(now)
    return { weekday, minutes: hour * 60 + minute }
  } catch {
    return localNow(now)
  }
}

/** Format minutes from midnight as a 12-hour label, e.g. `"9:30 PM"`. */
export function formatTimeLabel(minutes: number): string {
  const clamped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hour24 = Math.floor(clamped / 60)
  const minute = clamped % 60
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minute < 10 ? `0${minute}` : minute} ${suffix}`
}

/** A usable window for one weekday, or null when that day carries no explicit config. */
interface ResolvedDay {
  closed: boolean
  openMinutes: number
  closeMinutes: number
  /** Window wraps past midnight (e.g. 18:00–02:00). */
  isOvernight: boolean
}

function resolveDay(hours: Record<string, DayHours>, weekday: number): ResolvedDay | null {
  const day = hours[String(weekday)]
  if (!day) return null
  if (day.closed) return { closed: true, openMinutes: 0, closeMinutes: 0, isOvernight: false }

  const openMinutes = parseHHMM(day.open)
  const closeMinutes = parseHHMM(day.close)
  // A window that cannot be read is treated as "no config" → open all day.
  if (openMinutes === null || closeMinutes === null || openMinutes === closeMinutes) return null

  return {
    closed: false,
    openMinutes,
    closeMinutes,
    isOvernight: closeMinutes < openMinutes,
  }
}

function isWithin(day: ResolvedDay, minutes: number): boolean {
  return day.isOvernight
    ? minutes >= day.openMinutes || minutes < day.closeMinutes
    : minutes >= day.openMinutes && minutes < day.closeMinutes
}

function dayOffsetLabel(offset: number, weekday: number): string {
  if (offset === 0) return 'today'
  if (offset === 1) return 'tomorrow'
  return WEEKDAY_NAMES[weekday]
}

/**
 * Search forward (today first, then up to a full week) for the next moment the
 * store opens. Returns null when every configured day is closed.
 */
function findNextOpenLabel(hours: Record<string, DayHours>, zoned: ZonedNow): string | null {
  for (let offset = 0; offset <= DAYS_PER_WEEK; offset++) {
    const weekday = (zoned.weekday + offset) % DAYS_PER_WEEK
    const day = resolveDay(hours, weekday)

    // No explicit config for this day → open all day, so it opens at midnight.
    if (!day) return `${dayOffsetLabel(offset, weekday)} at ${formatTimeLabel(0)}`
    if (day.closed) continue

    // Today only counts if the opening is still ahead of us.
    if (offset === 0 && zoned.minutes >= day.openMinutes) continue

    return `${dayOffsetLabel(offset, weekday)} at ${formatTimeLabel(day.openMinutes)}`
  }
  return null
}

/**
 * Resolve whether the store is currently taking orders.
 *
 * Returns `ALWAYS_OPEN_STATUS` for every tenant that has not opted in or has no
 * usable hours — see the module header for why that direction is deliberate.
 */
export function getStoreOpenStatus(
  source: StoreHoursSource | null | undefined,
  now: Date,
): StoreOpenStatus {
  if (source?.enforce_operating_hours !== true) return ALWAYS_OPEN_STATUS

  const hours = normalizeOperatingHours(source.operating_hours)
  if (!hours) return ALWAYS_OPEN_STATUS

  const zoned = getZonedNow(now, source.timezone)
  const today = resolveDay(hours, zoned.weekday)

  // Unconfigured weekday → open all day.
  if (!today) return ALWAYS_OPEN_STATUS

  // An overnight window that started yesterday can still be running.
  const yesterday = resolveDay(hours, (zoned.weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK)
  const carriedOver = !!yesterday && !yesterday.closed && yesterday.isOvernight && zoned.minutes < yesterday.closeMinutes

  const openToday = !today.closed && isWithin(today, zoned.minutes)
  if (openToday || carriedOver) {
    return {
      isOpen: true,
      isOrderingBlocked: false,
      reason: null,
      // Prefer today's own window; fall back to the window still carrying over.
      closesAt: formatTimeLabel(openToday ? today.closeMinutes : yesterday!.closeMinutes),
      nextOpenLabel: null,
    }
  }

  const reason: StoreClosedReason = today.closed
    ? 'closed_day'
    : zoned.minutes < today.openMinutes
      ? 'before_open'
      : 'after_close'

  return {
    isOpen: false,
    isOrderingBlocked: true,
    reason,
    nextOpenLabel: findNextOpenLabel(hours, zoned),
    closesAt: null,
  }
}

/** Copy shown wherever an order is refused because the shop is shut. */
export const STORE_CLOSED_MESSAGE = 'Ordering is currently closed'

/**
 * Server-side order guard. Returns a customer-facing error string when the order
 * must be refused, or null when it may proceed. This is the only enforcement a
 * customer cannot bypass by disabling JavaScript.
 */
export function getClosedOrderError(
  source: StoreHoursSource | null | undefined,
  now: Date = new Date(),
): string | null {
  const status = getStoreOpenStatus(source, now)
  if (!status.isOrderingBlocked) return null
  return status.nextOpenLabel
    ? `${STORE_CLOSED_MESSAGE}. Ordering reopens ${status.nextOpenLabel}.`
    : `${STORE_CLOSED_MESSAGE}.`
}
