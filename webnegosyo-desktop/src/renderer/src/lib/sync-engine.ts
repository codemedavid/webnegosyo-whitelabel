import type { ConvexReactClient } from 'convex/react'
import { createOrderRef, updatePaymentStatusRef } from './convex-refs'
import { useSyncStore } from '../stores/sync-store'

// Background worker that drains locally-persisted POS sales to Convex. The
// local store is the source of truth; this only replays it over the network.
// createOrder is idempotent on clientOrderId server-side, so re-running a drain
// after a crash/timeout can never create duplicates — no client-side dedup.

// Module-level singletons: the active Convex client and the re-entrancy mutex.
let syncClient: ConvexReactClient | null = null
let draining = false
// Set when a drain is requested while one is already running, so we run again.
let rerunRequested = false

// Convex mutations stay pending forever when the client is offline, so every
// network call is raced against a timeout to guarantee the drain can't hang.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Sync request timed out')), ms)
    ),
  ])
}

export function setSyncClient(client: ConvexReactClient | null): void {
  syncClient = client
}

export function requestSync(): void {
  if (!navigator.onLine || !syncClient) return
  // Already draining: don't start a second pass; flag a rerun for when it ends.
  if (draining) {
    rerunRequested = true
    return
  }
  void drain()
}

async function drain(): Promise<void> {
  const client = syncClient
  if (!client || !navigator.onLine) return

  draining = true
  rerunRequested = false
  useSyncStore.getState().setSyncing(true)
  // Tracks whether this pass hit a network failure, so the finally block can
  // safely clear a stale error / confirm online only on a fully clean drain.
  let failed = false

  try {
    const pending = await window.api.getPendingPosOrders()
    for (const order of pending) {
      // Connection can drop mid-drain — stop and let the next cycle resume.
      if (!navigator.onLine) break
      try {
        const orderId = await withTimeout(client.mutation(createOrderRef, order.payload), 15000)
        // For paid sales the payment-status patch must also land before we
        // consider the order fully synced. If it fails, let it throw into the
        // catch below so the order STAYS pending and is retried next cycle —
        // createOrder is idempotent on clientOrderId, so the retry re-runs both
        // mutations without duplicating. (Previously this was swallowed, which
        // could leave a paid sale stuck at paymentStatus 'pending' on Convex.)
        if (order.paymentStatus === 'paid') {
          await withTimeout(
            client.mutation(updatePaymentStatusRef, { orderId, paymentStatus: 'paid' }),
            15000
          )
        }
        await window.api.markPosOrderSynced(order.clientOrderId, String(orderId))
        useSyncStore.getState().setOnline(true)
        useSyncStore.getState().setLastError(null)
        useSyncStore.getState().setLastSynced(Date.now())
      } catch (err) {
        // Record the failure (stays pending, retried next cycle) and stop the
        // loop so we don't hammer Convex while the connection is flaky. A
        // timed-out mutation may still be in-flight server-side and succeed
        // later; re-running createOrder next cycle is dedup-safe via the
        // clientOrderId idempotency guard, so this never duplicates.
        const message = err instanceof Error ? err.message : 'Sync failed'
        await window.api.markPosOrderFailed(order.clientOrderId, message)
        useSyncStore.getState().setLastError(message)
        useSyncStore.getState().setOnline(navigator.onLine)
        failed = true
        break
      }
    }
  } finally {
    // Always refresh the badge count and release the mutex, even on error.
    const count = await window.api.getPosPendingCount().catch(() => 0)
    useSyncStore.getState().setPendingCount(count)
    // A clean pass while online means we're connected and caught up — clear any
    // stale error and confirm online even when the queue was already empty (the
    // success branch above never runs in that case).
    if (!failed && navigator.onLine) {
      useSyncStore.getState().setOnline(true)
      useSyncStore.getState().setLastError(null)
    }
    draining = false
    useSyncStore.getState().setSyncing(false)
    // A drain was requested while we were busy — run it now if still viable.
    if (rerunRequested && navigator.onLine && syncClient) {
      void drain()
    }
  }
}
