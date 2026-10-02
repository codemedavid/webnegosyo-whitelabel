'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkCustomDomainAction,
  connectCustomDomainAction,
  disconnectCustomDomainAction,
} from '@/app/actions/custom-domain'
import type { CustomDomainResult, CustomDomainView } from '@/lib/domains/custom-domain-service'

/** How often a pending domain is re-checked while the card is on screen. */
const POLL_INTERVAL_MS = 30_000
/** Stop auto-checking after ~10 minutes; "Check now" still works. */
const MAX_AUTO_CHECKS = 20

export type DomainBusy = 'connect' | 'check' | 'remove' | null

interface UseCustomDomainArgs {
  tenantId: string
  isAvailable: boolean
}

export function useCustomDomain({ tenantId, isAvailable }: UseCustomDomainArgs) {
  // Null until the first check: a pending claim is not the routed domain the
  // page knows about, so the server is always asked on open.
  const [view, setView] = useState<CustomDomainView | null>(null)
  const [busy, setBusy] = useState<DomainBusy>(isAvailable ? 'check' : null)
  const [error, setError] = useState<string | null>(null)
  const autoChecks = useRef(0)

  const run = useCallback(async (kind: Exclude<DomainBusy, null>, action: () => Promise<CustomDomainResult>) => {
    setBusy(kind)
    setError(null)
    try {
      const result = await action()
      if (result.ok) {
        setView(result.view)
      } else {
        setError(result.error)
      }
      return result.ok
    } catch {
      setError('Something went wrong. Please try again.')
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  const check = useCallback(() => run('check', () => checkCustomDomainAction(tenantId)), [run, tenantId])
  const connect = useCallback(
    (domain: string) => {
      autoChecks.current = 0
      return run('connect', () => connectCustomDomainAction(tenantId, domain))
    },
    [run, tenantId],
  )
  const remove = useCallback(
    () => run('remove', () => disconnectCustomDomainAction(tenantId)),
    [run, tenantId],
  )

  // Load the live status (and the DNS records to show) once on open. With no
  // domain at all this is one row read and no Vercel call.
  useEffect(() => {
    if (isAvailable) void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [])

  // Until visitors actually arrive, re-check quietly — only when the tab is visible.
  const isSettling = view?.status === 'pending' || (view?.status === 'active' && !view.isDnsReady)
  useEffect(() => {
    if (!isSettling) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || autoChecks.current >= MAX_AUTO_CHECKS) return
      autoChecks.current += 1
      void checkCustomDomainAction(tenantId).then((result) => {
        if (result.ok) setView(result.view)
      })
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isSettling, tenantId])

  return { view, busy, error, check, connect, remove }
}
