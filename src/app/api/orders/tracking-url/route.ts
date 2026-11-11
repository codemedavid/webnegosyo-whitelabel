import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { z } from 'zod'
import { generateShortTrackingToken } from '@/lib/tracking-token'
import { fetchOrderTrackingContext } from '@/lib/order-tracking-service'
import { hasAnyPermission, ORDER_READ_KEYS } from '@/lib/staff-permissions'
import { isOrderInScope, resolveBranchScope } from '@/lib/outlets/branch-scope'

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
 *
 * The token is an HMAC of the order id alone, so being a member of `tenantId`
 * is not enough: the order itself must be found inside that tenant (on the
 * tenant's own backend) before anything is signed. Otherwise an admin of one
 * store could mint a working token for another store's order id.
 *
 * The token reads the order, so the caller must also be allowed to read
 * orders (`ORDER_READ_KEYS`, as the orders SELECT policy), and a branch-locked
 * account only gets tokens for its own branch's orders.
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

  const caller = await requireBearerStoreCaller(request, tenantId, 'view')
  if (!caller.ok) return caller.response
  const appUser = caller.appUser
  if (!appUser || !hasAnyPermission(appUser, ORDER_READ_KEYS)) {
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
  // Same tenant-scoped, backend-aware read the tracking page uses — so a token
  // is only ever handed out for an order the tracking page would show.
  const { data: order } = await fetchOrderTrackingContext(orderId, token, tenantId)
  const branchScope = resolveBranchScope({
    role: appUser.role,
    is_owner: appUser.is_owner,
    outlet_id: appUser.outlet_id,
  })
  // Another branch's order reads as missing, as it would through RLS.
  if (!order || !isOrderInScope(branchScope, { outletId: order.loyaltyIdentity.outletId })) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const url = `${request.nextUrl.origin}/${tenant.slug}/order/${encodeURIComponent(orderId)}?t=${token}`

  return NextResponse.json({ url })
}
