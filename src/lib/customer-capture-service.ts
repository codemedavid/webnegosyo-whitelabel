/**
 * Routing a merchant-app sale into the customer profile system.
 *
 * The two capture paths this dispatches to both predate it and are both already
 * tested. Nothing here recomputes an aggregate or resolves an identity; it
 * chooses between them and guarantees the call cannot fail the sale.
 *
 * - **platform** — the order is a row in `public.orders`. `upsertCustomerFromOrder`
 *   links it by `orders.customer_id` and recomputes the profile from the real
 *   order rows, so the caller's claims about totals are neither needed nor
 *   trusted.
 * - **convex / tenant_supabase** — the order lives in a database the platform
 *   cannot query, so its facts go into the `customer_external_orders` ledger and
 *   the same recompute reads that instead.
 *
 * The dependencies are injected rather than imported so the dispatch is unit
 * testable without a Supabase client; the route supplies the real ones.
 */

import type { CustomerCaptureRequest } from '@/lib/customer-capture-request'
import type { CustomerIdentityInput } from '@/lib/customer-identity'
import type { ExternalOrderInput } from '@/lib/customer-external-orders'

/** Identity inputs for an order that already lives in `public.orders`. */
export interface PlatformCaptureInput extends CustomerIdentityInput {
  orderId: string
}

export interface CaptureDeps {
  capturePlatformOrder(tenantId: string, input: PlatformCaptureInput): Promise<string | null>
  captureExternalOrder(tenantId: string, order: ExternalOrderInput): Promise<string | null>
  /** Server clock, injected so the timestamp fallback is assertable. */
  now(): string
}

/**
 * Roll one merchant-app order into its guest's profile.
 *
 * Returns the customer id, or null when the order identifies nobody (a walk-in
 * with no contact details — not an error) or when the capture failed.
 *
 * Never throws. By the time this runs the order is written and the customer has
 * paid; a profile missing one sale is recoverable by backfill, a register that
 * reports a completed sale as failed is not.
 */
export async function captureAppOrder(
  request: CustomerCaptureRequest,
  deps: CaptureDeps
): Promise<string | null> {
  try {
    if (request.backend === 'platform') {
      return await deps.capturePlatformOrder(request.tenantId, {
        orderId: request.orderId,
        name: request.name,
        contact: request.contact,
        customerData: request.customerData,
        // Deliberately no total or items: the order row is the source of those,
        // and reading them from the request would let a caller restate a guest's
        // lifetime spend without an order to back it up.
      })
    }

    return await deps.captureExternalOrder(request.tenantId, {
      backend: request.backend,
      externalOrderId: request.orderId,
      name: request.name,
      contact: request.contact,
      customerData: request.customerData,
      total: request.total,
      // A caller that reported no timestamp gets the server's, never a client
      // default — a till with a wrong clock would file the sale in the wrong
      // month of the guest's history and nothing downstream could tell.
      createdAt: request.createdAt ?? deps.now(),
      channel: request.channel,
      items: request.items,
    })
  } catch (error) {
    // Logged with the tenant and order id because the capture is idempotent:
    // a failure recorded this way can simply be replayed.
    console.error(
      '[captureAppOrder] customer capture failed (non-blocking):',
      error instanceof Error ? error.message : error,
      { tenantId: request.tenantId, backend: request.backend, orderId: request.orderId }
    )
    return null
  }
}
