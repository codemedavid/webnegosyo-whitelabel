/**
 * The register telling the platform it rang a sale.
 *
 * Status changes already reach the platform through the customer lifecycle
 * post, which carries the caller's token and so names the actor for free. A
 * counter sale has no such post when the guest is anonymous — the customer
 * capture is skipped for want of an identity — so the register sends this
 * small, separate fact instead. Parsed strictly: the actor is NEVER taken from
 * the body, only from the token the route verifies.
 */

import type { OrderEventBackend, OrderEventSource } from './order-event'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BACKENDS: readonly OrderEventBackend[] = ['convex', 'tenant_supabase', 'platform_supabase']

export interface OrderActivityRequest {
  tenantId: string
  backend: OrderEventBackend
  externalOrderId: string
  status: string
  source: OrderEventSource
  orderTotal: number | null
  outletId: string | null
}

export type OrderActivityParse =
  | { ok: true; value: OrderActivityRequest }
  | { ok: false; error: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseOrderActivityRequest(body: unknown): OrderActivityParse {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'A JSON object body is required.' }
  }
  const input = body as Record<string, unknown>

  if (input.actorUserId !== undefined || input.actorName !== undefined) {
    return { ok: false, error: 'The actor is resolved from the session and must not be supplied.' }
  }

  const tenantId = text(input.tenantId)
  if (!UUID_RE.test(tenantId)) return { ok: false, error: 'A valid tenantId is required.' }

  const backend = text(input.backend) as OrderEventBackend
  if (!BACKENDS.includes(backend)) {
    return { ok: false, error: `backend must be one of: ${BACKENDS.join(', ')}.` }
  }

  const externalOrderId = text(input.externalOrderId)
  if (!externalOrderId) return { ok: false, error: 'externalOrderId is required.' }

  const status = text(input.status) || 'pending'

  const source = text(input.source)
  if (source !== 'pos' && source !== 'online') {
    return { ok: false, error: 'source must be pos or online.' }
  }

  const total = Number(input.orderTotal)
  const orderTotal = Number.isFinite(total) && total >= 0 ? total : null

  const outletId = text(input.outletId)
  if (outletId && !UUID_RE.test(outletId)) return { ok: false, error: 'outletId must be a uuid.' }

  return {
    ok: true,
    value: { tenantId, backend, externalOrderId, status, source, orderTotal, outletId: outletId || null },
  }
}
