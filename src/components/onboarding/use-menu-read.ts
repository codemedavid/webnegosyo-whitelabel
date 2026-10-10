'use client'

import { useEffect, useState } from 'react'
import type { MenuReadView } from '@/lib/onboarding/menu-read'
import { requestMenuRead } from './onboarding-api'

const POLL_INTERVAL_MS = 3000
/** About four and a half minutes: past the server's own deadline for a read. */
const MAX_POLLS = 90
const IDLE: MenuReadView = { status: 'idle', dishes: [] }

/**
 * The menu being read while the owner answers the rest of the set-up. Starts
 * once `isActive` (they left the menu step with a photo or typed text), polls
 * while the read runs, and starts over when the photos or the text change.
 */
export function useMenuRead(token: string, menuText: string, photoUrls: readonly string[], isActive: boolean): MenuReadView {
  const [view, setView] = useState<MenuReadView>(IDLE)
  const photoKey = photoUrls.join('|')
  const hasSources = photoUrls.length > 0 || menuText.trim().length > 0

  useEffect(() => {
    if (!isActive || !hasSources) return
    let isCancelled = false
    let polls = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      const result = await requestMenuRead(token, menuText)
      if (isCancelled) return
      if (!result.ok) {
        // A refused poll is not a failed read: keep any dishes already shown.
        setView((current) => (current.status === 'done' ? current : { status: 'failed', dishes: [] }))
        return
      }
      setView(result.data)
      polls += 1
      if (result.data.status === 'reading' && polls < MAX_POLLS) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    void tick()
    return () => {
      isCancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [token, menuText, photoKey, isActive, hasSources])

  return hasSources ? view : IDLE
}
