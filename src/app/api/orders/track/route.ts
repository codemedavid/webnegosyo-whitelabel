import { NextRequest, NextResponse } from 'next/server'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { getClientIP } from '@/lib/rate-limit'

/**
 * Counted across every instance now, so the number had to change: a tracking page
 * polls every 5-10 s, and the old 20 a minute would refuse the third diner behind
 * one Wi-Fi or carrier IP. Every read still needs the order's HMAC token.
 */
const TRACK_IP_LIMIT = { limit: 300, windowSec: 60 }

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
  const limit = await checkRateLimit(`order-track:${ip}`, TRACK_IP_LIMIT)
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
