import { NextRequest, NextResponse } from 'next/server'
import { createOrderAction } from '@/app/actions/orders'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'
import {
  MAX_CUSTOMER_APP_BODY_CHARS,
  parseCustomerAppOrder,
  toCreateOrderActionArgs,
  toCustomerAppResponse,
  type CreateOrderActionResult,
} from '@/lib/checkout/customer-app-order'

/**
 * POST /api/orders/customer-app
 *
 * Where the white-labeled customer app (`mobile/`) places an order on the
 * shared platform database. The app has no account, so the order is written by
 * the service role AFTER the same checks the web checkout runs (it is the
 * same `createOrderAction`): server pricing, hours, minimums, producible-stock
 * guard, presell claim, payment-method and order-type ownership, per-IP rate
 * limit, stock depletion and notifications.
 *
 * The anon INSERT policies on `orders` / `order_items` are what this replaces;
 * with them gone, nothing here depends on the caller's database role.
 */

/** Per client address, across every store (a phone has one address). */
const IP_LIMIT = { limit: 30, windowSec: 60, onRedisFailure: 'instance' as const }
/** Per store, across every address: a flood guard, far above any real rush. */
const TENANT_LIMIT = { limit: 300, windowSec: 60, onRedisFailure: 'instance' as const }

const RATE_LIMITED_MESSAGE = 'You’re placing orders very quickly. Please wait a minute, then try again.'

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)
  if (ip) {
    const byIp = await checkRateLimit(`customer-app-order-ip:${ip}`, IP_LIMIT)
    if (!byIp.allowed) return rateLimited(byIp.retryAfterSec)
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return NextResponse.json({ success: false, refused: false, error: 'Invalid request' }, { status: 400 })
  }
  if (text.length > MAX_CUSTOMER_APP_BODY_CHARS) {
    return NextResponse.json({ success: false, refused: false, error: 'Order is too large' }, { status: 413 })
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return NextResponse.json({ success: false, refused: false, error: 'Invalid request' }, { status: 400 })
  }

  const parsed = parseCustomerAppOrder(raw)
  if (!parsed.ok) {
    return NextResponse.json({ success: false, refused: false, error: parsed.error }, { status: 400 })
  }

  const byTenant = await checkRateLimit(`customer-app-order-tenant:${parsed.request.tenantId}`, TENANT_LIMIT)
  if (!byTenant.allowed) return rateLimited(byTenant.retryAfterSec)

  const args = toCreateOrderActionArgs(parsed.request) as Parameters<typeof createOrderAction>
  const result = (await createOrderAction(...args)) as CreateOrderActionResult
  const response = toCustomerAppResponse(result)
  return NextResponse.json(response.body, { status: response.status })
}

function rateLimited(retryAfterSec: number) {
  return NextResponse.json(
    { success: false, refused: true, error: RATE_LIMITED_MESSAGE },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  )
}
