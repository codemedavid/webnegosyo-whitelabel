import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseLifecycleSyncRequest, type LifecycleSyncEvent } from '@/lib/customer-lifecycle-sync'
import { ORDER_READ_KEYS } from '@/lib/staff-permissions'
import { defineRoute } from '@/platform/http/define-route'

/**
 * POST /api/customers/sync-order-lifecycle
 *
 * Keeps the platform's side of an order in step once it has moved: the staff
 * activity log, the Senior/PWD sales book and loyalty for every store, and the
 * customer ledger for a store whose orders live in its own deployment.
 *
 * The merchant app and the web admin both call this whenever an order's status
 * or payment state changes. Best-effort for the caller: the real change is
 * already committed to the order's own backend, this is the projection
 * catching up, and the write is idempotent so a retry is safe.
 *
 * Everything below runs as the service role, so the route decides three things
 * before it writes:
 *
 * - WHO: a member of the store (the caller's own token; the tenant is checked
 *   against their account, never taken from the body alone) holding one of
 *   ORDER_READ_KEYS. Those are the keys the orders UPDATE policy asks for, so
 *   every account that can move an order on any screen (queue, kitchen board,
 *   register, floor, scanner) holds one, and an account that holds none has no
 *   order move to report.
 * - WHICH ORDER, on a platform store: the store's row says where its orders
 *   live (`resolveOrderBackend`), whatever backend the body names. The order
 *   must be the store's and, for a branch account, its own branch's (404), and
 *   a reported status must be the one the saved order shows (409). The branch,
 *   source and total on the activity line come from the saved order.
 * - A store on its own deployment: the order cannot be read from here, so the
 *   reported status is taken as sent, as it always was. A branch account's
 *   line is filed under its own branch; a store-wide account may name one of
 *   the store's branches.
 */

/**
 * The body, through the route's own parser. The event is stamped on RECEIPT,
 * not by the sender: ordering these events by a handset's clock would let one
 * register with a skewed clock permanently out-rank another. A caller that
 * genuinely knows the time (a backfill reading historic orders) may still
 * supply its own.
 */
const lifecycleBody = z.unknown().transform((raw, ctx): { event: LifecycleSyncEvent; deviceTotal: number | null } => {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const stamped = input ? { ...input, updatedAt: input.updatedAt ?? new Date().toISOString() } : raw
  const parsed = parseLifecycleSyncRequest(stamped)
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error })
    return z.NEVER
  }
  const sent = input?.orderTotal
  return { event: parsed.value, deviceTotal: typeof sent === 'number' && sent >= 0 ? sent : null }
})

function refused(status: 404 | 409 | 503, error: string): NextResponse {
  return NextResponse.json({ error }, { status })
}

export const POST = defineRoute({
  auth: {
    kind: 'staff',
    session: 'bearer',
    permission: ORDER_READ_KEYS,
    branch: 'own',
    access: 'edit',
    storeClaim: ({ body }) => body.event.tenantId,
  },
  body: lifecycleBody,
  // The parser's own sentence, as this route has always answered a bad body.
  onRefusal: (refusal) =>
    refusal.code === 'invalid'
      ? NextResponse.json({ error: refusal.issues?.[0]?.message ?? 'Invalid request' }, { status: 400 })
      : undefined,
  handler: async ({ tenant, user, outletId: callerOutletId, body }) => {
    const { event: posted, deviceTotal } = body

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { checkCallerOrder, resolveEventOutlet } = await import('@/lib/auth/caller-order')
    const { syncOrderLifecycle } = await import('@/lib/customer-lifecycle-sync')
    const { createSupabaseLifecycleDeps } = await import('@/lib/customer-lifecycle-store')
    const { runLoyaltyForOrder } = await import('@/lib/loyalty/lifecycle')

    const admin = createAdminClient()

    let event: LifecycleSyncEvent
    let orderTotal: number | null
    try {
      const check = await checkCallerOrder(admin, {
        tenantId: tenant,
        orderId: posted.externalOrderId,
        callerOutletId,
      })
      if (check.backend === 'platform') {
        const order = check.order
        if (!order) return refused(404, 'Order not found')
        if (posted.status && posted.status !== order.status) return refused(409, 'The order is not in that status.')
        event = { ...posted, backend: 'platform_supabase', outletId: order.outletId, source: order.source }
        orderTotal = order.total
      } else {
        const outletId = await resolveEventOutlet(admin, { tenantId: tenant, callerOutletId, named: posted.outletId })
        event = { ...posted, outletId }
        // The amount the device reported: the order itself cannot be read from here.
        orderTotal = deviceTotal
      }
    } catch (error) {
      console.error('[sync-order-lifecycle] order check failed', {
        tenantId: tenant,
        externalOrderId: posted.externalOrderId,
        error: error instanceof Error ? error.message : String(error),
      })
      return refused(503, 'Could not check the order. Try again.')
    }

    // The staff activity log rides on this post: it is the one place every
    // register surface already reports a status move WITH the actor's token.
    // Best-effort and before the ledger sync, so a `not_found` (anonymous
    // guest) still leaves the confirm on record.
    if (event.status) {
      const { createSupabaseOrderEventStore, recordOrderEventBestEffort } = await import(
        '@/lib/staff-activity/record-order-event'
      )
      await recordOrderEventBestEffort(createSupabaseOrderEventStore(admin), {
        tenantId: tenant,
        outletId: event.outletId,
        backend: event.backend,
        externalOrderId: event.externalOrderId,
        event: 'status_changed',
        status: event.status,
        source: event.source,
        orderTotal,
        actorUserId: user.id,
        actorName: user.email ?? 'Staff',
        reason: event.reason,
        note: event.note,
      })
    }

    // A cancelled order's Senior/PWD discount comes out of the sales book (any
    // backend — the book lives on the platform). Idempotent and best-effort.
    if (event.status === 'cancelled') {
      const { reverseGovGrantsBestEffort } = await import('@/lib/gov-discount-ledger/reverse-on-cancel')
      await reverseGovGrantsBestEffort(
        admin,
        { tenantId: tenant, backend: event.backend, externalOrderId: event.externalOrderId },
        { userId: user.id, name: user.email ?? 'Staff' },
      )
    }

    const result = await syncOrderLifecycle(event, createSupabaseLifecycleDeps(admin))

    // Loyalty runs on every event the ledger knows about — including a replay
    // the sync found `unchanged`, because the previous attempt may have written
    // the ledger and then failed before earning. The earning write is idempotent
    // at the database, so the retry costs a query and never a second stamp.
    const loyalty =
      result === 'not_found'
        ? null
        : await runLoyaltyForOrder(admin, {
            tenantId: tenant,
            backend: event.backend,
            externalOrderId: event.externalOrderId,
          })

    // `not_found` is a normal outcome, not a failure: an anonymous order never
    // produced a ledger row, and there is nothing to keep in step.
    return NextResponse.json({ success: true, result, loyalty })
  },
})
