'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface OwlBeat {
  /** True for one beat after `react()`. */
  isReacting: boolean
  /** How many times he has reacted, so his line can change from tap to tap. */
  count: number
  react: () => void
}

/** A short-lived "he noticed" moment: each call restarts the beat. */
export function useOwlBeat(durationMs: number): OwlBeat {
  const [isReacting, setIsReacting] = useState(false)
  const [count, setCount] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const react = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setIsReacting(true)
    setCount((current) => current + 1)
    timer.current = setTimeout(() => {
      timer.current = null
      setIsReacting(false)
    }, durationMs)
  }, [durationMs])

  return { isReacting, count, react }
}
