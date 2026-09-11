import { NextRequest, NextResponse } from 'next/server'
import { getOrderStampStatus } from '@/lib/loyalty/order-stamp-service'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

/**
 * GET /api/orders/stamps?orderId=&tenantId=&token=
 *
 * The tracking page's loyalty read: whether this receipt may still claim a
 * stamp, and the current progress linked to its saved phone number. Same
 * authorization as `/api/orders/track` — the order's HMAC tracking token —
 * and, like it, a read, so the limit is the looser one.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  const limit = checkRateLimit(`order-stamps:${ip}`, { maxRequests: 30, windowMs: 60000 })
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const params = request.nextUrl.searchParams
  const orderId = params.get('orderId')?.trim() ?? ''
  const tenantId = params.get('tenantId')?.trim() ?? ''
  const token = params.get('token')?.trim() ?? ''
  if (!orderId || !tenantId || !token) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const result = await getOrderStampStatus({ orderId, tenantId, token })
  if (result.ok) {
    return NextResponse.json({ success: true, ...result.status }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const status =
    result.error === 'invalid_token' ? 401
    : result.error === 'not_found' ? 404
    : 503
  return NextResponse.json({ error: result.error }, { status })
}
