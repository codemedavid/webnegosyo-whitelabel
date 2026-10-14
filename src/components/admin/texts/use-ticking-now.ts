'use client'

import { useEffect, useState } from 'react'

const TICK_MS = 30_000

/**
 * The server's clock, moved forward by real time since the last live read,
 * so "checked in 1 min ago" ticks without trusting the browser's own clock.
 */
export function useTickingNow(serverNowIso: string): number {
  const [anchor, setAnchor] = useState(() => ({ server: Date.parse(serverNowIso), local: Date.now() }))
  const [, setTick] = useState(0)

  useEffect(() => {
    setAnchor({ server: Date.parse(serverNowIso), local: Date.now() })
  }, [serverNowIso])

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  if (!Number.isFinite(anchor.server)) return Date.now()
  return anchor.server + (Date.now() - anchor.local)
}
