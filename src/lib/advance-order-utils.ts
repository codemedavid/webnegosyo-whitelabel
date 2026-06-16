/**
 * Advance Order (scheduled / pre-order) utilities.
 *
 * Pure, dependency-free helpers shared by checkout, admin, and the order pipeline.
 * All formatting is deterministic (no `toLocaleString`) so output is identical on
 * server and client — this avoids React hydration mismatches and locale drift.
 *
 * Timezone model: a scheduled time is chosen in the customer's *local* time, stored
 * as a UTC ISO string in `orders.scheduled_for`, and a human label is captured at
 * creation time (`customer_data.scheduled_for_label`) so every later view — including
 * server-side webhooks running in UTC — shows the customer's intended local time.
 */

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────

/** Per-order-type advance-order columns (subset of OrderType). */
export interface AdvanceOrderFields {
  advance_order_enabled?: boolean | null
  advance_order_allow_asap?: boolean | null
  advance_order_lead_time_minutes?: number | null
  advance_order_max_days_ahead?: number | null
  advance_order_slot_interval_minutes?: number | null
}

export interface AdvanceOrderConfig {
  enabled: boolean
  allowAsap: boolean
  leadTimeMinutes: number
  maxDaysAhead: number
  slotIntervalMinutes: number
}

// Defaults mirror the DB defaults in 20260616100000_advance_orders.sql.
export const DEFAULT_LEAD_TIME_MINUTES = 30
export const DEFAULT_MAX_DAYS_AHEAD = 7
export const DEFAULT_SLOT_INTERVAL_MINUTES = 30

// Selectable window within a day (minutes from local midnight). 08:00–22:00.
export const DEFAULT_DAY_START_MINUTES = 8 * 60
export const DEFAULT_DAY_END_MINUTES = 22 * 60

/** Normalize raw order-type columns into a safe config with sane fallbacks. */
export function getAdvanceOrderConfig(ot: AdvanceOrderFields | null | undefined): AdvanceOrderConfig {
  const leadTime = ot?.advance_order_lead_time_minutes
  const maxDays = ot?.advance_order_max_days_ahead
  const slot = ot?.advance_order_slot_interval_minutes
  return {
    enabled: ot?.advance_order_enabled === true,
    // If scheduling is enabled but ASAP is not explicitly disabled, default ASAP on.
    allowAsap: ot?.advance_order_allow_asap !== false,
    leadTimeMinutes: typeof leadTime === 'number' && leadTime >= 0 ? leadTime : DEFAULT_LEAD_TIME_MINUTES,
    maxDaysAhead: typeof maxDays === 'number' && maxDays >= 0 ? maxDays : DEFAULT_MAX_DAYS_AHEAD,
    slotIntervalMinutes: typeof slot === 'number' && slot >= 5 ? slot : DEFAULT_SLOT_INTERVAL_MINUTES,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Deterministic formatting primitives
// ──────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** "HH:MM" (24h) for a minutes-from-midnight value. Used as a stable slot value. */
export function minutesToTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${pad2(h)}:${pad2(m)}`
}

/** "5:00 PM" from minutes-from-midnight. Deterministic, locale-independent. */
export function formatTime12(minutes: number): string {
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${pad2(m)} ${period}`
}

/** "YYYY-MM-DD" from a Date using its *local* calendar day. Stable date-picker value. */
export function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Parse "YYYY-MM-DD" + "HH:MM" into a local Date (NOT UTC). */
export function combineDateAndTime(dateValue: string, timeValue: string): Date {
  const [y, mo, d] = dateValue.split('-').map(Number)
  const [h, mi] = timeValue.split(':').map(Number)
  return new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0)
}

// ──────────────────────────────────────────────────────────────────────────
// Date & slot generation
// ──────────────────────────────────────────────────────────────────────────

export interface ScheduleDateOption {
  /** "YYYY-MM-DD" (local). */
  value: string
  /** "Today" | "Tomorrow" | "Tue, Jun 18". */
  label: string
  isToday: boolean
}

