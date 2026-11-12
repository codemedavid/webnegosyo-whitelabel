/**
 * POST /api/push/customer-order — a push to the customer for a status change
 * of an order they placed from a store's app (P7).
 *
 * Called by the `orders_customer_app_push` trigger (pg_net) with
 * `{ order_id }`. Unauthenticated on purpose, like /api/push/notify-order and
 * /api/messenger/order-update: the body is only an id, the order and the app
 * index row are re-read with the service role, and the (order, status) claim
 * makes a replay a no-op. A caller can at most make the customer get, once,
 * the push for the order's CURRENT status.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createCustomerOrderPushDeps } from '@/lib/app-api/push/order-push-deps'
import { runCustomerOrderPush } from '@/lib/app-api/push/run-order-push'
import { refuseOverIpLimit } from '@/lib/http/rate-limit-guard'
import { PG_NET_IP_LIMIT } from '@/lib/push/push-route-helpers'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const overLimit = await refuseOverIpLimit(request, 'customer-order-push', PG_NET_IP_LIMIT)
  if (overLimit) return overLimit

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const orderId = (body as { order_id?: unknown } | null)?.order_id
  if (typeof orderId !== 'string' || !UUID.test(orderId)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  try {
    const result = await runCustomerOrderPush(orderId, createCustomerOrderPushDeps())
    return NextResponse.json(result)
  } catch (error) {
    console.error('[customer-order-push] failed', { message: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
