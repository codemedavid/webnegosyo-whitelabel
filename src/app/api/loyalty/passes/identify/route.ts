/**
 * POST /api/loyalty/passes/identify  { tenantId, code }
 *
 * The register scanned a customer's wallet card: which member is it? Returns
 * the phone number the card belongs to, so the POS can attach that guest to
 * the sale and the sale earns like any other phone-linked order.
 *
 * Bearer-authenticated as a staff member of THIS store who may ring sales
 * (`pos`). A card issued by another store is "not found" — never resolved.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccessStoreAdmin } from '@/lib/platform-staff/permissions'
import { asAppUserQueryClient, fetchAppUserScope } from '@/lib/queries/fetch-app-user-scope'
import { hasPermission } from '@/lib/staff-permissions'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMemberCode } from '@/lib/loyalty/wallet-pass/member-code'
import { identifyMemberBySerial } from '@/lib/loyalty/wallet-pass/pass-service'

export const runtime = 'nodejs'

const IDENTIFY_LIMIT = { maxRequests: 60, windowMs: 60_000 }

function json(body: object, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(request) ?? 'unknown'
  if (!checkRateLimit(`wallet-identify:${ip}`, IDENTIFY_LIMIT).allowed) return json({ error: 'Too many requests' }, 429)

  let body: { tenantId?: unknown; code?: unknown } | null = null
  try {
    body = await request.json()
  } catch {
    // Handled below.
  }
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : ''
  const serial = parseMemberCode(body?.code)
  if (!tenantId) return json({ error: 'Invalid request' }, 400)
  if (!serial) return json({ error: 'not_a_member_card' }, 422)

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  const mayRingSales = appUser !== null && canAccessStoreAdmin(appUser, tenantId, 'view') && hasPermission({
    role: appUser.role,
    is_owner: appUser.is_owner ?? false,
    permissions: appUser.permissions ?? null,
  }, 'pos')
  if (!mayRingSales) return json({ error: 'Forbidden' }, 403)

  try {
    const member = await identifyMemberBySerial(createAdminClient(), tenantId, serial)
    if (!member) return json({ error: 'not_found' }, 404)
    return json({ success: true, phoneE164: member.phoneE164 }, 200)
  } catch (error) {
    console.error('[wallet-pass] identify failed:', error instanceof Error ? error.message : error)
    return json({ error: 'unavailable' }, 503)
  }
}
