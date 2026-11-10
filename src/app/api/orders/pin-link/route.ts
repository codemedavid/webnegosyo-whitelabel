import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { createOrderPinLink } from '@/lib/delivery/order-delivery-edit-server'
import { callerHasFeature } from '@/lib/gov-discount-ledger/caller-scope'
import { isOrderInScope, resolveBranchScope } from '@/lib/outlets/branch-scope'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/orders/pin-link — the merchant app's "Send pin link".
 *
 * Signing needs a secret only this server holds. Who may ask: staff with
 * `orders`, for an order in their branch.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { tenantId, orderId } = parsed.data

  const caller = await requireBearerStoreCaller(request, tenantId, 'edit')
  if (!caller.ok) return caller.response
  if (!caller.appUser || !callerHasFeature(caller.appUser, 'orders')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const scope = resolveBranchScope({
    role: caller.appUser.role,
    is_owner: caller.appUser.is_owner,
    outlet_id: caller.appUser.outlet_id,
  })

  const result = await createOrderPinLink(createAdminClient(), {
    tenantId,
    orderId,
    origin: request.nextUrl.origin,
    isOutletInScope: (outletId) => isOrderInScope(scope, { outletId }),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ url: result.url })
}
