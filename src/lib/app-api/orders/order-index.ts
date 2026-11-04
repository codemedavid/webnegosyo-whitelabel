// Which orders belong to which signed-in app customer (public.customer_app_orders,
// 20261104120000). One row per checkout attempt, claimed BEFORE the order is
// placed so a retried Idempotency-Key never places a second order.
//
// Service role only: the table is not exposed to anon/authenticated. The
// client is injected (the routes pass createAdminClient), so every write
// checks the rows it affected — a refusal or a lost race is a zero-row
// result, never an error.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  APP_ORDER_KINDS,
  APP_ORDER_STATUSES,
  appOrderTotalsSchema,
  appSelectionsSchema,
  pesoAmountSchema,
  type AppOrderStatus,
} from '@/lib/app-contract'
import { AppReadError } from '@/lib/app-api/store-reads'
import { createLogger, type Logger } from '@/lib/logger'
import type { OrderBackend } from '@/lib/order-backend'
import { decodeOrderCursor, encodeOrderCursor } from './order-cursor'

const TABLE = 'customer_app_orders'
const COLUMNS =
  'id, tenant_id, app_id, customer_id, backend, order_id, idempotency_key, state, summary, last_status, last_status_at, placed_at, created_at'
export const ORDER_HISTORY_PAGE_SIZE = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Same rule as the column check: printable ASCII, 8..100 characters. */
const IDEMPOTENCY_KEY = /^[!-~]{8,100}$/

// --- The snapshot stored at placement (pesos, like the app contract) ---------

export const orderSummaryLineSchema = z.object({
  /** The dish on the menu at placement; null when it could not be tied to one. */
  itemId: z.string().min(1).nullable(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  options: z.array(z.string()),
  lineTotal: pesoAmountSchema,
  /** The picks as placed, so "Order again" rebuilds the same dish. */
  selections: appSelectionsSchema,
})

export const orderSummarySchema = z.object({
  lines: z.array(orderSummaryLineSchema).min(1),
  totals: appOrderTotalsSchema,
  orderKind: z.enum(APP_ORDER_KINDS),
  orderTypeName: z.string().min(1),
  outletName: z.string().nullable(),
  /** The store's daily number ("07"); null on backends that do not assign one. */
  number: z.string().nullable(),
  paymentMethodName: z.string().nullable(),
})

export type OrderSummary = z.infer<typeof orderSummarySchema>

// --- Rows ---------------------------------------------------------------------

export type OrderIndexState = 'placing' | 'placed' | 'failed'

export interface OrderIndexRow {
  id: string
  tenantId: string
  appId: string
  customerId: string
  backend: OrderBackend
  orderId: string | null
  idempotencyKey: string
  state: OrderIndexState
  summary: OrderSummary | null
  lastStatus: AppOrderStatus | null
  lastStatusAt: string | null
  placedAt: string | null
  createdAt: string
}

export interface PlacedOrderRow extends OrderIndexRow {
  state: 'placed'
  orderId: string
  summary: OrderSummary
  placedAt: string
}

const rowSchema = z.object({
  id: z.string().regex(UUID),
  tenant_id: z.string().regex(UUID),
  app_id: z.string().regex(UUID),
  customer_id: z.string().regex(UUID),
  backend: z.enum(['platform', 'convex', 'supabase']),
  order_id: z.string().min(1).nullable(),
  idempotency_key: z.string(),
  state: z.enum(['placing', 'placed', 'failed']),
  summary: z.unknown(),
  // A status this server no longer knows is "not refreshed yet", not a bad row.
  last_status: z.enum(APP_ORDER_STATUSES).nullable().catch(null),
  last_status_at: z.string().nullable(),
  placed_at: z.string().nullable(),
  created_at: z.string(),
})

type RawRow = z.infer<typeof rowSchema>

function toRow(raw: RawRow, summary: OrderSummary | null): OrderIndexRow {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    appId: raw.app_id,
    customerId: raw.customer_id,
    backend: raw.backend,
    orderId: raw.order_id,
    idempotencyKey: raw.idempotency_key,
    state: raw.state,
    summary,
    lastStatus: raw.last_status,
    lastStatusAt: raw.last_status_at,
    placedAt: raw.placed_at,
    createdAt: raw.created_at,
  }
}

export function isPlacedRow(row: OrderIndexRow): row is PlacedOrderRow {
  return row.state === 'placed' && row.orderId !== null && row.summary !== null && row.placedAt !== null
}

