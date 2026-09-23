'use client'

import { useEffect, useRef } from 'react'
import { computePollDelayMs } from '@/lib/poll-backoff'

export interface VisibilityPollOptions {
  /** Interval while polls succeed. */
  baseMs: number
  /** False stops the poll entirely (e.g. the order reached a final state). */
  isEnabled: boolean
  /** Fixed jitter seed for tests; defaults to one random value per mount. */
  jitterSeed?: number
}

/**
 * Run `poll` on an interval while the page is visible.
 *
 * - Hidden tab: no timer at all. A backgrounded tab or a locked phone used to
 *   keep polling at full rate for as long as the page stayed open.
 * - Shown again: polls immediately (the data may be minutes old), then resumes.
 * - `poll` resolves `true` on success; `false` or a throw counts as a failure
 *   and doubles the next delay, up to `MAX_POLL_BACKOFF_MS`.
 *
 * A self-rescheduling timeout rather than `setInterval`, so a slow response can
 * never overlap the next request.
 */
export function useVisibilityPoll(poll: () => Promise<boolean>, options: VisibilityPollOptions): void {
  const { baseMs, isEnabled } = options
  const pollRef = useRef(poll)
  const jitterSeedRef = useRef(options.jitterSeed ?? Math.random())

  useEffect(() => {
    pollRef.current = poll
  }, [poll])

  useEffect(() => {
    if (!isEnabled) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let consecutiveFailures = 0
    let isInFlight = false
    let isDisposed = false

    const clear = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }

    const schedule = () => {
      clear()
      if (isDisposed || document.hidden) return
      const delay = computePollDelayMs({ baseMs, consecutiveFailures, jitterSeed: jitterSeedRef.current })
      timer = setTimeout(run, delay)
    }

    const run = async () => {
      timer = null
      if (isInFlight || isDisposed) return
      isInFlight = true
      let isSuccess = false
      try {
        isSuccess = await pollRef.current()
      } catch {
        isSuccess = false
      } finally {
        isInFlight = false
      }
      consecutiveFailures = isSuccess ? 0 : consecutiveFailures + 1
      schedule()
    }

    const handleVisibilityChange = () => {
      clear()
      if (document.hidden) return
      void run()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    schedule()

    return () => {
      isDisposed = true
      clear()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [baseMs, isEnabled])
}
