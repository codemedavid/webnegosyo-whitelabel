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
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildExpoPushMessages,
  chunkExpoPushMessages,
  parseNotifyOrderPayload,
  resolveOrderOutletId,
  selectPushRecipients,
  type PushTokenRow,
} from '@/lib/push/order-push'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface NotifiableOrderRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  customer_name: string | null
  total: number | null
  item_count: number | null
  customer_data: unknown
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

  let sent = 0
  for (const chunk of chunkExpoPushMessages(messages)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      if (response.ok) {
        sent += chunk.length
      } else {
        console.error('[notify-order] Expo push rejected:', response.status)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[notify-order] Expo push failed:', message)
    }
  }

  return NextResponse.json({ sent })
}
