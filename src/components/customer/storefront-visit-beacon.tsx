'use client'

import { useEffect } from 'react'
import { shouldCountVisit, VISIT_ENDPOINT, visitStorageKey } from '@/lib/storefront/visit-request'

interface StorefrontVisitBeaconProps {
  tenantSlug: string
  /** The signed-in viewer administers this store: their own looks don't count. */
  isOwnerViewing: boolean
}

function readCounted(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markCounted(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Private mode: this session may count again on a reload; the server's limit caps it.
  }
}

function isFramed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** Counts this browser session's first open of the store for the owner's Start here page. Renders nothing. */
export function StorefrontVisitBeacon({ tenantSlug, isOwnerViewing }: StorefrontVisitBeaconProps) {
  useEffect(() => {
    const key = visitStorageKey(tenantSlug)
    if (!shouldCountVisit({ isOwnerViewing, isFramed: isFramed(), hasCountedThisSession: readCounted(key) })) return
    markCounted(key)
    const body = JSON.stringify({ slug: tenantSlug })
    const isQueued = typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(VISIT_ENDPOINT, new Blob([body], { type: 'application/json' }))
    if (!isQueued && typeof fetch === 'function') {
      void fetch(VISIT_ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {})
    }
  }, [tenantSlug, isOwnerViewing])

  return null
}
