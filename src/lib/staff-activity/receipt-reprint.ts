/**
 * "Ana reprinted #12 receipt" — the Store Activity line for a receipt printed
 * again by hand in the merchant app.
 *
 * The activity kind `receipt.reprinted` has existed since the Store Activity
 * floor (20261012150000) but nothing wrote it, so a reprinted receipt left no
 * trace. The app reports each manual reprint AFTER the paper came out; this
 * module parses that report strictly and shapes the one `store_activity_write`
 * call the route makes as the service role (store_activity has no client
 * grants). The actor always comes from the verified token, never the body,
 * and so does the backend: the route resolves it from the tenant row
 * (resolveOrderBackend); a `backend` the app still sends is accepted and
 * ignored.
 */

import { z } from 'zod'
import type { OrderBackend } from '@/lib/order-backend'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The app's backend names (lib/staff-activity/report-pos-sale.ts): parsed for shape, never trusted. */
const APP_BACKEND_NAMES = ['platform_supabase', 'tenant_supabase', 'convex'] as const

/** One activity row per order per minute: a jammed printer tapped five times is one line. */
export const REPRINT_DEDUPE_WINDOW_MS = 60_000

const MAX_DAILY_NUMBER = 100_000

export const receiptReprintRequestSchema = z
  .object({
    tenantId: z.string().regex(UUID_RE),
    backend: z.enum(APP_BACKEND_NAMES).optional(),
    orderId: z.string().trim().min(1).max(128),
    dailyNumber: z.number().int().positive().max(MAX_DAILY_NUMBER).nullish(),
    outletId: z.string().regex(UUID_RE).nullish(),
  })
  .strict()

export type ReceiptReprintRequest = z.infer<typeof receiptReprintRequestSchema>

/** Same label `store_activity_order_label` builds in SQL: "#07", else "#" + the id's first 8. */
export function reprintOrderLabel(dailyNumber: number | null | undefined, orderId: string): string {
  if (dailyNumber && dailyNumber > 0) return `#${String(dailyNumber).padStart(2, '0')}`
  return `#${orderId.trim().slice(0, 8).toUpperCase()}`
}

export function reprintEventKey(tenantId: string, orderId: string, nowMs: number): string {
  return `receipt_reprints:${tenantId}:${orderId}:${Math.floor(nowMs / REPRINT_DEDUPE_WINDOW_MS)}`
}

export interface ReprintActivityInput {
  request: ReceiptReprintRequest
  actorUserId: string
  actorEmail: string | null | undefined
  /** resolveOrderBackend(tenant) — the server's, never the body's. */
  backend: OrderBackend
  /** The branch the line is filed under (decided by the route, never just the body). */
  outletId: string | null
  /** The order's daily number when the route read it from the platform. */
  dailyNumber: number | null
  nowMs: number
}

/** Named arguments for public.store_activity_write. */
export function buildReprintActivityArgs(input: ReprintActivityInput): Record<string, unknown> {
  const { request, nowMs } = input
  const label = reprintOrderLabel(input.dailyNumber ?? request.dailyNumber, request.orderId)
  return {
    p_tenant_id: request.tenantId,
    p_kind: 'receipt.reprinted',
    p_event_key: reprintEventKey(request.tenantId, request.orderId, nowMs),
    p_source_table: 'receipt_reprints',
    p_source_id: request.orderId,
    p_occurred_at: new Date(nowMs).toISOString(),
    p_outlet_id: input.outletId,
    p_actor_user_id: input.actorUserId,
    p_actor_name: (input.actorEmail ?? '').split('@')[0] || 'Staff',
    p_subject_type: 'order',
    p_subject_ref: request.orderId,
    p_order_number: label,
    p_backend: input.backend,
    p_external_order_id: request.orderId,
    p_summary: { title: `Reprinted ${label} receipt` },
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
