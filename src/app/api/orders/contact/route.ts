import { NextRequest, NextResponse } from 'next/server'
import { parseContactSubmission } from '@/lib/order-contact'
import { updateOrderContact } from '@/lib/order-contact-service'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

/**
 * POST /api/orders/contact
 *
 * The receipt-QR contact capture. Authorized by the order's HMAC tracking
 * token (verified inside the service); once-only, so a photographed receipt
 * can fill a blank but never overwrite what the customer already gave.
 * Rate-limited harder than tracking reads — it is a write.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  const limit = checkRateLimit(`order-contact:${ip}`, { maxRequests: 5, windowMs: 60000 })
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const submission = parseContactSubmission(body)
  if (!submission) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const result = await updateOrderContact(submission)
  if (result.ok) return NextResponse.json({ success: true })

  const status =
    result.error === 'invalid_token' ? 401
    : result.error === 'not_found' ? 404
    : result.error === 'already_set' ? 409
    : 503
  return NextResponse.json({ error: result.error }, { status })
}
