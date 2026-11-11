/**
 * The order a staff route is asked to act on, checked against the store's own
 * rows.
 *
 * Several app-facing routes are told "order X of store Y just changed" and then
 * write with the service role. Membership of the store says who is calling; it
 * says nothing about the order. This is that second question, asked once:
 *
 * - WHERE the store keeps its orders is read from the store's row
 *   (`resolveOrderBackend`), never from the request.
 * - A platform store's order must be the store's and, for an account confined
 *   to a branch, that branch's. Anything else reads as "no such order", as it
 *   would through the order policies.
 * - A store that keeps orders in its own deployment has nothing this server can
 *   read; the answer says so, and each route decides what it does without one.
 *
 * A read that fails throws: an order check that could not finish is never a pass.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ORDER_BACKEND_TENANT_COLUMNS,
  resolveOrderBackend,
  type OrderBackendTenantFields,
} from '@/lib/order-backend'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the saved order says about itself. */
export interface CallerOrder {
  outletId: string | null
  status: string
  source: 'pos' | 'online'
  /** Null when the row holds no usable total. */
  total: number | null
}

export type CallerOrderCheck =
  /** The order lives in the store's own deployment and cannot be read here. */
  | { backend: 'convex' }
  /** `order` is null when the store (or the caller's branch) holds no such order. */
  | { backend: 'platform'; order: CallerOrder | null }

export interface CallerOrderInput {
  tenantId: string
  orderId: string
  /** The branch the caller's account is confined to; null for a store-wide account. */
  callerOutletId: string | null
}

type Db = Pick<SupabaseClient, 'from'>

interface OrderRow {
  outlet_id: string | null
  status: string | null
  source: string | null
  total: number | string | null
}

function toTotal(value: OrderRow['total']): number | null {
  if (value === null || value === '') return null
  const total = Number(value)
  return Number.isFinite(total) && total >= 0 ? total : null
}

export async function checkCallerOrder(db: Db, input: CallerOrderInput): Promise<CallerOrderCheck> {
  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .select(ORDER_BACKEND_TENANT_COLUMNS)
    .eq('id', input.tenantId)
    .maybeSingle()
  if (tenantError) throw new Error(`[caller-order] store lookup: ${tenantError.message}`)
  if (!tenant) throw new Error('[caller-order] store row not found')
  // The column is free text; resolveOrderBackend validates whatever it holds.
  if (resolveOrderBackend(tenant as OrderBackendTenantFields) !== 'platform') return { backend: 'convex' }

  // Platform order ids are uuids; anything else cannot name one.
  if (!UUID_RE.test(input.orderId)) return { backend: 'platform', order: null }

  const { data, error } = await db
    .from('orders')
    .select('outlet_id, status, source, total')
    .eq('id', input.orderId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()
  if (error) throw new Error(`[caller-order] order lookup: ${error.message}`)
  if (!data) return { backend: 'platform', order: null }

  const row = data as OrderRow
  const outletId = row.outlet_id ?? null
  if (input.callerOutletId !== null && outletId !== input.callerOutletId) return { backend: 'platform', order: null }

  return {
    backend: 'platform',
    order: {
      outletId,
      status: row.status ?? '',
      source: row.source === 'pos' ? 'pos' : 'online',
      total: toTotal(row.total),
    },
  }
}

export interface EventOutletInput {
  tenantId: string
  callerOutletId: string | null
  /** The branch the request names, if any. Only ever a proposal. */
  named: string | null
}

/**
 * The branch a line is filed under when there is no saved order to read it
 * from. A branch account files under its own branch; a store-wide account may
 * name one of the store's branches. A branch that is not the store's is
 * dropped rather than refused: the branch is attribution, and the sale it
 * describes has already happened.
 */
export async function resolveEventOutlet(db: Db, input: EventOutletInput): Promise<string | null> {
  if (input.callerOutletId !== null) return input.callerOutletId
  if (input.named === null || !UUID_RE.test(input.named)) return null

  const { data, error } = await db
    .from('outlets')
    .select('id')
    .eq('id', input.named)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()
  if (error) throw new Error(`[caller-order] branch lookup: ${error.message}`)
  return data ? input.named : null
}
