'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ConfirmationHandoff } from '@/lib/checkout/tracking-redirect'

const TICK_MS = 1000

export interface TrackingCountdown {
  /** Seconds left; null when no countdown is running (instant, stay, stopped, not saved yet). */
  secondsLeft: number | null
  /** "Stay on this page": stops the countdown for good. Null when there is none to stop. */
  stay: (() => void) | null
}

/**
 * The owner's "show it, then move on" hand-off: once the order is saved the
 * thank-you page counts down and then REPLACES itself with tracking (so Back
 * doesn't land on an emptied checkout). Keyed by path + seconds, not by the
 * handoff object, which is rebuilt every render.
 */
export function useTrackingCountdown(
  handoff: ConfirmationHandoff | null | undefined,
  replace: (path: string) => void,
): TrackingCountdown {
  const path = handoff?.kind === 'countdown' ? handoff.path : null
  const seconds = handoff?.kind === 'countdown' ? handoff.seconds : null
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [isStopped, setIsStopped] = useState(false)
  const hasLeftRef = useRef(false)

  useEffect(() => {
    if (path === null || seconds === null || isStopped) {
      setSecondsLeft(null)
      return
    }
    setSecondsLeft(seconds)
    const interval = setInterval(() => {
      setSecondsLeft((previous) => (previous === null || previous <= 0 ? 0 : previous - 1))
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [path, seconds, isStopped])

  useEffect(() => {
    if (path === null || secondsLeft !== 0 || hasLeftRef.current) return
    hasLeftRef.current = true
    replace(path)
  }, [path, secondsLeft, replace])

  const stay = useCallback(() => setIsStopped(true), [])
  return { secondsLeft, stay: path !== null && !isStopped ? stay : null }
}
