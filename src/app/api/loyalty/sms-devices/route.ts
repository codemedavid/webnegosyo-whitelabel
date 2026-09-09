import type { NextRequest, NextResponse } from 'next/server'
import { handleSmsDeviceEnroll, handleSmsDeviceRevoke } from '@/lib/loyalty/sms-delivery-http'

/**
 * Owner-controlled registry of Android handsets allowed to deliver loyalty OTPs.
 * POST mints a fresh device ID and one-time credential; DELETE retires one.
 * Gated by LOYALTY_SMS_DELIVERY_ENABLED until the pilot rollout.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleSmsDeviceEnroll(request)
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return handleSmsDeviceRevoke(request)
}
