import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { generateShortTrackingToken } from '@/lib/tracking-token'

/**
 * POST /api/orders/tracking-url
 *
 * Mints the customer-facing tracking URL the merchant app prints as a QR at
 * the bottom of a receipt. The URL carries the order's HMAC tracking token;
 * the signing secret lives only on this server, so the app has to round-trip
 * here (the same trust boundary as /api/orders/track verification).
 *
 * Authenticated with the caller's own Supabase access token, and the token is
 * minted only for the caller's tenant — the same pattern as
 * /api/customers/capture-order. Without that check, anyone with a merchant
 * login could mint tracking tokens (which read customer names and totals)
 * for guessed order ids on any store.
 */

const requestSchema = z.object({
  orderId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(64),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { orderId, tenantId } = parsed.data

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single()

  if (!tenant?.slug) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const token = generateShortTrackingToken(orderId)
  const url = `${request.nextUrl.origin}/${tenant.slug}/order/${encodeURIComponent(orderId)}?t=${token}`

  return NextResponse.json({ url })
}
