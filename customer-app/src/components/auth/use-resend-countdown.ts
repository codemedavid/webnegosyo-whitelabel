import { useEffect, useState } from 'react'
import { resendSecondsLeft } from '@/lib/auth/code-input'

const TICK_MS = 1000

/** Seconds until a new code may be sent, re-rendering once a second until it unlocks. */
export function useResendCountdown(sentAtMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  // A fresh send can be newer than the last tick; never show more than the full cooldown.
  const secondsLeft = Math.min(resendSecondsLeft(sentAtMs, now), resendSecondsLeft(sentAtMs, sentAtMs))
  const isLocked = secondsLeft > 0
  useEffect(() => {
    if (!isLocked) return undefined
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [isLocked, sentAtMs])
  return secondsLeft
}
