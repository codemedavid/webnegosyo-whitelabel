/**
 * The facts and side effects behind `/api/messenger/chat` (staff replying
 * from the merchant app). Service role, always scoped to one store and one
 * chat; the route has already checked, AS the caller, that they may read it.
 */

import 'server-only'
import { getTenantActivePageById } from '@/lib/facebook/page-tokens'
import { changeChatCart } from './chat-cart-store'
import { toCentavos } from './chat-cart'
import { writeChatLog } from './chat-log-store'
import { reopenChatOrder } from './chat-order-deps'
import { buildChatOrderSummary, buildPayRequest, type ChatOrderContext, type ChatOrderView } from './chat-order'
import { loadPayChoices, readChatOrder, toPayChoice } from './chat-order-reads'
import { createOnceClaims, type OnceClaims } from './dedupe'
import { isPsid } from './ids'
import type { OutgoingMessage } from './graph-message'
import { createMessengerLinkToken } from './link-token'
import { loadStoreBundle, type StoreBundle } from './load-store'
import { greetingName } from './messages/fill'
import { isOrderStatus, orderLabel, readOrderKind, type ReplyOrder, type UpdateStatus } from './order-view'
import { readOrderTypeKinds, trackingUrl } from './recent-orders'
import { buildOrderUpdate, buildReply, type ChatCartView, type ReplyContext } from './replies'
import { isPaidStatus } from './money'
import { sendMessages, type SendResult } from './send'
import { messengerDb } from './service-db'
import { setBotPause } from './session'
import type { StaffCard, StaffOrderFacts } from './staff-chat'

/** Same look-back as "Where is my order": a chat's order from last week still counts. */
const ORDER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

export interface StaffChatSession {
  id: string
  psid: string
  firstName: string | null
  lastInboundAt: Date | null
  botPausedUntil: Date | null
}

export interface StaffChatOrder extends StaffOrderFacts {
  orderTypeId: string | null
  orderType: string | null
  totalCentavos: number
}

export interface StaffChatFacts {
  bundle: StoreBundle
  session: StaffChatSession
  cart: ChatCartView | null
  order: StaffChatOrder | null
}

const date = (value: string | null): Date | null => (value ? new Date(value) : null)

async function readSession(tenantId: string, sessionId: string): Promise<StaffChatSession | null> {
  const { data, error } = await messengerDb()
    .from('messenger_sessions')
    .select('id, psid, first_name, last_inbound_at, bot_paused_until')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { id: string; psid: string; first_name: string | null; last_inbound_at: string | null; bot_paused_until: string | null }
  if (!isPsid(row.psid)) return null
  return {
    id: row.id, psid: row.psid, firstName: row.first_name,
    lastInboundAt: date(row.last_inbound_at), botPausedUntil: date(row.bot_paused_until),
  }
}

interface OrderRow {
  id: string
  daily_number: number | null
  status: string
  total: number | string | null
  order_type: string | null
  order_type_id: string | null
  payment_status: string | null
}

