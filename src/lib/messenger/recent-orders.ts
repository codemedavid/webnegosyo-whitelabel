/**
 * "Where is my order": this customer's newest orders at this store, read with
 * the service role (Meta calls the webhook with no session).
 *
 * Only orders already linked to this PSID ON THIS STORE are listed:
 * `customer_data.messenger_psid` is written server-side from a verified link
 * token (`recipient.ts`), never from what a browser typed. Bounded: one store,
 * the last 7 days, 3 rows, on `orders_messenger_psid_idx`.
 */

import 'server-only'
import { messengerDb } from './service-db'
import { generateShortTrackingToken } from '@/lib/tracking-token'
import { toCentavos } from './chat-cart'
import { isOrderStatus, orderLabel, readOrderKind, type ReplyOrder } from './order-view'
import type { ReplyStore } from './store-view'

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ORDERS = 3

interface OrderRow {
  id: string
  daily_number: number | null
  status: string
  total: number
  order_type: string | null
  order_type_id: string | null
}

export function trackingUrl(baseUrl: string, orderId: string): string | null {
  try {
    return `${baseUrl}/order/${orderId}?t=${generateShortTrackingToken(orderId)}`
  } catch {
    return null
  }
}

/** `order_types.type` for each id (dine_in / pickup / delivery). */
export async function readOrderTypeKinds(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const { data } = await messengerDb().from('order_types').select('id, type').in('id', unique)
  return new Map(((data ?? []) as Array<{ id: string; type: string | null }>).map((row) => [row.id, row.type ?? '']))
}

export async function loadRecentOrders(input: { tenantId: string; psid: string; store: ReplyStore; now: Date }): Promise<ReplyOrder[]> {
  const since = new Date(input.now.getTime() - LOOKBACK_MS).toISOString()
  const { data, error } = await messengerDb()
    .from('orders')
    .select('id, daily_number, status, total, order_type, order_type_id')
    .eq('tenant_id', input.tenantId)
    .eq('customer_data->>messenger_psid', input.psid)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS)
  if (error) {
    console.error('[Messenger] recent orders not readable', { code: error.code, message: error.message })
    throw new Error('recent orders not readable')
  }
  const rows = (data ?? []) as OrderRow[]
  const kinds = await readOrderTypeKinds(rows.map((row) => row.order_type_id ?? ''))
  return rows.filter((row) => isOrderStatus(row.status)).map((row) => ({
    id: row.id,
    label: orderLabel(row.daily_number, row.id),
    status: row.status as ReplyOrder['status'],
    kind: readOrderKind(row.order_type_id ? kinds.get(row.order_type_id) : null, row.order_type),
    totalCentavos: toCentavos(Number(row.total) || 0),
    trackingUrl: trackingUrl(input.store.baseUrl, row.id),
  }))
}
