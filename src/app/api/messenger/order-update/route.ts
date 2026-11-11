/**
 * POST /api/messenger/order-update — a status message for an order that came
 * from a Messenger chat.
 *
 * Called by the `orders_messenger_order_update` trigger (pg_net) with
 * `{ order_id }`. Unauthenticated on purpose, like /api/push/notify-order: the
 * body is only an id, the order and everything else is re-read with the
 * service role, and the (order, status) claim makes a replay a no-op — a
 * caller can at most make the customer get the message the owner already
 * chose for the order's CURRENT status, once.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import { createOrderUpdateDeps } from '@/lib/messenger/order-update-deps'
import { runOrderUpdate } from '@/lib/messenger/order-update'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/**
 * Per source address: pg_net posts from the database's own addresses, so a
 * flood of made-up ids from elsewhere fills only its own bucket and can never
 * starve the real calls (pg_net fires once; a 429 would lose that message).
 */
const ROUTE_LIMIT = { limit: 600, windowSec: 60 }

export async function POST(request: NextRequest) {
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

  const limit = await checkRateLimit(`msgr-order-update:${getClientIP(request) ?? 'unknown'}`, { ...ROUTE_LIMIT, onRedisFailure: 'instance' })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  try {
    const result = await runOrderUpdate(orderId, createOrderUpdateDeps())
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Messenger order update] failed', { message: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
