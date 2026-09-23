/**
 * POST /api/push/notify-order — rings merchant devices for a new platform order.
 *
 * Called by a database trigger on `public.orders` (via pg_net) for every
 * INSERT, so every write path — web checkout, the app's POS register,
 * QR-handoff accepts — notifies without each caller having to remember to.
 * This is the platform equivalent of the Convex deployment's
 * `notifications:sendOrderNotification`.
 *
 * The caller is unauthenticated (pg_net cannot hold a secret a migration
 * would not leak), so nothing in the payload is trusted: the order is re-read
 * by id with the service role, the tenant must match, and a once-only claim
 * row per order makes replays silent no-ops.
 *
 * What Expo says back is read, not assumed. This route used to count an HTTP
 * 200 as "sent" — and an HTTP 200 is what Expo returns while refusing every
 * single device. A whole platform's Android notifications were dropped for
 * months behind that 200 (mismatched FCM project between the build and the
 * EAS credential), reported here as a clean send. See `expo-delivery.ts`.
 */
import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildExpoPushMessages,
  parseNotifyOrderPayload,
  resolveOrderOutletId,
  selectPushRecipients,
  type PushTokenRow,
} from '@/lib/push/order-push'
import {
  chaseExpoReceipts,
  describePushFailures,
  sendExpoPushMessages,
  staleTokensFrom,
  type PushFailure,
} from '@/lib/push/expo-delivery'

interface NotifiableOrderRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  customer_name: string | null
  total: number | null
  item_count: number | null
  customer_data: unknown
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Forgets the devices Expo says no longer have the app, in BOTH token tables:
 * one physical device that has uninstalled is equally dead for order pushes
 * and for platform announcements, and a token left behind inflates every
 * "reached N devices" count from then on.
 */
async function pruneStaleTokens(admin: AdminClient, failures: readonly PushFailure[]) {
  const stale = staleTokensFrom(failures)
  if (stale.length === 0) return

  const [orderTokens, deviceTokens] = await Promise.all([
    admin.from('push_tokens').delete().in('token', stale),
    admin.from('platform_device_tokens').delete().in('token', stale),
  ])
  if (orderTokens.error) {
    console.error('[notify-order] stale push_tokens cleanup failed:', orderTokens.error.message)
  }
  if (deviceTokens.error) {
    console.error(
      '[notify-order] stale platform_device_tokens cleanup failed:',
      deviceTokens.error.message
    )
  }
}

/**
 * Runs follow-up work once the response is on its way. `after` throws when
 * there is no request scope — a unit test, or any caller outside Next's
 * server runtime — and the work then runs inline rather than being dropped:
 * what it finds is the only signal that a whole platform has gone silent.
 */
function afterResponse(task: () => Promise<void>): Promise<void> | void {
  try {
    after(task)
  } catch {
    return task()
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = parseNotifyOrderPayload(body)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Claim first: exactly one send per order, however many times the trigger
  // (or anyone else) replays the request.
  const { data: claim, error: claimError } = await admin
    .from('order_push_notifications')
    .upsert(
      { order_id: payload.order_id, tenant_id: payload.tenant_id },
      { onConflict: 'order_id', ignoreDuplicates: true }
    )
    .select('order_id')

  if (claimError) {
    console.error('[notify-order] claim failed:', claimError.message)
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 })
  }
  if (!claim || claim.length === 0) {
    return NextResponse.json({ sent: 0, duplicate: true })
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, tenant_id, outlet_id, customer_name, total, item_count, customer_data')
    .eq('id', payload.order_id)
    .maybeSingle<NotifiableOrderRow>()

  if (orderError) {
    console.error('[notify-order] order read failed:', orderError.message)
    return NextResponse.json({ error: 'Order read failed' }, { status: 500 })
  }
  if (!order || order.tenant_id !== payload.tenant_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const { data: tokens, error: tokensError } = await admin
    .from('push_tokens')
    .select('token, outlet_id')
    .eq('tenant_id', order.tenant_id)

  if (tokensError) {
    console.error('[notify-order] token read failed:', tokensError.message)
    return NextResponse.json({ error: 'Token read failed' }, { status: 500 })
  }

  const recipients = selectPushRecipients(
    (tokens ?? []) as PushTokenRow[],
    resolveOrderOutletId(order)
  )
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const messages = buildExpoPushMessages(recipients, {
    id: order.id,
    customerName: order.customer_name?.trim() || 'Customer',
    total: order.total ?? 0,
    itemCount: order.item_count ?? 1,
  })

  const { accepted, failures, failedChunks } = await sendExpoPushMessages(messages)

  const ticketRefusals = describePushFailures(failures)
  if (ticketRefusals) {
    console.error(`[notify-order] tenant ${order.tenant_id} ticket refusals: ${ticketRefusals}`)
  }
  if (failedChunks > 0) {
    console.error(`[notify-order] ${failedChunks} chunk(s) never reached Expo`)
  }

  // The receipts settle seconds later and are the ONLY place a provider-side
  // refusal (MismatchSenderId, and every other Android-wide failure) appears.
  // Chased after the response so the trigger is not kept waiting for them.
  await afterResponse(async () => {
    const receipts = await chaseExpoReceipts(accepted)
    const all = [...failures, ...receipts.failures]
    const refusals = describePushFailures(receipts.failures)
    if (refusals) {
      console.error(`[notify-order] tenant ${order.tenant_id} receipt refusals: ${refusals}`)
    }
    await pruneStaleTokens(admin, all)
  })

  // "Accepted", not "delivered": a receipt may still refuse these. Devices
  // Expo refused outright are excluded, so a total failure reads as 0.
  return NextResponse.json({ sent: accepted.length, refused: failures.length })
}
