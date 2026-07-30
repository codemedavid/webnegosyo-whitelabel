/**
 * Which day a movement belongs to, from a merchant's point of view.
 *
 * A UTC day boundary would cut a Philippine dinner service in half: 8pm Manila
 * is already the next day in UTC, so the busiest two hours of trade land on
 * tomorrow's report and every day reads short. The report is for someone
 * standing in their shop, so the day is theirs.
 *
 * The database already agrees — `assign_daily_order_number` numbers orders by
 * `(created_at at time zone 'Asia/Manila')::date`. This is the same rule on the
 * read side, so the report and the order numbers cannot disagree about what
 * "today" means.
 *
 * A FIXED +08:00 offset is used rather than `Intl` timezone arithmetic. The
 * Philippines has observed no daylight saving since 1978 and the platform is
 * single-market; a fixed offset is exact here and leaves nothing to a runtime's
 * timezone database. If the platform ever ships outside PH this becomes a
 * per-tenant setting, not a cleverer calculation.
 */

/** Hours Manila runs ahead of UTC. */
const MANILA_UTC_OFFSET_HOURS = 8

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD`, the same shape Postgres renders a `date` as. */
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface BusinessDayWindow {
  /** Inclusive lower bound. */
  startIso: string
  /** EXCLUSIVE upper bound, so a movement is never counted on two days. */
  endIso: string
}

function assertDayKey(dayKey: string): void {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    throw new Error(`Expected a YYYY-MM-DD business day, received "${dayKey}"`)
  }
  if (Number.isNaN(Date.parse(`${dayKey}T00:00:00.000Z`))) {
    throw new Error(`"${dayKey}" is not a real calendar date`)
  }
}

/**
 * The UTC instants bounding one Manila day.
 *
 * Half-open by design: the caller filters `created_at >= start AND < end`, so
 * consecutive days tile the timeline without overlapping.
 */
export function resolveBusinessDayWindow(dayKey: string): BusinessDayWindow {
  assertDayKey(dayKey)

  const midnightUtc = Date.parse(`${dayKey}T00:00:00.000Z`)
  const start = midnightUtc - MANILA_UTC_OFFSET_HOURS * 60 * 60 * 1000

  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + MILLISECONDS_PER_DAY).toISOString(),
  }
}

/** Which Manila day an instant falls on. */
export function toBusinessDayKey(iso: string): string {
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) {
    throw new Error(`Expected an ISO timestamp, received "${iso}"`)
  }

  // Shifting the instant forward by the offset makes the Manila wall clock the
  // UTC wall clock, so the date part can simply be read off.
  const shifted = new Date(instant + MANILA_UTC_OFFSET_HOURS * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * The day before.
 *
 * The report defaults to yesterday: today is always mid-service, so it always
 * looks short and would train a merchant to distrust the figure.
 */
export function previousBusinessDayKey(dayKey: string): string {
  assertDayKey(dayKey)

  const previous = Date.parse(`${dayKey}T00:00:00.000Z`) - MILLISECONDS_PER_DAY
  return new Date(previous).toISOString().slice(0, 10)
}

export interface ReportDaySelection {
  /** The day to report on. */
  dayKey: string
  /** The most recent day worth offering — today, in Manila. */
  latestDayKey: string
}

function isRealDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false

  // `Date.parse` accepts "2026-13-45" on some engines by rolling over, so the
  // round-trip is what actually rejects an impossible date.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * Which day the report should show, given an untrusted `?day=` and the clock.
 *
 * The day arrives from a URL, so it can be hand-edited, stale, or nonsense. A
 * report is a read: a bad query string is a reason to show a sensible day, not
 * to fail the whole inventory page.
 *
 * Defaults to YESTERDAY. Today is always mid-service — half its trade has not
 * happened yet — so it always reads short, and a figure that always looks short
 * teaches a merchant to ignore it. Today can still be asked for deliberately.
 *
 * A future day is refused rather than shown empty: an empty future report is
 * indistinguishable from a day whose data went missing.
 */
export function resolveReportDay(
  requestedDay: string | undefined,
  nowIso: string,
): ReportDaySelection {
  const latestDayKey = toBusinessDayKey(nowIso)
  const fallback = previousBusinessDayKey(latestDayKey)

  if (!requestedDay || !isRealDayKey(requestedDay)) {
    return { dayKey: fallback, latestDayKey }
  }

  return {
    dayKey: requestedDay > latestDayKey ? latestDayKey : requestedDay,
    latestDayKey,
  }
}
