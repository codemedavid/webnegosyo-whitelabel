/**
 * The kitchen's promise, as the customer reads it.
 *
 * The merchant app stamps an absolute instant when the chef taps a number of
 * minutes (see `webnegosyo-app/lib/prep-time.ts`). This module turns that
 * instant into the words on the tracking page. Two rules it exists to enforce:
 *
 * 1. A target TIME is shown, not only a countdown. "Ready by 7:21 PM" stays
 *    true and useful; a bare countdown that reaches zero and keeps going reads
 *    as a broken page.
 * 2. Past the promise the WORDS change, never the number into the negative.
 *    The kitchen running four minutes over is not "-4 min".
 */

const MS_PER_MINUTE = 60_000

/** Under a minute out, a number is noise — the food is essentially up. */
const IMMINENT_MS = 60_000

/** The statuses where a promise means anything to the customer. */
const PROMISABLE_STATUSES = ['confirmed', 'preparing']

export type PrepPromiseTone = 'eta' | 'late'

export interface PrepPromiseView {
  tone: PrepPromiseTone
  /** The headline: what is promised, and by when. */
  headline: string
  /** The supporting line: roughly how long, or an apology. */
  detail: string
}

export interface PrepPromiseInput {
  /** Absolute UTC instant the kitchen committed to; null = not yet promised. */
  promisedReadyAt: string | null | undefined
  status: string
  /**
   * The server's clock, not the device's. A phone set twenty minutes fast would
   * otherwise render a nonsense estimate for an order that is perfectly on time.
   */
  nowMs: number
  /**
   * Delivery is promised differently: the kitchen controls when food leaves,
   * not when it arrives. Null/unknown falls back to the neutral wording.
   */
  orderTypeKind?: string | null
  timeZone?: string
}

/** "7:21 PM", or null if the stored value is not a usable timestamp. */
export function formatPromisedClock(
  promisedReadyAt: string | null | undefined,
  timeZone?: string
): string | null {
  if (!promisedReadyAt) return null

  const ms = Date.parse(promisedReadyAt)
  if (Number.isNaN(ms)) return null

  return new Date(ms).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
}

/**
 * What to show above the status stepper, or null to show nothing at all.
 *
 * Null is the right answer more often than not: before the kitchen commits,
 * once the food is actually ready (reality supersedes the estimate), and on any
 * order that is cancelled or still awaiting the store's acceptance.
 */
export function describePrepPromise({
  promisedReadyAt,
  status,
  nowMs,
  orderTypeKind,
  timeZone,
}: PrepPromiseInput): PrepPromiseView | null {
  if (!PROMISABLE_STATUSES.includes(status)) return null

  const clock = formatPromisedClock(promisedReadyAt, timeZone)
  if (!clock) return null

  const promisedMs = Date.parse(promisedReadyAt as string)
  const remaining = promisedMs - nowMs

  if (remaining < 0) {
    return {
      tone: 'late',
      headline: 'Almost there',
      detail: 'Running a little behind',
    }
  }

  const isDelivery = orderTypeKind === 'delivery'
  const headline = isDelivery
    ? `Leaves the kitchen by ${clock}`
    : `Ready by ${clock}`

  return {
    tone: 'eta',
    headline,
    detail:
      remaining < IMMINENT_MS
        ? 'Any moment now'
        : `about ${Math.ceil(remaining / MS_PER_MINUTE)} min`,
  }
}
