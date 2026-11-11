import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseOrderActivityRequest, type OrderActivityRequest } from '@/lib/staff-activity/order-activity-request'
import { ORDER_READ_KEYS } from '@/lib/staff-permissions'
import { defineRoute } from '@/platform/http/define-route'

/**
 * POST /api/staff/order-activity
 *
 * The register reporting that it rang a sale, so the cashier's "punched
 * through POS" count lives in the same log as their confirms and cancels.
 * Status moves never come here — they ride the customer lifecycle post.
 *
 * Best-effort for the caller (the sale is already saved in the store's own
 * backend), and the line is written as the service role, so the route decides
 * for itself what goes on it:
 *
 * - WHO: the caller's own token names the actor; they must be a member of the
 *   store holding one of ORDER_READ_KEYS, the keys the orders INSERT policy
 *   asks for. Whoever can place an order from the register or the floor holds
 *   one; an account that holds none has no sale to report.
 * - A platform store (decided by the store's row, never the body): the order
 *   must be the store's and, for a branch account, its own branch's (404). The
 *   branch, the source and the TOTAL on the line are the saved order's.
 * - A store on its own deployment: the order cannot be read from here. A
 *   branch account's line is filed under its own branch; a store-wide account
 *   may name one of the store's branches. The total is the amount the device
 *   reported, the only figure there is (see `OrderStatusEvent.orderTotal`).
 */

/** The body, through the route's own parser. */
const activityBody = z.unknown().transform((raw, ctx): OrderActivityRequest => {
  const parsed = parseOrderActivityRequest(raw)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error })
    return z.NEVER
  }
  return parsed.value
})

export const POST = defineRoute({
  auth: {
    kind: 'staff',
    session: 'bearer',
    permission: ORDER_READ_KEYS,
    branch: 'own',
    access: 'create',
    storeClaim: ({ body }) => body.tenantId,
  },
  body: activityBody,
  // The parser's own sentence, as this route has always answered a bad body.
  onRefusal: (refusal) =>
    refusal.code === 'invalid'
      ? NextResponse.json({ error: refusal.issues?.[0]?.message ?? 'Invalid request' }, { status: 400 })
      : undefined,
  handler: async ({ tenant, user, outletId: callerOutletId, body: activity }) => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { checkCallerOrder, resolveEventOutlet } = await import('@/lib/auth/caller-order')
    const { createSupabaseOrderEventStore, recordOrderEvent } = await import(
      '@/lib/staff-activity/record-order-event'
    )
    const admin = createAdminClient()

    let facts: Pick<OrderActivityRequest, 'backend' | 'outletId' | 'source' | 'orderTotal'>
    try {
      const check = await checkCallerOrder(admin, {
        tenantId: tenant,
        orderId: activity.externalOrderId,
        callerOutletId,
      })
      if (check.backend === 'platform') {
        const order = check.order
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        facts = { backend: 'platform_supabase', outletId: order.outletId, source: order.source, orderTotal: order.total }
      } else {
        facts = {
          backend: activity.backend,
          outletId: await resolveEventOutlet(admin, { tenantId: tenant, callerOutletId, named: activity.outletId }),
          source: activity.source,
          // Reported by the device: the order itself cannot be read from here.
          orderTotal: activity.orderTotal,
        }
      }
    } catch (error) {
      console.error('[order-activity] order check failed', {
        tenantId: tenant,
        externalOrderId: activity.externalOrderId,
        error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json({ error: 'Could not check the order. Try again.' }, { status: 503 })
    }

    try {
      const outcome = await recordOrderEvent(createSupabaseOrderEventStore(admin), {
        tenantId: tenant,
        outletId: facts.outletId,
        backend: facts.backend,
        externalOrderId: activity.externalOrderId,
        event: 'placed',
        status: activity.status,
        source: facts.source,
        orderTotal: facts.orderTotal,
        actorUserId: user.id,
        actorName: user.email ?? 'Staff',
      })
      return NextResponse.json({ success: true, outcome })
    } catch (error) {
      console.error('[order-activity] write failed', error)
      return NextResponse.json({ error: 'Could not record the sale.' }, { status: 500 })
    }
  },
})
