import type { NextRequest, NextResponse } from 'next/server'
import { handleOutboxDelivery } from '@/lib/sms-automations/api/device-http'

/**
 * The enrolled phone's port for automated texts: claim, finish.
 * Gated by LOYALTY_SMS_DELIVERY_ENABLED with the rest of the phone gateway.
 */
export async function POST(
  request: NextRequest, context: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await context.params
  return handleOutboxDelivery(request, action)
}
