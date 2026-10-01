/**
 * Shared front half of the two "Add to … Wallet" routes.
 *
 * A pass is handed out only for a receipt the customer can prove they hold —
 * the order's HMAC tracking token — and only for the number already on that
 * order. Nobody can mint a pass by typing a phone number, so a pass cannot be
 * used to follow a stranger's card.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrderLoyaltyMember } from '../order-stamp-service'
import { loadWalletConfig, type WalletConfig } from './config'
import { issuePass, type RenderedPass } from './pass-service'

const ISSUE_LIMIT = { maxRequests: 10, windowMs: 60_000 }

export interface IssuedPass {
  admin: ReturnType<typeof createAdminClient>
  config: WalletConfig
  rendered: RenderedPass
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function issuePassForReceipt(
  request: NextRequest,
  wallet: 'apple' | 'google',
): Promise<IssuedPass | NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  if (!checkRateLimit(`wallet-pass:${ip}`, ISSUE_LIMIT).allowed) return errorResponse('Too many requests', 429)

  const config = loadWalletConfig()
  if (!config[wallet]) return errorResponse('This wallet is not available yet', 404)

  const params = request.nextUrl.searchParams
  const orderId = params.get('orderId')?.trim() ?? ''
  const tenantId = params.get('tenantId')?.trim() ?? ''
  const token = params.get('token')?.trim() ?? ''
  if (!orderId || !tenantId || !token) return errorResponse('Invalid request', 400)

  const resolution = await resolveOrderLoyaltyMember({ orderId, tenantId, token })
  if (!resolution.ok) {
    const status = resolution.error === 'invalid_token' ? 401 : resolution.error === 'not_found' ? 404 : 503
    return errorResponse(resolution.error, status)
  }
  if (!resolution.member) return errorResponse('No loyalty card for this order yet', 409)

  try {
    const admin = createAdminClient()
    const rendered = await issuePass(admin, resolution.member, config.publicBaseUrl)
    if (!rendered) return errorResponse('No loyalty card for this order yet', 409)
    return { admin, config, rendered }
  } catch (error) {
    console.error('[wallet-pass] issue failed:', error instanceof Error ? error.message : error)
    return errorResponse('unavailable', 503)
  }
}
