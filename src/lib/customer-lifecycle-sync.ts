/**
 * The order-lifecycle sync contract: validate an incoming event, then apply the
 * decision `customer-order-lifecycle.ts` makes about it.
 *
 * Split from the route so the rules are testable without HTTP, and split from
 * `decideLifecycleWrite` so the decision stays pure. This module is the I/O
 * shell in between.
 *
 * Parsing is a SECURITY boundary, not a convenience. The route runs the write
 * under service role, so a body that could name any tenant — or hand over a
 * customer id — would let one store rewrite another store's ledger. The tenant
 * is checked against the caller's own `app_users` row by the route; the customer
 * is never accepted from the body at all, exactly as `capture-order` refuses it.
 */

import {
  decideLifecycleWrite,
  type OrderLifecycleSource,
  type OrderLifecycleState,
  type OrderLifecycleWrite,
} from '@/lib/customer-order-lifecycle'

/** Backends with a row in the customer ledger. */
export type LifecycleBackend = 'convex' | 'tenant_supabase'
/**
 * Every backend an event may name. A platform-backed tenant has no ledger row
 * to sync — its orders ARE the platform's — but its status changes still have
 * to reach loyalty earning, so the route accepts the event and skips the sync.
 */
export type LifecycleEventBackend = LifecycleBackend | 'platform_supabase'

export interface LifecycleSyncEvent {
  tenantId: string
  backend: LifecycleEventBackend
  externalOrderId: string
  /** Absent when the event only changed payment; the ledger keeps its status. */
  status: string | null
  paymentStatus: string | null
  source: OrderLifecycleSource | null
  outletId: string | null
  updatedAt: string
}

export type LifecycleSyncParse =
  | { ok: true; value: LifecycleSyncEvent }
  | { ok: false; error: string }

const BACKENDS: readonly string[] = ['convex', 'tenant_supabase', 'platform_supabase']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseLifecycleSyncRequest(body: unknown): LifecycleSyncParse {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'A JSON object body is required.' }
  }
  const input = body as Record<string, unknown>

  // Identity is resolved server-side from the order's own contact. Accepting it
  // here would let a register attach its sale to another tenant's guest.
  if (input.customerId !== undefined) {
    return { ok: false, error: 'customerId is resolved server-side and must not be supplied.' }
  }

  const tenantId = text(input.tenantId)
  if (!UUID_RE.test(tenantId)) return { ok: false, error: 'A valid tenantId is required.' }

  const backend = text(input.backend)
  if (!BACKENDS.includes(backend)) {
    return { ok: false, error: `backend must be one of: ${BACKENDS.join(', ')}.` }
  }

  const externalOrderId = text(input.externalOrderId)
  if (!externalOrderId) return { ok: false, error: 'externalOrderId is required.' }

  // A payment-only patch (the register settling a sale) carries no status, and
  // must not be made to invent one — the ledger keeps whatever it already has.
  const status = text(input.status) || null
  const paymentStatus = text(input.paymentStatus) || null
  if (!status && !paymentStatus) {
    return { ok: false, error: 'At least one of status or paymentStatus is required.' }
  }

  const updatedAt = text(input.updatedAt)
  if (!updatedAt || Number.isNaN(new Date(updatedAt).getTime())) {
    return { ok: false, error: 'A valid ISO updatedAt is required.' }
  }

  return {
    ok: true,
    value: {
      tenantId,
      backend: backend as LifecycleEventBackend,
      externalOrderId,
      status,
      paymentStatus,
      // Anything we do not recognise is treated as an online order. Guessing
      // 'pos' would settle a visit on payment alone and count it early.
      source: !text(input.source) ? null : text(input.source) === 'pos' ? 'pos' : 'online',
      outletId: text(input.outletId) || null,
      updatedAt,
    },
  }
}

/** Where a ledger row lives; the same triple as the table's unique index. */
export interface LedgerOrderKey {
  tenantId: string
  backend: LifecycleBackend
  externalOrderId: string
}

export interface LifecycleSyncDeps {
  findLedgerOrder: (key: LedgerOrderKey) => Promise<OrderLifecycleState | null>
  /** False when another writer changed the row since it was read. */
  updateLedgerOrder: (key: LedgerOrderKey, patch: OrderLifecycleWrite, expectedRevision: string | null) => Promise<boolean | void>
}

export type LifecycleSyncResult = 'updated' | 'unchanged' | 'not_found' | 'no_ledger'

/**
 * Apply one lifecycle event to the ledger.
 *
 * A missing ledger row is reported, never created: the row is written by the
 * capture path, which is the only place that resolves WHO the order belongs to.
 * Inventing one here would produce an order attached to no customer, which is
 * worse than a gap the backfill can close.
 */
export async function syncOrderLifecycle(
  event: LifecycleSyncEvent,
  deps: LifecycleSyncDeps,
): Promise<LifecycleSyncResult> {
  // The platform's own orders table is the truth for these; there is no
  // projection to keep in step.
  if (event.backend === 'platform_supabase') return 'no_ledger'

  const key: LedgerOrderKey = {
    tenantId: event.tenantId,
    backend: event.backend,
    externalOrderId: event.externalOrderId,
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await deps.findLedgerOrder(key)
    if (!current) return 'not_found'

    const patch = decideLifecycleWrite(current, {
      // Missing fields preserve the order's recorded state.
      status: event.status ?? current.status,
      paymentStatus: event.paymentStatus ?? current.paymentStatus,
      source: event.source ?? current.source,
      outletId: event.outletId,
      updatedAt: event.updatedAt,
    })

    if (!patch) return 'unchanged'

    const applied = await deps.updateLedgerOrder(key, patch,
      current.revision === undefined ? current.updatedAt : current.revision)
    if (applied !== false) return 'updated'
  }
  throw new Error('Customer lifecycle changed concurrently; retry the event.')
}
