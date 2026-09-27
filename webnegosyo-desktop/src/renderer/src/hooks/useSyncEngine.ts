import { useEffect } from 'react'
import type { ConvexReactClient } from 'convex/react'
import { setSyncClient, requestSync } from '../lib/sync-engine'
import { useAuthStore } from '../stores/auth-store'
import { useSyncStore } from '../stores/sync-store'

/**
 * Wires the background sync worker to the app lifecycle: tracks the Convex
 * client, seeds the pending badge, reacts to online/offline events, and polls
 * every 20s so queued sales drain as soon as the connection returns.
 */
export function useSyncEngine(client: ConvexReactClient | null): void {
  const tenantId = useAuthStore((state) => state.tenantId)
  const convexUrl = useAuthStore((state) => state.convexUrl)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  useEffect(() => {
    setSyncClient(isAuthenticated ? client : null, tenantId && convexUrl ? { tenantId, convexUrl } : null)

    // Seed the badge so the UI reflects what's already queued on disk.
    void window.api
      .getPosPendingCount()
      .then((count) => useSyncStore.getState().setPendingCount(count))
      .catch(() => undefined)

    function handleOnline(): void {
      useSyncStore.getState().setOnline(true)
      requestSync()
    }

    function handleOffline(): void {
      useSyncStore.getState().setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Periodic safety net in case an online event is missed (e.g. server-side
    // outage that doesn't flip navigator.onLine).
    const interval = setInterval(requestSync, 20000)
    requestSync()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
      setSyncClient(null)
    }
  }, [client, tenantId, convexUrl, isAuthenticated])
}