// --- Results ------------------------------------------------------------------

export interface ClaimInput {
  tenantId: string
  appId: string
  customerId: string
  backend: OrderBackend
  idempotencyKey: string
}

export type ClaimResult =
  | { kind: 'claimed'; id: string }
  | { kind: 'placed'; row: PlacedOrderRow }
  | { kind: 'placing'; row: OrderIndexRow }
  | { kind: 'failed'; row: OrderIndexRow }
  /** The key belongs to another customer of this store. */
  | { kind: 'conflict' }

export interface PlacedInput {
  orderId: string
  summary: OrderSummary
  status: AppOrderStatus
}

export type ListResult =
  | { ok: true; orders: PlacedOrderRow[]; nextCursor: string | null }
  | { ok: false; error: 'bad_cursor' }

export interface ListOptions {
  limit?: number
  cursor?: string | null
}

interface Dependencies {
  log?: Logger
  now?: () => Date
}

const statusSchema = z.enum(APP_ORDER_STATUSES)
const orderIdSchema = z.string().trim().min(1).max(200)

export function isValidIdempotencyKey(key: string): boolean {
  return IDEMPOTENCY_KEY.test(key)
}

/** The order index over one injected service-role client. */
export function createOrderIndex(database: SupabaseClient, deps: Dependencies = {}) {
  const log = deps.log ?? createLogger('[Customer App Orders]', 'DEBUG_CUSTOMER_APP')
  const now = () => (deps.now ?? (() => new Date()))().toISOString()
  const failed = (detail: string) => new AppReadError('the app order index', detail)
  const table = () => database.from(TABLE)

  /** A row as stored, or null (logged) when it does not hold the shape this server writes. */
  function parse(raw: unknown): OrderIndexRow | null {
    const row = rowSchema.safeParse(raw)
    if (!row.success) {
      log.error('unreadable index row', { id: (raw as { id?: unknown } | null)?.id, issues: row.error.issues.slice(0, 3) })
      return null
    }
    if (row.data.summary === null) {
      if (row.data.state !== 'placed') return toRow(row.data, null)
      log.error('placed row without a summary', { id: row.data.id })
      return null
    }
    const summary = orderSummarySchema.safeParse(row.data.summary)
    if (!summary.success) {
      log.error('unreadable order summary', { id: row.data.id, issues: summary.error.issues.slice(0, 3) })
      return null
    }
    return toRow(row.data, summary.data)
  }

  function parsePlaced(raw: unknown): PlacedOrderRow | null {
    const row = parse(raw)
    return row && isPlacedRow(row) ? row : null
  }

  /** Conditional update by id; true only when exactly one row changed. */
  async function updateWhere(id: string, fromState: OrderIndexState, patch: Record<string, unknown>): Promise<boolean> {
    if (!UUID.test(id)) return false
    const { data, error } = await table().update(patch).eq('id', id).eq('state', fromState).select('id')
    if (error) throw failed(error.message)
    return (data ?? []).length === 1
  }

  async function claimOrderKey(input: ClaimInput): Promise<ClaimResult> {
    const { tenantId, appId, customerId, backend, idempotencyKey } = input
    if (!UUID.test(tenantId) || !UUID.test(appId) || !UUID.test(customerId)) throw failed('claim needs uuid ids')
    if (!isValidIdempotencyKey(idempotencyKey)) throw failed('claim needs an 8..100 character printable key')

    const inserted = await table()
      .upsert(
        { tenant_id: tenantId, app_id: appId, customer_id: customerId, backend, idempotency_key: idempotencyKey },
        { onConflict: 'tenant_id,idempotency_key', ignoreDuplicates: true },
      )
      .select('id')
    if (inserted.error) throw failed(inserted.error.message)
    const claimedId = (inserted.data ?? [])[0]?.id
    if ((inserted.data ?? []).length === 1 && typeof claimedId === 'string') return { kind: 'claimed', id: claimedId }

    // Nothing inserted: the key is already held. Read who holds it.
    const existing = await table().select(COLUMNS).eq('tenant_id', tenantId).eq('idempotency_key', idempotencyKey).maybeSingle()
    if (existing.error) throw failed(existing.error.message)
    if (!existing.data) throw failed('the key was neither claimed nor found')
    const ownerId = (existing.data as { customer_id?: unknown }).customer_id
    if (ownerId !== customerId) return { kind: 'conflict' }
    // An unreadable row must still block a second order: fail rather than re-place.
    const row = parse(existing.data)
    if (!row) throw failed('the claimed key holds an unreadable row')
    if (row.state === 'placed') {
      if (!isPlacedRow(row)) throw failed('placed key without its order')
      return { kind: 'placed', row }
    }
    return row.state === 'placing' ? { kind: 'placing', row } : { kind: 'failed', row }
  }

  async function markPlaced(id: string, input: PlacedInput): Promise<boolean> {
    const orderId = orderIdSchema.parse(input.orderId)
    const summary = orderSummarySchema.parse(input.summary)
    const status = statusSchema.parse(input.status)
    const at = now()
    return updateWhere(id, 'placing', {
      state: 'placed',
      order_id: orderId,
      summary,
      last_status: status,
      last_status_at: at,
      placed_at: at,
    })
  }

  /** Nothing was written for this attempt. */
  const markFailed = (id: string): Promise<boolean> => updateWhere(id, 'placing', { state: 'failed' })

  /**
   * A failed attempt wrote nothing, so the same key may try again. Pass the
   * store's backend NOW: it may have moved since the failed attempt.
   */
  async function reopenFailed(id: string, backend?: OrderBackend): Promise<boolean> {
    return updateWhere(id, 'failed', backend ? { state: 'placing', backend } : { state: 'placing' })
  }

  /**
   * Platform only: an attempt still 'placing' after `staleMs` died mid-flight
   * (a function timeout between the write and markPlaced). Its order may
   * exist; re-running it is safe because the same key is the order's
   * clientOrderId, so the engine answers with the first order (deduped) and
   * the index finally records it. Touching updated_at makes the take-over
   * itself the lock: of two retries only one row update succeeds.
   */
  async function takeOverStalePlacing(id: string, staleMs: number): Promise<boolean> {
    if (!UUID.test(id)) return false
    const cutoff = new Date(Date.parse(now()) - staleMs).toISOString()
    const { data, error } = await table()
      .update({ updated_at: now() })
      .eq('id', id)
      .eq('state', 'placing')
      .eq('backend', 'platform')
      .lt('updated_at', cutoff)
      .select('id')
    if (error) throw failed(error.message)
    return (data ?? []).length === 1
  }

  async function getCustomerOrder(tenantId: string, customerId: string, orderId: string): Promise<PlacedOrderRow | null> {
    if (!UUID.test(tenantId) || !UUID.test(customerId) || !orderIdSchema.safeParse(orderId).success) return null
    const { data, error } = await table()
      .select(COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('state', 'placed')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw failed(error.message)
    return data ? parsePlaced(data) : null
  }

  async function listCustomerOrders(tenantId: string, customerId: string, options: ListOptions = {}): Promise<ListResult> {
    const cursor = options.cursor ? decodeOrderCursor(options.cursor) : null
    if (options.cursor && !cursor) return { ok: false, error: 'bad_cursor' }
    if (!UUID.test(tenantId) || !UUID.test(customerId)) return { ok: true, orders: [], nextCursor: null }
    const limit = Math.min(ORDER_HISTORY_PAGE_SIZE, Math.max(1, Math.floor(options.limit ?? ORDER_HISTORY_PAGE_SIZE)))

    let query = table()
      .select(COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('state', 'placed')
    if (cursor) {
      // Validated above: a timestamp and a uuid, quoted for PostgREST's logic tree.
      query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`)
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)
    if (error) throw failed(error.message)

    const page = (data ?? []).slice(0, limit) as Array<{ id?: unknown; created_at?: unknown }>
    const hasMore = (data ?? []).length > limit
    const last = page[page.length - 1]
    // The cursor comes from the raw row, so a skipped (unreadable) row never stalls paging.
    const nextCursor =
      hasMore && last && typeof last.id === 'string' && typeof last.created_at === 'string'
        ? encodeOrderCursor({ createdAt: last.created_at, id: last.id })
        : null
    const orders = page.map(parsePlaced).filter((row): row is PlacedOrderRow => row !== null)
    return { ok: true, orders, nextCursor }
  }

  async function recordStatus(id: string, status: AppOrderStatus): Promise<boolean> {
    const parsed = statusSchema.parse(status)
    return updateWhere(id, 'placed', { last_status: parsed, last_status_at: now() })
  }

  return { claimOrderKey, markPlaced, markFailed, reopenFailed, takeOverStalePlacing, getCustomerOrder, listCustomerOrders, recordStatus }
}

export type OrderIndex = ReturnType<typeof createOrderIndex>
