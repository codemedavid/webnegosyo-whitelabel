import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { parseOrderActivityRequest } from '@/lib/staff-activity/order-activity-request'

/**
 * POST /api/staff/order-activity
 *
 * The register reporting that it rang a sale, so the cashier's "punched
 * through POS" count lives in the same log as their confirms and cancels.
 * Status moves never come here — they ride the customer lifecycle post.
 *
 * Same shape and reasons as the sibling customer routes: the caller's own
 * token identifies the actor, the tenant check is the CALLER's tenant, the
 * write runs service-role, and it is best-effort because the sale is already
 * saved in the store's own backend.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const parsed = parseOrderActivityRequest(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const activity = parsed.value

  const caller = await requireBearerStoreCaller(request, activity.tenantId, 'create')
  if (!caller.ok) return caller.response
  const { user } = caller

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { createSupabaseOrderEventStore, recordOrderEvent } = await import(
    '@/lib/staff-activity/record-order-event'
  )
  try {
    const outcome = await recordOrderEvent(createSupabaseOrderEventStore(createAdminClient()), {
      tenantId: activity.tenantId,
      outletId: activity.outletId,
      backend: activity.backend,
      externalOrderId: activity.externalOrderId,
      event: 'placed',
      status: activity.status,
      source: activity.source,
      orderTotal: activity.orderTotal,
      actorUserId: user.id,
      actorName: user.email ?? 'Staff',
    })
    return NextResponse.json({ success: true, outcome })
  } catch (error) {
    console.error('[order-activity] write failed', error)
    return NextResponse.json({ error: 'Could not record the sale.' }, { status: 500 })
  }
}
