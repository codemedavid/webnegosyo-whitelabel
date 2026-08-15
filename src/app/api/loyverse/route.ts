import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushOrderToLoyverseBestEffort } from '@/lib/loyverse/push-service'
import type { OrderItem } from '@/types/database'

/**
 * POST /api/loyverse — merchant-app entry point for pushing an order into
 * Loyverse as a sales receipt.
 *
 * Runs on the server for the same reason /api/lalamove does: the tenant's
 * Loyverse access token signs every request and must never ship in an app
 * bundle. Authenticated with the caller's own Supabase access token, then
 * authorised against app_users, because the tenant and order are read with
 * the service key which bypasses RLS.
 *
 * Two shapes:
 * - { tenantId, orderId }             — platform-backend order; items are read
 *                                       (and the outcome recorded) server-side.
 * - { tenantId, items, orderNumber? } — Convex / tenant-Supabase order or POS
 *                                       counter sale; the app supplies the
 *                                       lines and there is no platform row to
 *                                       record on. The caller must invoke this
 *                                       exactly once per order (it fires on a
 *                                       status transition / tender completion).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId: unknown = body?.tenantId
  const orderId: unknown = body?.orderId
  const orderNumber: unknown = body?.orderNumber
  const items: unknown = body?.items

  if (typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }
  if (typeof orderId !== 'string' && !Array.isArray(items)) {
    return NextResponse.json({ error: 'orderId or items is required' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
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

  let orderItems: OrderItem[]
  let platformOrderId: string | null = null

  // The app sends whatever ids it has; a Convex order id has no platform row,
  // so an unknown orderId falls back to the caller-supplied items instead of
  // failing the push.
  if (typeof orderId === 'string') {
    const admin = createAdminClient()
    const { data: orderRow } = await admin
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (orderRow) {
      // Platform order: the push service reads order_items and records the
      // outcome on the row; caller-sent items are ignored in favour of the
      // server's own copy.
      platformOrderId = (orderRow as { id: string }).id
      orderItems = []
    } else if (Array.isArray(items)) {
      orderItems = items as OrderItem[]
    } else {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
  } else {
    orderItems = items as OrderItem[]
  }

  // POS counter sales are complete the moment they are tendered — they never
  // pass through "confirmed", so they always push. Online-order confirmations
  // stay gated by the tenant's push mode (an on_create tenant already pushed
  // at checkout; pushing again here would double-count the sale).
  const context: unknown = body?.context
  const trigger = context === 'pos_sale' ? 'manual' : 'confirm'

  const result = await pushOrderToLoyverseBestEffort({
    tenantId,
    orderId: platformOrderId,
    orderNumber: typeof orderNumber === 'string' ? orderNumber : undefined,
    items: orderItems,
    trigger,
  })

  return NextResponse.json({
    success: result.success,
    skipped: result.skipped,
    receiptNumber: result.receiptNumber ?? null,
    unmapped: result.unmapped,
    error: result.error ?? null,
  })
}
