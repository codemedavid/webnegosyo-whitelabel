import { NextRequest, NextResponse } from 'next/server'
import { issuePassForReceipt } from '@/lib/loyalty/wallet-pass/issue-http'
import { buildSignedPkpass, PKPASS_CONTENT_TYPE } from '@/lib/loyalty/wallet-pass/apple-pkpass'
import { PLATFORM_LOGO_PATH } from '@/lib/loyalty/wallet-pass/pass-service'

export const runtime = 'nodejs'

/**
 * GET /api/loyalty/passes/apple?orderId=&tenantId=&token=
 *
 * Downloads the member's Apple Wallet card for the number on this receipt.
 * A plain GET link on purpose: Safari opens a `.pkpass` response straight
 * into the "Add to Apple Wallet" sheet.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const issued = await issuePassForReceipt(request, 'apple')
  if (issued instanceof NextResponse) return issued
  const { config, rendered } = issued

  try {
    const pkpass = await buildSignedPkpass(rendered.content, config.apple!, `${config.publicBaseUrl}${PLATFORM_LOGO_PATH}`)
    return new NextResponse(new Uint8Array(pkpass), {
      status: 200,
      headers: {
        'Content-Type': PKPASS_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="loyalty-card.pkpass"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[wallet-pass] pkpass build failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
