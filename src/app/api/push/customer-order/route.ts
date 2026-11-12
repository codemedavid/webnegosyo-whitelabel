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
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createCustomerOrderPushDeps } from '@/lib/app-api/push/order-push-deps'
import { runCustomerOrderPush } from '@/lib/app-api/push/run-order-push'
import { PG_NET_IP_LIMIT } from '@/lib/push/push-route-helpers'
import { defineRoute } from '@/platform/http/define-route'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST = defineRoute({
  auth: { kind: 'public' },
  // Called by the database through pg_net, never retried: generous, per address.
  rateLimit: { bucket: 'customer-order-push', per: 'ip', max: PG_NET_IP_LIMIT.limit, window: '1m' },
  body: z.object({ order_id: z.string().regex(UUID) }),
  handler: async ({ body }) => {
    try {
      const result = await runCustomerOrderPush(body.order_id, createCustomerOrderPushDeps())
      return NextResponse.json(result)
    } catch (error) {
      console.error('[customer-order-push] failed', { message: error instanceof Error ? error.message : String(error) })
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
  },
})
