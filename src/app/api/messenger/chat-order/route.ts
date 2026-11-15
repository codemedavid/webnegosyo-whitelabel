/**
 * POST /api/messenger/chat-order — the summary of an order staff rang up for a
 * Messenger customer, sent to that customer to confirm.
 *
 * Called by the `orders_messenger_chat_order` trigger (pg_net) with
 * `{ order_id }` when the register saves an order naming a chat.
 * Unauthenticated on purpose, like /api/messenger/order-update: the body is
 * only an id, the order, its dishes and the chat are re-read with the service
 * role, the chat must belong to the order's own store, and the one claim row
 * per order makes a replay a no-op — a caller can at most make the customer
 * get the summary staff already sent them, once.
 *
 * The work runs after the response: the register writes an order's dishes a
 * moment after the order itself, and waiting for them must not hold pg_net's
 * connection open.
 */

import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { defineRoute } from '@/platform/http/define-route'
import { createChatOrderDeps } from '@/lib/messenger/chat-order-deps'
import { runChatOrder } from '@/lib/messenger/chat-order'

export const runtime = 'nodejs'
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST = defineRoute({
  auth: { kind: 'public' },
  // Per source address: pg_net posts from the database's own addresses, so a
  // flood of made-up ids from elsewhere fills only its own bucket.
  rateLimit: { bucket: 'msgr-chat-order', per: 'ip', max: 300, window: '1m', onRedisFailure: 'instance' },
  body: z.object({ order_id: z.string().regex(UUID) }),
  handler: async ({ body }) => {
    after(async () => {
      try {
        const result = await runChatOrder(body.order_id, createChatOrderDeps())
        if (result.outcome !== 'sent' && result.outcome !== 'duplicate' && result.outcome !== 'not_a_chat_order') {
          console.warn('[Messenger chat order] summary not sent', { outcome: result.outcome })
        }
      } catch (error) {
        console.error('[Messenger chat order] failed', { message: error instanceof Error ? error.message : String(error) })
      }
    })
    return NextResponse.json({ accepted: true }, { status: 202 })
  },
})
