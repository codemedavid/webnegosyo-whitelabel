import type { NextRequest, NextResponse } from 'next/server'
import { handleSmsGatewaySettings } from '@/lib/loyalty/sms-settings-http'

/**
 * Reward-code delivery settings for the merchant app: gateway phone presence
 * and the store's Semaphore fallback. Gated by LOYALTY_SMS_DELIVERY_ENABLED.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleSmsGatewaySettings(request)
}
