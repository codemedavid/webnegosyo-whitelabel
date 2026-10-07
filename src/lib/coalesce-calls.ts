/**
 * Fold a burst of calls into one trailing call.
 *
 * Built for realtime handlers that answer an event with something expensive —
 * the live orders page answers each new order with a full server re-render, so
 * a lunch rush fired one per INSERT. `waitMs` is the quiet window that ends a
 * burst; `maxWaitMs` caps how long a never-quiet stream can postpone the call.
 */

export interface CoalescerOptions {
  /** Run once no new call has arrived for this long. */
  waitMs: number
  /** Run at the latest this long after the first call of a burst. */
  maxWaitMs: number
}

export interface Coalescer {
  schedule: () => void
  /** Drop any pending call — for unmount. */
  cancel: () => void
}

export function createCoalescer(run: () => void, { waitMs, maxWaitMs }: CoalescerOptions): Coalescer {
  let quietTimer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (quietTimer) clearTimeout(quietTimer)
    if (maxTimer) clearTimeout(maxTimer)
    quietTimer = null
    maxTimer = null
  }

  const flush = () => {
    cancel()
    run()
  }

  const schedule = () => {
    if (quietTimer) clearTimeout(quietTimer)
    quietTimer = setTimeout(flush, waitMs)
    if (!maxTimer) maxTimer = setTimeout(flush, maxWaitMs)
  }

  return { schedule, cancel }
}
