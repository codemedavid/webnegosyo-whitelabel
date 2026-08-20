import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createLalamoveOrder,
  getLalamoveOrder,
  cancelLalamoveOrder,
  addLalamovePriorityFee,
} from '@/lib/lalamove-service'
import { normalizeLalamovePhone } from '@/lib/lalamove-phone'
import type { Tenant } from '@/types/database'

/**
 * POST /api/lalamove
 *
 * Books, syncs, cancels and tips Lalamove deliveries for the merchant app.
 *
 * These four operations only ever existed as Convex actions. Tenants on the
 * shared platform Supabase have no Convex deployment, so on the app their
 * delivery card could not reach anything — no booking, no status, no tracking
 * link. This route is the platform-side equivalent.
 *
 * It has to run on a server rather than on the phone: the tenant's
 * `lalamove_api_key` and `lalamove_secret_key` sign every Lalamove request, and
 * shipping them into an app bundle would hand a merchant's delivery account to
 * anyone willing to unpack it.
 *
 * Authenticated with the caller's own Supabase access token — the same trust
 * level as /api/vouchers/redeem, which the register already calls — and then
 * authorised against `app_users`, because the order and tenant are read with
 * the service key and that read bypasses RLS entirely.
 */

type LalamoveOp = 'book' | 'sync' | 'cancel' | 'priority_fee'

const OPS: readonly LalamoveOp[] = ['book', 'sync', 'cancel', 'priority_fee']

/** Statuses Lalamove reports for a delivery that is over, one way or another. */
const FINAL_STATUSES = new Set(['DELIVERED', 'CANCELED', 'CANCELLED', 'COMPLETED', 'EXPIRED'])

interface OrderRow {
  id: string
  customer_name: string | null
  customer_contact: string | null
  /** Platform orders keep the delivery address inside this JSON blob — there
   * is no top-level delivery_address column on the orders table. */
  customer_data: { delivery_address?: string | null } | null
  lalamove_quotation_id: string | null
  lalamove_order_id: string | null
  lalamove_status: string | null
}

function fail(error: string, status = 200): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

/**
 * The store's pickup contact.
 *
 * The driver calls the SENDER to coordinate pickup, so it must be the store's
 * number and never the customer's — the same resolution the web server action
 * uses, kept identical here so a booking made from the app behaves exactly like
 * one made from the dashboard.
 */
function resolveSender(tenant: Tenant): { name: string; phone: string | undefined } {
  const phone =
    tenant.lalamove_sender_phone || tenant.footer_phone || tenant.footer_whatsapp || undefined
  return {
    name: tenant.name || tenant.footer_business_name || 'Restaurant',
    phone: normalizeLalamovePhone(phone, tenant.lalamove_market),
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const op: unknown = body?.op
  const tenantId: unknown = body?.tenantId
  const orderId: unknown = body?.orderId

  if (typeof tenantId !== 'string' || typeof orderId !== 'string') {
    return NextResponse.json({ error: 'tenantId and orderId are required' }, { status: 400 })
  }

  if (!OPS.includes(op as LalamoveOp)) {
    return NextResponse.json({ error: `op must be one of ${OPS.join(', ')}` }, { status: 400 })
  }

  // A tip is money. An unparseable or negative amount must be refused rather
  // than coerced — Lalamove takes the string as given.
  let amount: string | undefined
  if (op === 'priority_fee') {
    const parsed = Number(body?.amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    amount = String(body.amount)
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

  const admin = createAdminClient()

  const { data: tenantData } = await admin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()

  const tenant = tenantData as unknown as Tenant | null
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }
  if (!tenant.lalamove_enabled) {
    return fail('Lalamove delivery is not enabled for this store')
  }

  // Filtered by tenant as well as id. The service key bypasses RLS, so this
  // filter is the only thing keeping a merchant off another store's order.
  const { data: orderData } = await admin
    .from('orders')
    .select(
      'id, customer_name, customer_contact, customer_data, lalamove_quotation_id, lalamove_order_id, lalamove_status',
    )
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const order = orderData as unknown as OrderRow | null
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const bookedId =
    typeof order.lalamove_order_id === 'string' && order.lalamove_order_id.trim() !== ''
      ? order.lalamove_order_id
      : null

  try {
    if (op === 'book') {
      if (bookedId) {
        return fail(`A delivery is already booked for this order (${bookedId})`)
      }
      if (!order.lalamove_quotation_id) {
        return fail('This order has no Lalamove quotation to book against')
      }
      const deliveryAddress = order.customer_data?.delivery_address
      if (typeof deliveryAddress !== 'string' || deliveryAddress.trim() === '') {
        return fail('This order has no delivery address')
      }

      const sender = resolveSender(tenant)
      if (!sender.phone) {
        return fail('Your store pickup phone is not set. Add it in delivery settings.')
      }

      const placed = await createLalamoveOrder(
        tenant,
        order.lalamove_quotation_id,
        sender.name,
        sender.phone,
        order.customer_name || 'Customer',
        normalizeLalamovePhone(order.customer_contact, tenant.lalamove_market) ||
          order.customer_contact ||
          '',
        { orderId, tenantId },
      )

      // Guarded on the column still being null so two merchants tapping Book at
      // the same moment cannot overwrite each other's booking reference — the
      // one that loses would otherwise leave a paid-for rider untracked.
      await admin
        .from('orders')
        .update({
          lalamove_order_id: placed.orderId,
          lalamove_status: placed.status ?? 'ASSIGNING_DRIVER',
          lalamove_tracking_url: placed.shareLink ?? '',
        })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .is('lalamove_order_id', null)

      return NextResponse.json({ success: true, lalamoveOrderId: placed.orderId })
    }

    if (!bookedId) {
      return fail('No delivery has been booked for this order yet')
    }

    if (op === 'sync') {
      const live = (await getLalamoveOrder(tenant, bookedId)) as {
        status?: string
        shareLink?: string
        driver?: { name?: string; phone?: string }
      }

      // Only fields Lalamove actually returned are written. Blanking a driver
      // name because one poll came back thin would wipe the number a merchant
      // needs to call about a delivery already on the road.
      const patch: Record<string, string> = {}
      if (live?.status) patch.lalamove_status = live.status
      if (live?.shareLink) patch.lalamove_tracking_url = live.shareLink
      if (live?.driver?.name) patch.lalamove_driver_name = live.driver.name
      if (live?.driver?.phone) patch.lalamove_driver_phone = live.driver.phone

      if (Object.keys(patch).length > 0) {
        await admin.from('orders').update(patch).eq('id', orderId).eq('tenant_id', tenantId)
      }

      return NextResponse.json({ success: true, status: live?.status })
    }

    if (op === 'cancel') {
      if (order.lalamove_status && FINAL_STATUSES.has(order.lalamove_status.toUpperCase())) {
        return fail('This delivery has already finished and cannot be cancelled')
      }

      await cancelLalamoveOrder(tenant, bookedId)

      await admin
        .from('orders')
        .update({ lalamove_status: 'CANCELLED' })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)

      return NextResponse.json({ success: true })
    }

    // priority_fee — `amount` was validated above, so it is set here.
    await addLalamovePriorityFee(tenant, bookedId, amount!)
    return NextResponse.json({ success: true })
  } catch (error) {
    // The Lalamove reason is the whole value of the message: "Quotation
    // expired" tells a merchant to re-quote, where a generic failure leaves
    // them tapping a button that will never work.
    console.error(`Lalamove ${op} failed for order ${orderId}:`, error)
    return fail(
      error instanceof Error ? error.message : 'The delivery service could not be reached',
    )
  }
}
