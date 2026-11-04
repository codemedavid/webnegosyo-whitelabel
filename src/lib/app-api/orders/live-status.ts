import { isoDateTimeSchema, type AppOrderStatus } from '@/lib/app-contract'
import type { Logger } from '@/lib/logger'
import type { OrderIndex, PlacedOrderRow } from './order-index'
import type { LiveOrderState } from './order-summary'
import { formatAppOrderNumber, isTerminalOrderStatus, toAppOrderStatus, toAppPaymentStatus } from './status-map'

/**
 * The order's live state from its backend, through the SAME reader the
 * tracking page uses (`fetchOrderTrackingContext`, all three backends) with a
 * tracking token the server mints itself. Any failure — no API_SECRET, a slow
 * or unreachable backend, an order the backend no longer has — is "no live
 * read", and the caller answers from the snapshot. Never throws.
 */

/** A live read waits at most this long before the snapshot answers instead. */
export const LIVE_READ_TIMEOUT_MS = 4000
/** History refreshes this many unfinished orders per page, at most. */
export const LIVE_REFRESH_MAX = 5
/** A status read this recently is fresh enough for a history page. */
export const LIVE_REFRESH_MIN_AGE_MS = 30_000

/** The slice of the tracking payload read here. */
export interface TrackingSnapshot {
  status?: unknown
  dailyNumber?: unknown
  promisedReadyAt?: unknown
  loyaltyIdentity?: { paymentStatus?: unknown } | null
}

export interface LiveReadDeps {
  fetchTracking: (orderId: string, token: string, tenantId: string) => Promise<{ data: TrackingSnapshot | null; error: string | null }>
  mintToken: (orderId: string) => string
  log: Logger
  timeoutMs?: number
}

const TIMED_OUT = Symbol('timed-out')

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer)
  }
}

function readyAtOf(raw: unknown): string | null {
  return typeof raw === 'string' && isoDateTimeSchema.safeParse(raw).success ? raw : null
}

/** The tracking payload → the app's live state; null when its status is not one the app knows. */
export function toLiveOrderState(data: TrackingSnapshot): LiveOrderState | null {
  const status = toAppOrderStatus(data.status)
  if (!status) return null
  return {
    status,
    paymentStatus: toAppPaymentStatus(data.loyaltyIdentity?.paymentStatus),
    estimatedReadyAt: readyAtOf(data.promisedReadyAt),
    number: formatAppOrderNumber(data.dailyNumber),
  }
}

export async function readLiveOrder(tenantId: string, orderId: string, deps: LiveReadDeps): Promise<LiveOrderState | null> {
  try {
    const token = deps.mintToken(orderId)
    const result = await withTimeout(deps.fetchTracking(orderId, token, tenantId), deps.timeoutMs ?? LIVE_READ_TIMEOUT_MS)
    if (result === TIMED_OUT) {
      deps.log.error('live order read timed out', { tenantId, orderId })
      return null
    }
    if (!result.data) {
      deps.log.error('live order read failed', { tenantId, orderId, error: result.error })
      return null
    }
    return toLiveOrderState(result.data)
  } catch (error) {
    deps.log.error('live order read threw', { tenantId, orderId, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/** Writes a changed status back to the index; a failed write only costs a later refresh. */
export async function rememberStatus(
  index: Pick<OrderIndex, 'recordStatus'>,
  row: PlacedOrderRow,
  status: AppOrderStatus,
  log: Logger,
): Promise<void> {
  if (row.lastStatus === status) return
  try {
    await index.recordStatus(row.id, status)
  } catch (error) {
    log.error('could not record order status', { id: row.id, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Unfinished orders whose status was last read more than 30 s ago (or never), newest first, at most 5. */
export function rowsToRefresh(rows: readonly PlacedOrderRow[], now: Date): PlacedOrderRow[] {
  const cutoff = now.getTime() - LIVE_REFRESH_MIN_AGE_MS
  return rows
    .filter((row) => !isTerminalOrderStatus(row.lastStatus))
    .filter((row) => {
      const readAt = row.lastStatusAt ? Date.parse(row.lastStatusAt) : Number.NaN
      return !Number.isFinite(readAt) || readAt < cutoff
    })
    .slice(0, LIVE_REFRESH_MAX)
}
