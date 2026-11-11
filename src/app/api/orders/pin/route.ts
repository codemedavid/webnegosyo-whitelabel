import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { customerDeliveryPatchSchema } from '@/lib/delivery/order-delivery-edit'
import { saveOrderDeliveryEdit } from '@/lib/delivery/order-delivery-edit-server'
import { verifyPinLinkToken } from '@/lib/delivery/pin-link-token'
import { getClientIP } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/orders/pin — a customer drops their own pin from a link the store
 * sent them.
 *
 * Public, so the token is the whole boundary: signed for this purpose and this
 * order, and short-lived (`pin-link-token.ts`). The tracking token printed on a
 * receipt is never accepted here. It can move the pin and the words for the
 * rider, nothing else: never the fee, and never once a rider is booked. Anon has
 * no UPDATE on orders, so the write is the service role's, after those checks.
 * A wrong token and a missing order answer alike. Answers reveal nothing about
 * the order.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IP_LIMIT = { limit: 30, windowSec: 60, onRedisFailure: 'instance' as const }
const ORDER_LIMIT = { limit: 10, windowSec: 3600, onRedisFailure: 'instance' as const }
const EXPIRED_MESSAGE = 'This link has expired. Please ask the store for a new one.'

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  token: z.string().min(1).max(128),
  patch: customerDeliveryPatchSchema,
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // A request with no readable address still counts: they all share one bucket.
  const ip = getClientIP(request) ?? 'unknown'
  if (!(await checkRateLimit(`order-pin-ip:${ip}`, IP_LIMIT)).allowed) {
    return NextResponse.json({ error: 'Too many tries. Please wait a moment.' }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please set your spot on the map.' }, { status: 400 })
  const { tenantId, orderId, token, patch } = parsed.data

  // Before the per-order limit, so strangers can't fill a real order's budget.
  if (!verifyPinLinkToken(orderId, token)) return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 })
  if (!(await checkRateLimit(`order-pin:${orderId}`, ORDER_LIMIT)).allowed) {
    return NextResponse.json({ error: 'Too many changes to this order. Please call the store.' }, { status: 429 })
  }

  const result = await saveOrderDeliveryEdit(createAdminClient(), { tenantId, orderId, patch, editor: 'customer' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
