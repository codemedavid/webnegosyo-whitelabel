/**
 * Which period a payment buys.
 *
 * A subscription may carry a BILLING ANCHOR: the date the platform owner says
 * that client's month turns over. "They started on the 1st of August" means
 * every period afterwards runs 1st to end-of-month, whenever the money actually
 * arrives.
 *
 * Without an anchor this behaves exactly as billing did before it existed — a
 * lapsed merchant's month starts the day they pay. Every tenant already on the
 * platform has a null anchor, so that fallback is the shipped behaviour for all
 * of them and is guarded by its own tests.
 *
 * Pure and dependency-free, like `subscription-status.ts`, so the arithmetic is
 * testable without a database and cannot disagree with itself across the web
 * admin, the actions and the merchant app.
 *
 * WHY START AND END ARE DECIDED TOGETHER: an anchored period ends the day
 * before the NEXT anchor date, not a month after its own start. Derive the end
 * from the start and a 31st anchor sells 28 February as both the last day of
 * January's month and the first day of February's — one day, charged twice.
 */

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

const MONTHS_PER_YEAR = 12

/** A real `YYYY-MM-DD`, round-tripped so "2026-02-31" is rejected. */
function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** `YYYY-MM-DD` a whole number of days after another. */
export function addDays(dayKey: string, days: number): string {
  const shifted = Date.parse(`${dayKey}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY
  return new Date(shifted).toISOString().slice(0, 10)
}

/**
 * A whole number of months later, clamped to the end of a shorter month.
 *
 * 31 January plus one month is 28 February, not 3 March. Letting the date roll
 * over would hand out free days every time a long month met a short one, and
 * the drift compounds across a year of renewals.
 */
export function addMonths(dayKey: string, months: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)

  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / MONTHS_PER_YEAR)
  // JS `%` keeps the sign of the dividend, so a negative month needs wrapping.
  const targetMonth = ((targetMonthIndex % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR

  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  const shifted = new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth))
  )
  return shifted.toISOString().slice(0, 10)
}

/** The day-of-month, as a number. */
function dayOfMonth(dayKey: string): number {
  return Number(dayKey.slice(8, 10))
}

/** Months between two day keys, ignoring the day-of-month. */
function wholeMonthsBetween(fromDayKey: string, toDayKey: string): number {
  const fromYear = Number(fromDayKey.slice(0, 4))
  const fromMonth = Number(fromDayKey.slice(5, 7))
  const toYear = Number(toDayKey.slice(0, 4))
  const toMonth = Number(toDayKey.slice(5, 7))

  return (toYear - fromYear) * MONTHS_PER_YEAR + (toMonth - fromMonth)
}

/**
 * The last day of an UNANCHORED period.
 *
 * Normally the day before the same date next month, so consecutive periods tile
 * without a paid day belonging to two of them: 10 August plus a month runs to 9
 * September.
 *
 * When the month arithmetic CLAMPED — 31 January plus a month is 28 February —
 * that clamp has already consumed the boundary, and subtracting a further day
 * would end the period on the 27th and quietly sell the merchant a 28-day
 * month. In that case the clamped date is itself the end.
 *
 * The anchored path does NOT use this: there, the next period's start is known
 * outright, so the end is simply the day before it.
 */
export function resolvePeriodEnd(periodStart: string, periodMonths: number): string {
  const sameDateNextPeriod = addMonths(periodStart, periodMonths)

  if (dayOfMonth(sameDateNextPeriod) < dayOfMonth(periodStart)) {
    return sameDateNextPeriod
  }

  return addDays(sameDateNextPeriod, -1)
}

export interface BillingPeriod {
  /** First day the merchant has bought. */
  periodStart: string
  /** Last day the merchant has bought, inclusive. */
  periodEnd: string
}

/**
 * The index of the anchored period that contains a given day.
 *
 * Estimated from the month difference, then corrected by at most one step in
 * either direction — the clamping in `addMonths` is the only thing that can
 * make the estimate wrong, and it can only ever be out by one. A loop that
 * stepped a month at a time would run eighty times for a client anchored in
 * 2019, on a page that renders every tenant on the platform.
 *
 * Never negative: a day before the anchor belongs to period 0, the first one
 * that exists.
 */
function periodIndexContaining(anchor: string, dayKey: string): number {
  const estimate = wholeMonthsBetween(anchor, dayKey)

  for (const index of [estimate + 1, estimate, estimate - 1]) {
    if (index >= 0 && addMonths(anchor, index) <= dayKey) return index
  }

  return 0
}

/** The first anchored period starting strictly after a given day. */
function periodIndexAfter(anchor: string, dayKey: string): number {
  return periodIndexContaining(anchor, dayKey) + 1
}

/**
 * Where a newly-bought period starts and ends.
 *
 * Three cases, in priority order:
 *
 *  1. STACKING. The merchant still has paid days left, so the new period picks
 *     up the day after them whatever the anchor says. Resetting to the anchor
 *     would resell days they already own.
 *  2. ANCHORED. The month they are living in, found on the anchor's grid. A
 *     merchant three months lapsed buys the month in front of them, not the
 *     three behind — they owe a conversation, not three invoices.
 *  3. NEITHER. Today, and a month from today. Exactly what billing did before
 *     anchors existed.
 *
 * The stacking case still uses the anchor for its END, which is how an
 * off-grid merchant is pulled back onto the grid. That realignment always
 * LENGTHENS the period rather than shortening it: the stub between their old
 * paid-through and the next anchor date is comped. Billing ₱649 for a five-day
 * realignment stub is the one outcome a merchant would rightly dispute.
 */
export function resolveAnchoredPeriod(
  anchor: string | null | undefined,
  paidThrough: string | null | undefined,
  today: string,
  periodMonths: number
): BillingPeriod {
  // A corrupt anchor must never block a payment being recorded. Same bias as
  // the access gate: uncertainty resolves in the merchant's favour.
  const anchorDayKey = isDayKey(anchor) ? anchor : null
  const isStacking = isDayKey(paidThrough) && paidThrough >= today

  if (!anchorDayKey) {
    const periodStart = isStacking ? addDays(paidThrough as string, 1) : today
    return { periodStart, periodEnd: resolvePeriodEnd(periodStart, periodMonths) }
  }

  if (isStacking) {
    const nextIndex = periodIndexAfter(anchorDayKey, paidThrough as string)
    return {
      periodStart: addDays(paidThrough as string, 1),
      periodEnd: addDays(addMonths(anchorDayKey, nextIndex + periodMonths), -1),
    }
  }

  const index = periodIndexContaining(anchorDayKey, today)
  return {
    periodStart: addMonths(anchorDayKey, index),
    periodEnd: addDays(addMonths(anchorDayKey, index + periodMonths), -1),
  }
}
