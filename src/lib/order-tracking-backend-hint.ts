/**
 * Per-runtime memory of where each store's orders live, used ONLY to start the
 * likely tracking read early.
 *
 * The tracking read needs the tenant's routing row before it knows which
 * backend to ask — two round trips in a row on the first paint after checkout
 * and on every poll. A store's backend almost never changes, so the backend the
 * last routing read resolved (or, before any, the SSR page's cached tenant
 * row) predicts the next one: the predicted read leaves together with the
 * routing read.
 *
 * A hint never routes. `fetchOrderTrackingContext` still reads the routing row
 * every time and discards a guessed read the row disagrees with, so a stale
 * hint costs one wasted query and is corrected by that same read. Holds no
 * credentials and nothing per-customer: one backend name per tenant id.
 */

import { resolveOrderBackend, type OrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'

/** Plenty for every store this runtime serves; the oldest entry is evicted first. */
export const MAX_TRACKING_BACKEND_HINTS = 1000

const hints = new Map<string, OrderBackend>()

export function recallTrackingBackend(tenantId: string): OrderBackend | null {
  return hints.get(tenantId) ?? null
}

/** Record the backend a fresh routing read resolved. */
export function rememberTrackingBackend(tenantId: string, backend: OrderBackend): void {
  hints.delete(tenantId) // re-insert so Map order tracks recency
  hints.set(tenantId, backend)
  if (hints.size > MAX_TRACKING_BACKEND_HINTS) {
    const oldest = hints.keys().next().value
    if (oldest !== undefined) hints.delete(oldest)
  }
}

/**
 * Seed a hint from a (possibly cached) tenant row. Never overwrites a hint a
 * fresh routing read already set — a cached row is the weaker evidence.
 */
export function primeTrackingBackendHint(tenantId: string, tenant: OrderBackendTenantFields): void {
  if (hints.has(tenantId)) return
  rememberTrackingBackend(tenantId, resolveOrderBackend(tenant))
}

/** Test seam. */
export function clearTrackingBackendHints(): void {
  hints.clear()
}
