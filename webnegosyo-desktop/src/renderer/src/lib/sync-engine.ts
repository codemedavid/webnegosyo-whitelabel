import type { PosOrderScope } from '../../../shared/types'
import type { ConvexReactClient } from 'convex/react'
import { createOrderRef, updatePaymentStatusRef } from './convex-refs'
import { useSyncStore } from '../stores/sync-store'

// Background worker that drains locally-persisted POS sales to Convex. The
// local store is the source of truth; this only replays it over the network.
// createOrder is idempotent on clientOrderId server-side, so re-running a drain
// after a crash/timeout can never create duplicates — no client-side dedup.

// Module-level singletons: the active Convex client and the re-entrancy mutex.
let syncClient: ConvexReactClient | null = null
let syncScope: PosOrderScope | null = null
let generation = 0
let draining = false
// Set when a drain is requested while one is already running, so we run again.
let rerunRequested = false

// Convex mutations stay pending forever when the client is offline, so every
// network call is raced against a timeout to guarantee the drain can't hang.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Sync request timed out')), ms)
  })
  return Promise.race([p, expiry]).finally(() => clearTimeout(timer))
}

export function setSyncClient(client: ConvexReactClient | null, scope: PosOrderScope | null = null): void {
  syncClient = client
  syncScope = scope
  generation += 1
}

export function requestSync(): void {
  if (!navigator.onLine || !syncClient || !syncScope) return
  // Already draining: don't start a second pass; flag a rerun for when it ends.
  if (draining) {
    rerunRequested = true
    return
  }
  void drain().catch((error: unknown) => {
    useSyncStore.getState().setLastError(error instanceof Error ? error.message : 'Sync failed')
  })
}

async function drain(): Promise<void> {
  const client = syncClient
  const scope = syncScope
  const startedGeneration = generation
  const isActive = () => generation === startedGeneration
  if (!client || !scope || !navigator.onLine) return

  draining = true
  rerunRequested = false
  useSyncStore.getState().setSyncing(true)
  // Tracks whether this pass hit a network failure, so the finally block can
  // safely clear a stale error / confirm online only on a fully clean drain.
  let failed = false
  let unscoped = false

  try {
    const pending = await window.api.getPendingPosOrders()
    unscoped = pending.some((order) => !order.tenantId || !order.convexUrl ||
      (order.tenantId === scope.tenantId && order.convexUrl !== scope.convexUrl))
    const mine = pending.filter((order) => order.tenantId === scope.tenantId && order.convexUrl === scope.convexUrl)
    for (const order of mine) {
      // Connection can drop mid-drain — stop and let the next cycle resume.
      if (!navigator.onLine || !isActive()) break
      try {
        const orderId = await withTimeout(client.mutation(createOrderRef, order.payload), 15000)
        // For paid sales the payment-status patch must also land before we
        // consider the order fully synced. If it fails, let it throw into the
        // catch below so the order STAYS pending and is retried next cycle —
        // createOrder is idempotent on clientOrderId, so the retry re-runs both
        // mutations without duplicating. (Previously this was swallowed, which
        // could leave a paid sale stuck at paymentStatus 'pending' on Convex.)
        if (!isActive()) break
        if (order.paymentStatus === 'paid') {
          await withTimeout(
            client.mutation(updatePaymentStatusRef, { orderId, paymentStatus: 'paid' }),
            15000
          )
        }
        if (!isActive()) break
        await window.api.markPosOrderSynced(order.clientOrderId, String(orderId))
        useSyncStore.getState().setOnline(true)
        useSyncStore.getState().setLastError(null)
        useSyncStore.getState().setLastSynced(Date.now())
      } catch (err) {
        if (!isActive()) break
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
    if (!failed && navigator.onLine && isActive()) {
      useSyncStore.getState().setOnline(true)
      useSyncStore.getState().setLastError(unscoped ? 'Saved sales need store reconciliation before syncing.' : null)
    }
    draining = false
    useSyncStore.getState().setSyncing(false)
    // A drain was requested while we were busy — run it now if still viable.
    if (rerunRequested && navigator.onLine && syncClient) {
      requestSync()
    }
  }
}
