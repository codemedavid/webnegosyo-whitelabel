'use client'

import { useCallback, useEffect, useState } from 'react'
import { prefersReducedMotion } from './motion'

/**
 * Rotates through `count` items on a timer — the "check them all out" motif.
 * A manual selection takes over immediately and restarts the clock from that
 * item. Visitors who prefer reduced motion get a static index they page
 * through themselves.
 */
export function useAutoRotate(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0)
  // Bumping this restarts the interval so a manual pick gets a full dwell.
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (count <= 1 || prefersReducedMotion()) return

    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [count, intervalMs, cycle])

  const select = useCallback((next: number) => {
    setIndex(next)
    setCycle((c) => c + 1)
  }, [])

  return { index, select }
}
