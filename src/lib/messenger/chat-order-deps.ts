/**
 * The real side effects behind `runChatOrder` and the chat-order taps
 * (service role: the callers are a database trigger and Meta's webhook).
 * Every read and write is scoped to one store.
 */

import 'server-only'
import { writeChatLog } from './chat-log-store'
import { messengerDb } from './service-db'
import { getTenantActivePageById } from '@/lib/facebook/page-tokens'
import { ORDER_BACKEND_TENANT_COLUMNS, resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import type { ChatOrderDeps, ChatOrderOutcome, ChatOrderTap, ChatOrderTapResult } from './chat-order'
import { loadPayChoices, readChatOrder, readOrderRow, toChatOrderView, toPayChoice, type OrderRow, type PayChoiceWithQr } from './chat-order-reads'
import { isPsid } from './ids'
import { readMessages } from './messages/stored'
import { isPaidStatus } from './money'
import { maskPsid, sendMessages } from './send'

function stateFor(outcome: ChatOrderOutcome, isWaiting: boolean): 'waiting' | 'sent' | 'not_sent' {
  if (outcome !== 'sent') return 'not_sent'
  return isWaiting ? 'waiting' : 'sent'
}

export function createChatOrderDeps(): ChatOrderDeps {
  const admin = messengerDb()
  return {
    now: () => new Date(),
    readOrder: (orderId) => readChatOrder(orderId),
    waitForDishes: (orderId) => readChatOrder(orderId, { waitForDishes: true }),
    claim: async ({ orderId, tenantId, sessionId }) => {
      const { data, error } = await admin
        .from('messenger_chat_orders')
        .upsert({ order_id: orderId, tenant_id: tenantId, session_id: sessionId }, { onConflict: 'order_id', ignoreDuplicates: true })
        .select('order_id')
      if (error) throw new Error(`claim failed: ${error.code}`)
      return (data ?? []).length === 1
    },
    record: async ({ orderId, outcome, isWaiting, now }) => {
      const nowIso = now.toISOString()
      const { error } = await admin
        .from('messenger_chat_orders')
        .update({
          outcome, state: stateFor(outcome, isWaiting), updated_at: nowIso, ...(outcome === 'sent' ? { summary_sent_at: nowIso } : {}),
        })
        .eq('order_id', orderId)
        // A customer who already tapped Confirm is not moved back to "waiting".
        .eq('state', 'claimed')
      if (error) console.error('[Messenger chat order] outcome not recorded', { code: error.code })
    },
    loadStore: async (tenantId) => {
      const [tenantRead, settingsRead] = await Promise.all([
        admin.from('tenants').select(`name, facebook_page_id, ${ORDER_BACKEND_TENANT_COLUMNS}`).eq('id', tenantId).maybeSingle(),
        admin.from('messenger_settings').select('messages').eq('tenant_id', tenantId).maybeSingle(),
      ])
      if (tenantRead.error || !tenantRead.data) return null
      const tenant = tenantRead.data as unknown as { name: string; facebook_page_id: string | null }
      // Unreadable wording: the built-in words are still right.
      const messages = settingsRead.error ? null : (settingsRead.data as { messages: unknown } | null)?.messages ?? null
      return {
        name: tenant.name.trim(),
        isPlatformOrders: resolveOrderBackend(tenantRead.data as unknown as OrderBackendTenantFields) === 'platform',
        messages: readMessages(messages),
        facebookPageRowId: tenant.facebook_page_id,
      }
    },
    readSession: async (tenantId, sessionId) => {
      const { data, error } = await admin
        .from('messenger_sessions')
        .select('id, psid, first_name, last_inbound_at')
        .eq('id', sessionId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error || !data) return null
      const row = data as { id: string; psid: string; first_name: string | null; last_inbound_at: string | null }
      if (!isPsid(row.psid)) return null
      return { id: row.id, psid: row.psid, firstName: row.first_name, lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null }
    },
    countRecent: async ({ sessionId, orderId, since }) => {
      const { count, error } = await admin
        .from('messenger_chat_orders')
        .select('order_id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .neq('order_id', orderId)
        .gte('created_at', since.toISOString())
      // Unreadable: send nothing rather than risk flooding a customer.
      if (error) throw new Error(`recent summaries not readable: ${error.code}`)
      return count ?? 0
    },
    attachCustomer: async ({ orderId }) => {
      const { data, error } = await admin.rpc('messenger_attach_chat_order_customer', { p_order_id: orderId })
      if (error) {
        console.error('[Messenger chat order] customer not attached', { code: error.code })
        return false
      }
      return data === true
    },
    findPageToken: async (tenantId, pageRowId) => (await getTenantActivePageById(tenantId, pageRowId))?.page_access_token ?? null,
    logChat: writeChatLog,
    send: async (token, psid, messages) => {
      const result = await sendMessages(token, psid, messages, fetch, 'UPDATE')
      if (!result.ok) console.error('[Messenger chat order] summary not sent', { psid: maskPsid(psid), code: result.error.code })
      return result
    },
  }
}

// ── The customer's taps ──────────────────────────────────────────────────────

/** Statuses a customer may still choose how to pay in (not finished, not cancelled). */
const PAYABLE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready']

/** Put the customer's chosen method on an order that still owes. False = it was paid, finished or cancelled meanwhile. */
async function setPaymentMethod(order: OrderRow, method: PayChoiceWithQr, now: Date): Promise<boolean> {
  const admin = messengerDb()
  const { data, error } = await admin
    .from('orders')
    .update({
      payment_method_id: method.id, payment_method_name: method.name, payment_method_details: method.details || null,
      payment_method_qr_code_url: method.qrCodeUrl,
    })
    .eq('id', order.id)
    .eq('tenant_id', order.tenant_id)
    .in('payment_status', ['pending', 'failed'])
    .in('status', PAYABLE_STATUSES)
    .select('id')
  if (error || (data ?? []).length !== 1) return false
  await admin
    .from('messenger_chat_orders')
    .update({ payment_method_id: method.id, updated_at: now.toISOString() })
    .eq('order_id', order.id)
  return true
}

/**
 * Confirm: one conditional `pending → confirmed`. A store that sends its own
 * "confirmed" status message would say it twice, so that message's claim is
 * taken first and given back when the confirm itself failed.
 */
async function confirmOrder(row: OrderRow, tenantId: string, nowIso: string): Promise<'confirmed' | 'already' | 'gone'> {
  const admin = messengerDb()
  const { data: claimed } = await admin
    .from('messenger_order_updates')
    .upsert({ order_id: row.id, status: 'confirmed', tenant_id: tenantId, outcome: 'sent' }, { onConflict: 'order_id,status', ignoreDuplicates: true })
    .select('order_id')
  const tookClaim = (claimed ?? []).length === 1
  const { data: moved, error } = await admin
    .from('orders')
    .update({ status: 'confirmed' })
    .eq('id', row.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    if (tookClaim) await admin.from('messenger_order_updates').delete().eq('order_id', row.id).eq('status', 'confirmed')
    throw new Error(`order not confirmed: ${error.code}`)
  }
  if ((moved ?? []).length === 1) {
    await admin
      .from('messenger_chat_orders')
      .update({ state: 'confirmed', customer_confirmed_at: nowIso, updated_at: nowIso })
      .eq('order_id', row.id)
    return 'confirmed'
  }
  // Staff moved it in the same moment: confirmed is fine, cancelled is not.
  const current = await readOrderRow(row.id, tenantId)
  return !current || current.status === 'cancelled' ? 'gone' : 'already'
}

/**
 * Apply one tap. The order must be at this store, rung up for a chat, and
 * carry THIS customer; anything else is "gone" and nothing is written.
 */
export async function applyChatOrderTap(input: { tenantId: string; psid: string; tap: ChatOrderTap; now: Date }): Promise<ChatOrderTapResult> {
  const admin = messengerDb()
  const { tenantId, psid, tap, now } = input
  const row = await readOrderRow(tap.orderId, tenantId)
  if (!row || row.customer_data?.messenger_psid !== psid) return { kind: 'gone' }
  const { data: chatRow, error: chatError } = await admin
    .from('messenger_chat_orders')
    .select('order_id, payment_method_id, state')
    .eq('order_id', row.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (chatError) throw new Error(`chat order not readable: ${chatError.code}`)
  if (!chatRow) return { kind: 'gone' }
  if (row.status === 'cancelled') return { kind: 'gone' }

  const isPaid = isPaidStatus(row.payment_status)
  let hasPaymentMethod = chatRow.payment_method_id !== null
  const nowIso = now.toISOString()
  const view = (status: string = row.status) => toChatOrderView({ ...row, status }, [], hasPaymentMethod)

  if (tap.verb === 'order_change') {
    if (row.status === 'delivered') return { kind: 'gone' }
    const { error } = await admin
      .from('messenger_chat_orders')
      .update({ state: 'change_requested', change_requested_at: nowIso, updated_at: nowIso })
      .eq('order_id', row.id)
    if (error) throw new Error(`change not recorded: ${error.code}`)
    return { kind: 'change', order: view() }
  }

  const methods = isPaid ? [] : await loadPayChoices(tenantId, row.order_type_id)

  if (tap.verb === 'order_pay') {
    if (isPaid) return { kind: 'already', order: view(), methods: [], chosen: null }
    if (!PAYABLE_STATUSES.includes(row.status)) return { kind: 'gone' }
    const method = methods.find((candidate) => candidate.id === tap.methodId)
    if (!method) return { kind: 'pick_again', order: view(), methods: methods.map(toPayChoice) }
    if (!(await setPaymentMethod(row, method, now))) return { kind: 'already', order: { ...view(), isPaid: true }, methods: [], chosen: null }
    hasPaymentMethod = true
    return { kind: 'paid_with', order: view(), method: toPayChoice(method) }
  }

  // Confirm. A Confirm under an older summary must never send the OLD order to
  // the kitchen: when staff edited the order since (its revision moved on), the
  // customer gets the new summary to confirm instead; while they are still
  // changing it ("Change something", nothing edited yet), it is answered like
  // the change.
  if (row.status === 'pending') {
    if (tap.verb === 'order_ok' && tap.revision !== undefined && tap.revision !== (row.revision_number ?? 0)) {
      const fresh = await readChatOrder(row.id)
      if (!fresh || fresh.tenantId !== tenantId || fresh.lines.length === 0) return { kind: 'gone' }
      await markSummarySent(tenantId, row.id, now)
      return { kind: 'updated', order: { ...fresh, hasPaymentMethod } }
    }
    if (chatRow.state === 'change_requested') return { kind: 'change', order: view() }
  }

  let kind: 'confirmed' | 'already' = 'already'
  if (row.status === 'pending') {
    const confirmed = await confirmOrder(row, tenantId, nowIso)
    if (confirmed === 'gone') return { kind: 'gone' }
    kind = confirmed
  }

  const confirmedView = view(row.status === 'pending' ? 'confirmed' : row.status)
  // One way to pay: no question to ask, it goes straight onto the order.
  const only = !hasPaymentMethod && methods.length === 1 ? methods[0] : null
  if (only && (await setPaymentMethod(row, only, now))) {
    return { kind, order: { ...confirmedView, hasPaymentMethod: true }, methods: methods.map(toPayChoice), chosen: toPayChoice(only) }
  }
  return { kind, order: confirmedView, methods: methods.map(toPayChoice), chosen: null }
}

/** A new summary went out (staff resent it, or a stale Confirm got the new one): its Confirm button works again. */
async function markSummarySent(tenantId: string, orderId: string, now: Date): Promise<void> {
  const admin = messengerDb()
  const nowIso = now.toISOString()
  const [sent, reopened] = await Promise.all([
    admin.from('messenger_chat_orders').update({ summary_sent_at: nowIso, updated_at: nowIso }).eq('order_id', orderId).eq('tenant_id', tenantId),
    // Only a chat order still waiting on a change moves back to waiting.
    admin.from('messenger_chat_orders').update({ state: 'waiting', updated_at: nowIso })
      .eq('order_id', orderId).eq('tenant_id', tenantId).eq('state', 'change_requested'),
  ])
  const error = sent.error ?? reopened.error
  if (error) console.error('[Messenger chat order] summary not recorded', { code: error.code })
}

/** Staff resent the summary from the app (after changing the order). Never throws. */
export async function reopenChatOrder(tenantId: string, orderId: string, now: Date): Promise<void> {
  await markSummarySent(tenantId, orderId, now).catch(() => undefined)
}