export interface TimeSlotOption {
  /** "HH:MM" (24h, local). */
  value: string
  /** "5:00 PM". */
  label: string
  /** Minutes from local midnight. */
  minutes: number
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Available calendar dates from today through `maxDaysAhead`. */
export function generateScheduleDates(config: AdvanceOrderConfig, now: Date): ScheduleDateOption[] {
  const out: ScheduleDateOption[] = []
  const base = startOfDay(now)
  for (let offset = 0; offset <= config.maxDaysAhead; offset++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 0, 0, 0, 0)
    let label: string
    if (offset === 0) label = 'Today'
    else if (offset === 1) label = 'Tomorrow'
    else label = `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
    out.push({ value: toDateValue(d), label, isToday: offset === 0 })
  }
  return out
}

/**
 * Selectable time slots for a given local date, honoring lead time + slot interval.
 * For today, slots earlier than `now + leadTime` are excluded. Returns [] when no
 * valid slot remains within the day window (e.g. a late-evening "today").
 */
export function generateTimeSlots(
  config: AdvanceOrderConfig,
  dateValue: string,
  now: Date,
  dayStartMinutes: number = DEFAULT_DAY_START_MINUTES,
  dayEndMinutes: number = DEFAULT_DAY_END_MINUTES,
): TimeSlotOption[] {
  const interval = config.slotIntervalMinutes
  const [y, mo, d] = dateValue.split('-').map(Number)
  const dayStartDate = new Date(y, (mo || 1) - 1, d || 1, 0, 0, 0, 0)
  if (Number.isNaN(dayStartDate.getTime())) return []

  // Earliest permissible *absolute* time is now + lead time. This applies to EVERY day,
  // not just today — a long lead time (e.g. 24h catering) pushes the floor into future days,
  // and any day whose window ends before the cutoff (past days, or a too-late "today") has none.
  const leadCutoff = new Date(now.getTime() + config.leadTimeMinutes * 60_000)
  const dayBaseMs = dayStartDate.getTime()
  const dayEndAbsMs = dayBaseMs + dayEndMinutes * 60_000
  if (dayEndAbsMs < leadCutoff.getTime()) return []

  let earliest = dayStartMinutes
  if (isSameLocalDay(dayStartDate, leadCutoff)) {
    const cutoffMinutes = leadCutoff.getHours() * 60 + leadCutoff.getMinutes()
    if (cutoffMinutes > earliest) {
      // Round up to the next slot boundary.
      earliest = Math.ceil(cutoffMinutes / interval) * interval
    }
  }

  const slots: TimeSlotOption[] = []
  for (let m = Math.max(earliest, 0); m <= dayEndMinutes; m += interval) {
    slots.push({ value: minutesToTimeValue(m), label: formatTime12(m), minutes: m })
  }
  return slots
}

/** First selectable (date, time) across the allowed window, or null if none. */
export function getFirstAvailableSlot(
  config: AdvanceOrderConfig,
  now: Date,
): { dateValue: string; timeValue: string } | null {
  for (const date of generateScheduleDates(config, now)) {
    const slots = generateTimeSlots(config, date.value, now)
    if (slots.length > 0) {
      return { dateValue: date.value, timeValue: slots[0].value }
    }
  }
  return null
}

/** True if `when` is a valid advance slot (in the future, within the allowed horizon). */
export function isValidScheduledTime(config: AdvanceOrderConfig, when: Date, now: Date): boolean {
  if (Number.isNaN(when.getTime())) return false
  const minTime = now.getTime() + config.leadTimeMinutes * 60_000
  if (when.getTime() < minTime - 60_000) return false // 1-min grace
  const horizon = startOfDay(now)
  const maxDate = new Date(
    horizon.getFullYear(),
    horizon.getMonth(),
    horizon.getDate() + config.maxDaysAhead,
    23,
    59,
    59,
    999,
  )
  return when.getTime() <= maxDate.getTime()
}

// ──────────────────────────────────────────────────────────────────────────
// Display
// ──────────────────────────────────────────────────────────────────────────

/**
 * Human label for a scheduled time, e.g. "Tue, Jun 18 · 5:00 PM".
 * Deterministic and timezone-stable relative to the runtime's local zone.
 * Prefer a precomputed `scheduled_for_label` when available (see getOrderScheduledLabel).
 */
export function formatScheduledFor(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const minutes = d.getHours() * 60 + d.getMinutes()
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${formatTime12(minutes)}`
}

/** Human lead-time phrase, e.g. 30 → "30 minutes", 90 → "1.5 hours", 120 → "2 hours". */
export function formatLeadTime(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = minutes / 60
  const rounded = Math.round(hours * 10) / 10
  return `${rounded} hour${rounded === 1 ? '' : 's'}`
}

/** Order-shaped subset used to read a persisted schedule from either backend. */
export interface ScheduledOrderLike {
  scheduled_for?: string | null
  customer_data?: Record<string, unknown> | null
}

/** ISO string of the requested time, reading the column or the customer_data fallback (Convex). */
export function getOrderScheduledISO(order: ScheduledOrderLike | null | undefined): string | null {
  if (!order) return null
  if (order.scheduled_for) return order.scheduled_for
  const cd = order.customer_data
  const fromData = cd && typeof cd === 'object' ? (cd as Record<string, unknown>).scheduled_for : null
  return typeof fromData === 'string' && fromData ? fromData : null
}

/** Display label, preferring the customer-captured label, then formatting the ISO. */
export function getOrderScheduledLabel(order: ScheduledOrderLike | null | undefined): string | null {
  if (!order) return null
  const cd = order.customer_data
  const label = cd && typeof cd === 'object' ? (cd as Record<string, unknown>).scheduled_for_label : null
  if (typeof label === 'string' && label) return label
  const iso = getOrderScheduledISO(order)
  return iso ? formatScheduledFor(iso) : null
}
