import { NextRequest, NextResponse } from 'next/server'
import { issuePassForReceipt } from '@/lib/loyalty/wallet-pass/issue-http'
import { prepareGoogleSaveUrl } from '@/lib/loyalty/wallet-pass/pass-service'

export const runtime = 'nodejs'

/**
 * GET /api/loyalty/passes/google?orderId=&tenantId=&token=
 *
 * Writes the member's Google Wallet card, then redirects to Google's
 * "Save to Google Wallet" page for it.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const issued = await issuePassForReceipt(request, 'google')
  if (issued instanceof NextResponse) return issued
  const { admin, config, rendered } = issued

  try {
    const saveUrl = await prepareGoogleSaveUrl(admin, rendered, config)
    if (!saveUrl) return NextResponse.json({ error: 'This wallet is not available yet' }, { status: 404 })
    return NextResponse.redirect(saveUrl, { status: 303, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[wallet-pass] Google save failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
