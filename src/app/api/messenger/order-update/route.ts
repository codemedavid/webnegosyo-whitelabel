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

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { defineRoute } from '@/platform/http/define-route'
import { createOrderUpdateDeps } from '@/lib/messenger/order-update-deps'
import { runOrderUpdate } from '@/lib/messenger/order-update'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/**
 * Per source address: pg_net posts from the database's own addresses, so a
 * flood of made-up ids from elsewhere fills only its own bucket and can never
 * starve the real calls (pg_net fires once; a 429 would lose that message).
 */

export const POST = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'msgr-order-update', per: 'ip', max: 600, window: '1m', onRedisFailure: 'instance' },
  body: z.object({ order_id: z.string().regex(UUID) }),
  handler: async ({ body }) => {
    try {
      const result = await runOrderUpdate(body.order_id, createOrderUpdateDeps())
      return NextResponse.json(result)
    } catch (error) {
      console.error('[Messenger order update] failed', { message: error instanceof Error ? error.message : String(error) })
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
  },
})
