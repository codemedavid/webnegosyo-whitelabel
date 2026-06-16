/**
 * Tenant operating hours.
 *
 * Pure, dependency-free, deterministic (no `toLocaleString`) — same constraints as
 * `advance-order-utils.ts`, so output is identical on server and client and never
 * triggers a hydration mismatch.
 *
 * Stored as JSONB on `tenants.operating_hours`, keyed by weekday `"0"`..`"6"`
 * (Sun..Sat, matching `Date.prototype.getDay()`). Each day is `{ closed, open, close }`
 * with `open`/`close` as 24h `"HH:MM"` strings in the store's local wall-clock time.
 *
 * IMPORTANT: operating hours ONLY constrain advance/scheduled slot generation. ASAP
 * ordering is never gated by hours — a missing or misconfigured value can never block
 * the core order flow; it simply falls back to the default window below.
 */

export interface DayHours {
  /** Store closed all day; `open`/`close` are ignored. */
  closed: boolean
  /** 24h "HH:MM" local open time. */
  open: string
  /** 24h "HH:MM" local close time. */
  close: string
}

/** Map of weekday (`"0"`=Sun .. `"6"`=Sat) → hours for that day. */
export type OperatingHours = Record<string, DayHours>

// Default selectable window when a tenant has not configured hours. Mirrors the
// historical advance-order behavior (08:00–22:00) so existing tenants are unaffected.
export const DEFAULT_OPEN_MINUTES = 8 * 60
export const DEFAULT_CLOSE_MINUTES = 22 * 60

/** Resolved open/close window for a specific calendar day, in minutes from local midnight. */
export interface DayWindow {
  closed: boolean
  openMinutes: number
  closeMinutes: number
}

const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Parse "HH:MM" (24h) → minutes from midnight, or null when malformed/out of range. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Format minutes from midnight → "HH:MM" (24h). */
export function minutesToHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

/**
 * Normalize an untrusted JSON value into a safe `OperatingHours`, or null when there is
 * nothing usable. Only well-formed days are kept; malformed times fall back to defaults.
 */
export function normalizeOperatingHours(raw: unknown): OperatingHours | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const out: OperatingHours = {}
  for (const key of WEEKDAY_KEYS) {
    const value = source[key]
    if (!value || typeof value !== 'object') continue
    const day = value as Record<string, unknown>
    const closed = day.closed === true
    const openMinutes = parseHHMM(day.open as string)
    const closeMinutes = parseHHMM(day.close as string)
    out[key] = {
      closed,
      open: openMinutes !== null ? minutesToHHMM(openMinutes) : minutesToHHMM(DEFAULT_OPEN_MINUTES),
      close: closeMinutes !== null ? minutesToHHMM(closeMinutes) : minutesToHHMM(DEFAULT_CLOSE_MINUTES),
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Resolve the selectable open/close window for `date`'s weekday.
 *
 * Fallbacks (all return an OPEN default window rather than closing the shop, so a partial
 * or missing config never silently blocks scheduling):
 *  - no hours configured → default 08:00–22:00
 *  - weekday not present in the config → default window
 *  - malformed open/close, or close ≤ open → default window
 * An explicit `{ closed: true }` is the only thing that marks a day closed.
 */
export function getDayWindow(hours: OperatingHours | null | undefined, date: Date): DayWindow {
  const fallback: DayWindow = {
    closed: false,
    openMinutes: DEFAULT_OPEN_MINUTES,
    closeMinutes: DEFAULT_CLOSE_MINUTES,
  }
  if (!hours) return fallback

  const day = hours[String(date.getDay())]
  if (!day) return fallback
  if (day.closed) return { closed: true, openMinutes: 0, closeMinutes: 0 }

  const openMinutes = parseHHMM(day.open)
  const closeMinutes = parseHHMM(day.close)
  if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) return fallback

  return { closed: false, openMinutes, closeMinutes }
}

/** True when the store is open at all on `date` (i.e. the day is not explicitly closed). */
export function isOpenOn(hours: OperatingHours | null | undefined, date: Date): boolean {
  return !getDayWindow(hours, date).closed
}

/** Build a sensible default week (every day open with the given window) for the admin editor. */
export function buildDefaultOperatingHours(open = '09:00', close = '21:00'): OperatingHours {
  const safeOpen = parseHHMM(open) !== null ? open : '09:00'
  const safeClose = parseHHMM(close) !== null ? close : '21:00'
  const week: OperatingHours = {}
  for (const key of WEEKDAY_KEYS) {
    week[key] = { closed: false, open: safeOpen, close: safeClose }
  }
  return week
}
