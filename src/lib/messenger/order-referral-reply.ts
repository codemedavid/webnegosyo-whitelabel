/**
 * An `m.me/<page>?ref=ORDER_<id>` open: send that order's summary.
 *
 * Moved out of the webhook route unchanged in behaviour (#99, #113): the order
 * is read with the service role, only the order's OWN page may answer, the
 * first conversation to claim a fresh order keeps it (`order-referral.ts`),
 * and the PSID write is conditional on the row we read.
 */

import 'server-only'
import { sendMessage } from '@/lib/facebook-api'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActivePageById } from '@/lib/facebook/page-tokens'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import { createLogger } from '@/lib/logger'
import { mayAnswerOrderReferral, ORDER_REFERRAL_REFUSED_MESSAGE } from './order-referral'

const log = createLogger('[Webhook]', 'DEBUG_MESSENGER')

interface OrderRow {
  id: string
  tenant_id: string
  customer_data?: unknown
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface OrderItemRow {
  menu_item_name: string
  variation?: string
  addons?: string[]
  quantity: number
  subtotal: number
  special_instructions?: string
}

export type OrderReferralOutcome = 'sent' | 'refused' | 'not_found' | 'wrong_page' | 'send_failed'

/** Returns the store the order belongs to when the summary went out (for the session). */
export async function answerOrderReferral(input: {
  orderId: string
  pageId: string
  senderId: string
}): Promise<{ outcome: OrderReferralOutcome; tenantId?: string }> {
  const { orderId, pageId, senderId } = input
  const supabase = createAdminClient()

  const { data: orderData, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (orderError || !orderData) {
    console.error(`[Webhook] Order not found: ${orderId}`, orderError)
    return { outcome: 'not_found' }
  }
  const order = orderData as OrderRow

  const { data: orderItemsData } = await supabase.from('order_items').select('*').eq('order_id', orderId)
  const orderItems = (orderItemsData || []) as OrderItemRow[]

  const { data: tenantData } = await supabase.from('tenants').select('*').eq('id', order.tenant_id).single()
  if (!tenantData) {
    console.error(`[Webhook] Tenant not found for order: ${orderId}`)
    return { outcome: 'not_found' }
  }
  const tenant = tenantData as Record<string, unknown> & { id: string; facebook_page_id?: string | null }

  const page = tenant.facebook_page_id ? await getActivePageById(tenant.facebook_page_id) : null
  if (!page?.page_access_token) {
    console.error(`[Webhook] No Facebook page connected for tenant: ${tenant.id}`)
    return { outcome: 'wrong_page' }
  }
  // Only the order's OWN page may answer it: a ref typed into another store's
  // thread must not reveal this order.
  if (page.page_id !== pageId) {
    console.error(`[Webhook] Referral for order ${orderId} arrived on a page that is not the store's`)
    return { outcome: 'wrong_page' }
  }

  // The order id alone proves nothing (it travels in the tracking link), and
  // this answer carries the guest's name, phone and address.
  if (!mayAnswerOrderReferral({ senderId, customerData: order.customer_data, createdAt: order.created_at, now: Date.now() })) {
    log.debug('Referral refused for an order owned by another conversation or too old', { orderId })
    await sendMessage(senderId, page.page_access_token, ORDER_REFERRAL_REFUSED_MESSAGE)
    return { outcome: 'refused' }
  }

  const orderWithItems = {
    ...order,
    items: orderItems.map((item) => ({
      menu_item_name: item.menu_item_name,
      variation: item.variation,
      addons: item.addons || [],
      quantity: item.quantity,
      subtotal: item.subtotal,
      special_instructions: item.special_instructions,
    })),
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.updated_at || new Date().toISOString(),
  }
  const message = formatOrderMessage(
    orderWithItems as unknown as Parameters<typeof formatOrderMessage>[0],
    tenantData as unknown as Parameters<typeof formatOrderMessage>[1],
  )

  if (!(await sendMessage(senderId, page.page_access_token, message))) {
    console.error(`[Webhook] ❌ Failed to send message for order: ${orderId}`)
    return { outcome: 'send_failed' }
  }

  // Store the PSID for later messages about this order. Conditional on the row
  // we read: customer_data is rewritten whole, so a concurrent edit (delivery
  // details, a pin link) must not be clobbered. A lost race skips the write.
  try {
    const now = new Date().toISOString()
    let psidWrite = supabase
      .from('orders')
      .update({
        customer_data: {
          ...((order.customer_data as Record<string, unknown>) || {}),
          messenger_sender_id: senderId,
          messenger_psid: senderId,
          messenger_message_sent_at: now,
          messenger_last_interaction: now,
        },
      } as unknown as never)
      .eq('id', orderId)
    if (order.updated_at) psidWrite = psidWrite.eq('updated_at', order.updated_at)
    const { error: psidError } = await psidWrite
    if (psidError) console.error(`[Webhook] Failed to store sender mapping for order ${orderId}:`, psidError.message)
  } catch (error) {
    console.error('[Webhook] Failed to store sender mapping:', error)
  }
  return { outcome: 'sent', tenantId: tenant.id }
}
