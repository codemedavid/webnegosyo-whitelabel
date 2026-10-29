'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TEST_TEXT_POLL_MS, TEST_TEXT_WATCH_MS, testTextView, type TestTextState, type TestTextView } from '@/lib/texts/test-text'

interface Poll {
  state: TestTextState
  /** Server clock at the read, so "1 min waiting" never depends on the browser's clock. */
  serverNow: number
}

export interface TestTextWatch {
  view: TestTextView | null
  /** The watch gave up while the text was still waiting. */
  isTimedOut: boolean
  watch: (id: string) => void
  reset: () => void
}

/** Follows one test text through GET /api/admin/texts/test-text until it settles or 3 minutes pass. */
export function useTestText(tenantId: string): TestTextWatch {
  const [id, setId] = useState<string | null>(null)
  const [poll, setPoll] = useState<Poll | null>(null)
  const [isTimedOut, setTimedOut] = useState(false)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!id) return
    let isActive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      try {
        const query = new URLSearchParams({ tenantId, id })
        const response = await fetch(`/api/admin/texts/test-text?${query.toString()}`, { cache: 'no-store' })
        if (response.ok) {
          const body = (await response.json()) as { state: TestTextState; now: string }
          if (!isActive) return
          const next = { state: body.state, serverNow: Date.parse(body.now) || Date.now() }
          setPoll(next)
          if (!testTextView(next.state, next.serverNow).isOpen) return
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
      if (!isActive) return
      if (Date.now() - startedAt.current > TEST_TEXT_WATCH_MS) return setTimedOut(true)
      timer = setTimeout(tick, TEST_TEXT_POLL_MS)
    }
    void tick()
    return () => {
      isActive = false
      if (timer) clearTimeout(timer)
    }
  }, [id, tenantId])

  const watch = useCallback((next: string) => {
    startedAt.current = Date.now()
    setPoll(null)
    setTimedOut(false)
    setId(next)
  }, [])
  const reset = useCallback(() => {
    setId(null)
    setPoll(null)
    setTimedOut(false)
  }, [])

  return { view: poll ? testTextView(poll.state, poll.serverNow) : null, isTimedOut, watch, reset }
}
