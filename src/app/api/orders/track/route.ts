import { NextRequest, NextResponse } from 'next/server'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const orderId = searchParams.get('orderId')
  const token = searchParams.get('token')
  const tenantId = searchParams.get('tenantId')

  if (!orderId || !token || !tenantId) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  if (orderId.length > 128 || token.length > 128 || tenantId.length > 128) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // Rate limit
  const ip = getClientIP(request) ?? 'unknown'
  const limit = checkRateLimit(`order-track:${ip}`, { maxRequests: 20, windowMs: 60000 })
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { data, error } = await fetchOrderTrackingData(orderId, token, tenantId)

  if (error || !data) {
    const status = error === 'Invalid tracking token' ? 401
      : error === 'Restaurant not found' ? 404
      : 404
    return NextResponse.json({ error: error || 'Order not found' }, { status })
  }

  return NextResponse.json(data)
}
