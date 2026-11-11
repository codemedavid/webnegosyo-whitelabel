import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { merchantDeliveryPatchSchema } from '@/lib/delivery/order-delivery-edit'
import { saveOrderDeliveryEdit } from '@/lib/delivery/order-delivery-edit-server'
import { callerHasFeature } from '@/lib/gov-discount-ledger/caller-scope'
import { isOrderInScope, resolveBranchScope } from '@/lib/outlets/branch-scope'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/orders/delivery-details
 *
 * The merchant app fixes a placed order's address, pin and rider notes here.
 * The service key bypasses RLS, so `orders` and the branch are checked by hand,
 * as on /api/lalamove. Same rules as the web's server action (`saveOrderDeliveryEdit`).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  patch: merchantDeliveryPatchSchema,
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please check the delivery details.' }, { status: 400 })
  const { tenantId, orderId, patch } = parsed.data

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

  const result = await saveOrderDeliveryEdit(createAdminClient(), {
    tenantId,
    orderId,
    patch,
    editor: 'merchant',
    isOutletInScope: (outletId) => isOrderInScope(scope, { outletId }),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ customerData: result.customerData })
}
