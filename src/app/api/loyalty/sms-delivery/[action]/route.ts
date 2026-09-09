import type { NextRequest, NextResponse } from 'next/server'
import { handleSmsDelivery } from '@/lib/loyalty/sms-delivery-http'

/**
 * The enrolled device's delivery port: claim, authorize, finish, recover.
 * Each call re-presents the device credential; SQL owns leases and one-use grants.
 * Gated by LOYALTY_SMS_DELIVERY_ENABLED until the pilot rollout.
 */
export async function POST(
  request: NextRequest, context: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await context.params
  return handleSmsDelivery(request, action)
}
