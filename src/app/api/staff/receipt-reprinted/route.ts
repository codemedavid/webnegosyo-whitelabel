import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { hasAnyPermission, ORDER_READ_KEYS } from '@/lib/staff-permissions'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import {
  buildReprintActivityArgs,
  isUuid,
  receiptReprintRequestSchema,
  type ReceiptReprintRequest,
} from '@/lib/staff-activity/receipt-reprint'

/**
 * POST /api/staff/receipt-reprinted
 *
 * The merchant app reporting that a cashier printed a receipt again by hand,
 * so Store Activity (and the order's own history) shows "Ana reprinted #12
 * receipt". Sent fire-and-forget AFTER the paper came out: printing never
 * waits on this route.
 *
 * Same door as the sibling bearer routes: the caller's own token names the
 * actor, they must belong to the store AND be allowed to read its orders
 * (ORDER_READ_KEYS — anyone who can open an order can reprint it), and the
 * write runs as the service role because store_activity has no client grants.
 * A platform order is looked up inside the tenant first (its branch and daily
 * number come from the row, and a branch account cannot file a line against
 * another branch's order). One row per order per minute (event_key).
 */

const RATE_LIMIT: RateLimitOptions = { limit: 60, windowSec: 60, onRedisFailure: 'instance' }

interface OrderFacts {
  outletId: string | null
  dailyNumber: number | null
}

type AdminClient = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>

/** The platform row, or null when the tenant holds no such order. */
async function readPlatformOrder(admin: AdminClient, request: ReceiptReprintRequest): Promise<OrderFacts | null> {
  if (!isUuid(request.orderId)) return null
  const { data, error } = await admin
    .from('orders')
    .select('id, outlet_id, daily_number')
    .eq('id', request.orderId)
    .eq('tenant_id', request.tenantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as { outlet_id: string | null; daily_number: number | null }
  return { outletId: row.outlet_id ?? null, dailyNumber: row.daily_number ?? null }
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Order not found' }, { status: 404 })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = receiptReprintRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const body = parsed.data

  const caller = await requireBearerStoreCaller(request, body.tenantId, 'view')
  if (!caller.ok) return caller.response
  const { user, appUser } = caller
  if (!appUser || !hasAnyPermission(appUser, ORDER_READ_KEYS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rate = await checkRateLimit(`receipt-reprinted:${user.id}`, RATE_LIMIT)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  const scope = resolveBranchScope({
    role: appUser.role,
    is_owner: appUser.is_owner,
    outlet_id: appUser.outlet_id,
  })
  const accountOutlet = scope.kind === 'branch' ? scope.outletId : null

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient({ timeoutMs: 8_000 })

  try {
    let facts: OrderFacts = { outletId: accountOutlet ?? body.outletId ?? null, dailyNumber: null }
    if (body.backend === 'platform_supabase') {
      const order = await readPlatformOrder(admin, body)
      // Another branch's order reads as missing, as it would through RLS.
      if (!order || (accountOutlet && order.outletId !== accountOutlet)) return notFound()
      facts = order
    }

    const args = buildReprintActivityArgs({
      request: body,
      actorUserId: user.id,
      actorEmail: user.email,
      outletId: facts.outletId,
      dailyNumber: facts.dailyNumber,
      nowMs: Date.now(),
    })
    // store_activity_write is service-role only and not in the generated client types.
    const rpc = admin.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
    const { data, error } = await rpc.call(admin, 'store_activity_write', args)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, recorded: data === true })
  } catch (error) {
    console.error('[receipt-reprinted] write failed', {
      tenantId: body.tenantId,
      orderId: body.orderId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Could not record the reprint.' }, { status: 500 })
  }
}
