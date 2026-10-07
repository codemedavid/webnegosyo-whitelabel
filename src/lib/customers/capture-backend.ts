/**
 * Which backend a merchant-app customer capture is filed under.
 *
 * The register states a backend in its capture body, but it is not the
 * authority: the tenant's resolved order backend is — the same
 * `resolveOrderBackend` checkout and the Customer Hub route on. Trusting the
 * claim is how the QR scanner, which hard-coded `convex`, filed platform
 * stores' orders into the `customer_external_orders` ledger:
 *
 * - the order never got `orders.customer_id`, so it vanished from the guest's
 *   history (the Hub reads `orders` for a platform store, never the ledger);
 * - the profile was recomputed from the ledger alone, restating a regular's
 *   lifetime totals as just the misfiled orders;
 * - the ledger's loyalty trigger queued a `convex` earning job that the worker
 *   rejects for a platform store, retrying forever.
 *
 * Pure decisions live here; `verifyCaptureBackend` is the one I/O step and
 * takes its client injected so the route stays thin and testable.
 */

import type { CaptureBackend, CustomerCaptureRequest } from '@/lib/customer-capture-request'
import {
  resolveOrderBackend,
  type OrderBackend,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

const CAPTURE_BACKEND_OF: Record<OrderBackend, CaptureBackend> = {
  platform: 'platform',
  convex: 'convex',
  supabase: 'tenant_supabase',
}

/** `public.orders.id` is a uuid; anything else can never be a platform order. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The tenant's real order backend, in the capture vocabulary. */
export function captureBackendOf(tenant: OrderBackendTenantFields): CaptureBackend {
  return CAPTURE_BACKEND_OF[resolveOrderBackend(tenant)]
}

export function isPlatformOrderId(orderId: string): boolean {
  return UUID_PATTERN.test(orderId)
}

export type CaptureBackendVerdict =
  | { ok: true; backend: CaptureBackend; corrected: boolean }
  | { ok: false; error: string }

/**
 * Reconcile the register's claim with the tenant's real backend.
 *
 * A platform store is corrected rather than refused: the platform can prove the
 * order exists (see `verifyCaptureBackend`), and every app build released
 * before the scanner fix still claims `convex` — correcting here fixes those
 * installs without waiting on a store release.
 *
 * A foreign backend (Convex, a tenant's own Supabase) cannot be read from here,
 * so a mismatch is refused: the ledger is keyed by backend, and a row filed
 * under the wrong one would be counted again when the order arrives under its
 * real one.
 */
export function reconcileCaptureBackend(
  claimed: CaptureBackend,
  actual: CaptureBackend
): CaptureBackendVerdict {
  if (claimed === actual) return { ok: true, backend: actual, corrected: false }
  if (actual === 'platform') return { ok: true, backend: 'platform', corrected: true }
  return {
    ok: false,
    error: `This store's orders are on ${actual}, not ${claimed}.`,
  }
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

interface MaybeSingleResult {
  data: unknown
  error: { message: string } | null
}

interface FilterBuilder {
  eq: (column: string, value: unknown) => FilterBuilder
  maybeSingle: () => PromiseLike<MaybeSingleResult>
}

/** The structural slice of a service-role Supabase client this needs. */
export interface CaptureBackendClient {
  from: (table: string) => { select: (projection: string) => FilterBuilder }
}

export type VerifiedCapture =
  | { ok: true; request: CustomerCaptureRequest }
  | { ok: false; status: 404 | 409 | 503; error: string }

async function platformOrderExists(
  client: CaptureBackendClient,
  tenantId: string,
  orderId: string
): Promise<boolean> {
  if (!isPlatformOrderId(orderId)) return false
  const { data, error } = await client
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

/**
 * The capture request with its backend replaced by the verified one, or the
 * reason it cannot be filed.
 *
 * A platform capture additionally requires the order to be THIS tenant's row:
 * the platform link updates `orders` by id, so an unchecked id would let an
 * admin of one store attach another store's order to a guest of their own.
 */
export async function verifyCaptureBackend(
  client: CaptureBackendClient,
  request: CustomerCaptureRequest
): Promise<VerifiedCapture> {
  const tenant = await client
    .from('tenants')
    .select('order_backend, convex_deployment_url')
    .eq('id', request.tenantId)
    .maybeSingle()
  if (tenant.error || !tenant.data) {
    // Never guess: a guessed backend is how the ledger got the wrong rows.
    return { ok: false, status: 503, error: 'Could not resolve the store’s order backend.' }
  }

  const verdict = reconcileCaptureBackend(
    request.backend,
    captureBackendOf(tenant.data as OrderBackendTenantFields)
  )
  if (!verdict.ok) return { ok: false, status: 409, error: verdict.error }

  if (verdict.backend === 'platform') {
    const exists = await platformOrderExists(client, request.tenantId, request.orderId).catch(
      (error: unknown) => {
        console.error('[verifyCaptureBackend] platform order lookup failed:', error, {
          tenantId: request.tenantId,
          orderId: request.orderId,
        })
        return null
      }
    )
    if (exists === null) {
      return { ok: false, status: 503, error: 'Could not verify the order.' }
    }
    if (!exists) return { ok: false, status: 404, error: 'Order not found for this store.' }
  }

  if (verdict.corrected) {
    console.warn('[verifyCaptureBackend] corrected a mis-stated capture backend', {
      tenantId: request.tenantId,
      orderId: request.orderId,
      claimed: request.backend,
      actual: verdict.backend,
    })
  }

  return { ok: true, request: { ...request, backend: verdict.backend } }
}