/** This customer's newest order at this store in the last week (the partial `orders_messenger_psid_idx`). */
async function readLatestOrder(tenantId: string, psid: string, now: Date): Promise<StaffChatOrder | null> {
  const admin = messengerDb()
  const { data, error } = await admin
    .from('orders')
    .select('id, daily_number, status, total, order_type, order_type_id, payment_status')
    .eq('tenant_id', tenantId)
    .eq('customer_data->>messenger_psid', psid)
    .gte('created_at', new Date(now.getTime() - ORDER_LOOKBACK_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`latest order not readable: ${error.code}`)
  const row = ((data ?? []) as OrderRow[])[0]
  if (!row || !isOrderStatus(row.status)) return null
  const isPaid = isPaidStatus(row.payment_status)
  const [claim, methods] = await Promise.all([
    admin.from('messenger_chat_orders').select('order_id').eq('order_id', row.id).eq('tenant_id', tenantId).maybeSingle(),
    isPaid || row.status === 'cancelled' ? Promise.resolve([]) : loadPayChoices(tenantId, row.order_type_id),
  ])
  return {
    id: row.id,
    label: orderLabel(row.daily_number, row.id),
    status: row.status,
    isPaid,
    isChatOrder: !claim.error && Boolean(claim.data),
    payMethodCount: methods.length,
    orderTypeId: row.order_type_id,
    orderType: row.order_type,
    totalCentavos: toCentavos(Number(row.total) || 0),
  }
}

/** Everything the quick actions need about this chat. Null = no such chat at this store, or no store to speak for. */
export async function loadStaffChatFacts(tenantId: string, sessionId: string, now: Date): Promise<StaffChatFacts | null> {
  const [bundle, session] = await Promise.all([loadStoreBundle(tenantId, now), readSession(tenantId, sessionId)])
  if (!bundle || !session) return null
  const [cart, order] = await Promise.all([
    // An unreadable cart is "no cart": the chip just doesn't show.
    bundle.store ? changeChatCart({ sessionId, op: null, store: bundle.store }).catch(() => null) : Promise.resolve(null),
    bundle.isPlatformOrders ? readLatestOrder(tenantId, session.psid, now) : Promise.resolve(null),
  ])
  return { bundle, session, cart, order }
}

export async function findPageToken(bundle: StoreBundle): Promise<string | null> {
  if (!bundle.facebookPageRowId) return null
  return (await getTenantActivePageById(bundle.tenantId, bundle.facebookPageRowId))?.page_access_token ?? null
}

/** A summary for a chat order, with its dishes, read like the summary route reads it (no waiting: staff are). */
async function readChatOrderView(orderId: string, tenantId: string): Promise<ChatOrderView | null> {
  const row = await readChatOrder(orderId)
  return row && row.tenantId === tenantId && row.sessionId ? row : null
}

/**
 * The messages one card sends, in the store's own words. Empty = nothing to
 * send (no store menu, the order moved on); the route refuses then.
 */
export async function buildStaffCard(facts: StaffChatFacts, card: StaffCard): Promise<OutgoingMessage[]> {
  const { bundle, session, order } = facts
  const store = bundle.store
  if (!store) return []
  const customerName = greetingName(session.firstName)
  const ctx: ReplyContext = {
    store, linkToken: createMessengerLinkToken(session.id), messages: bundle.settings.messages, customerName,
    ...(facts.cart ? { cart: facts.cart } : {}),
  }
  const orderCtx: ChatOrderContext = { storeName: store.name, messages: bundle.settings.messages, customerName }
  switch (card) {
    case 'menu':
      return buildReply({ kind: 'menu_card' }, ctx)
    case 'categories':
      return buildReply({ kind: 'categories' }, ctx)
    case 'hours':
      return buildReply({ kind: 'hours_location' }, ctx)
    case 'cart':
      return facts.cart && facts.cart.priced.itemCount > 0 ? buildReply({ kind: 'cart' }, ctx) : []
    case 'order_status': {
      if (!order || order.status === 'pending') return []
      const kinds = order.orderTypeId ? await readOrderTypeKinds([order.orderTypeId]) : new Map<string, string>()
      const replyOrder: ReplyOrder = {
        id: order.id, label: order.label, status: order.status,
        kind: readOrderKind(order.orderTypeId ? kinds.get(order.orderTypeId) : null, order.orderType),
        totalCentavos: order.totalCentavos, trackingUrl: trackingUrl(store.baseUrl, order.id),
      }
      return buildOrderUpdate(orderCtx, order.status as UpdateStatus, replyOrder)
    }
    case 'summary': {
      if (!order || order.status !== 'pending' || !order.isChatOrder) return []
      const view = await readChatOrderView(order.id, bundle.tenantId)
      return view && view.lines.length > 0 ? buildChatOrderSummary(orderCtx, view) : []
    }
    case 'pay': {
      if (!order || !order.isChatOrder || order.isPaid || order.status === 'cancelled') return []
      const methods = await loadPayChoices(bundle.tenantId, order.orderTypeId)
      const view: ChatOrderView = {
        id: order.id, label: order.label, status: order.status, orderType: order.orderType, lines: [],
        totalCentavos: order.totalCentavos, isPaid: order.isPaid, hasPaymentMethod: false,
      }
      return buildPayRequest(orderCtx, view, methods.map(toPayChoice))
    }
  }
}

/** One Send tap, once: a retry with the same id after a timeout is answered "already sent" (a day). */
let sendClaims: OnceClaims | null = null
const claims = (): OnceClaims => (sendClaims ??= createOnceClaims('staff-app', 24 * 60 * 60))

export function claimClientSend(sessionId: string, clientId: string): Promise<boolean> {
  return claims().claim(`${sessionId}:${clientId}`)
}

export function releaseClientSend(sessionId: string, clientId: string): Promise<void> {
  return claims().release(`${sessionId}:${clientId}`)
}

export function sendAsStore(token: string, psid: string, messages: readonly OutgoingMessage[]): Promise<SendResult> {
  return sendMessages(token, psid, messages, fetch, 'RESPONSE')
}

export { reopenChatOrder, setBotPause, writeChatLog }
