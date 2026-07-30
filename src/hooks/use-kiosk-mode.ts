'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  KIOSK_PARAM,
  clearKioskMode,
  readKioskMode,
  resolveKioskMode,
  writeKioskMode,
} from '@/lib/kiosk/kiosk-mode'

/**
 * Wires kiosk mode to the browser: the `?kiosk=` param and localStorage.
 *
 * Every decision comes from `resolveKioskMode` — this hook only supplies the
 * inputs and persists the answer. Storage is what carries the mode onto the
 * cart and checkout pages, which are reached by router.push and so arrive with
 * no query string at all.
 *
 * `useSearchParams` requires a Suspense boundary above the calling component in
 * the App Router. Both callers already have one.
 */
export function useKioskMode(tenantSlug: string): { isKiosk: boolean; isHydrated: boolean } {
  const searchParams = useSearchParams()
  const urlValue = searchParams?.get(KIOSK_PARAM) ?? null

  const [stored, setStored] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Storage is read after mount: reading it during render would produce
  // server/client markup that disagrees.
  useEffect(() => {
    if (typeof window === 'undefined') return
    setStored(readKioskMode(window.localStorage, tenantSlug))
    setIsHydrated(true)
  }, [tenantSlug])

  const resolution = useMemo(
    () => resolveKioskMode({ urlValue, stored }),
    [urlValue, stored]
  )

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return

    if (resolution.shouldPersist) {
      writeKioskMode(window.localStorage, tenantSlug)
      setStored(true)
    } else if (resolution.shouldClearStorage) {
      clearKioskMode(window.localStorage, tenantSlug)
      setStored(false)
    }
  }, [isHydrated, resolution.shouldPersist, resolution.shouldClearStorage, tenantSlug])

  return { isKiosk: resolution.isKiosk, isHydrated }
}
