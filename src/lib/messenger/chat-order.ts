/**
 * An order staff ring up for a Messenger customer (plan 2026-11-14, C2).
 *
 * The customer typed their order instead of using the cart; staff opened the
 * register from the chat and sent it. The order is saved WAITING (`pending`,
 * nothing reaches the kitchen) and this module does the rest:
 *
 *   1. `runChatOrder` — the `orders_messenger_chat_order` trigger posts the new
 *      order's id; the summary goes to the customer with Confirm / Change.
 *   2. `runChatOrderTap` — the customer's taps: Confirm moves the order to
 *      `confirmed` (one conditional update, so a second tap or a staff confirm
 *      in between is harmless), then asks how they will pay; Change tells
 *      staff and steps the bot back.
 *
 * Staff can always push the order through themselves with the app's normal
 * advance button; a later Confirm tap then answers "already confirmed".
 *
 * Nothing in a request or a payload is trusted: the order is re-read, the chat
 * must belong to the order's store, and a tap only ever touches an order whose
 * stored customer is the one tapping. Pure: every side effect is injected.
 */

import type { OutgoingMessage, QuickReply } from './graph-message'
import { botLine, type ChatLogLine } from './chat-log'
import { clip, MESSENGER_LIMITS } from './limits'
import { greetingName, type FillValues } from './messages/fill'
import type { MessageSettings, TextMessageId } from './messages/registry'
import { storeWords } from './messages/say'
import { formatCentavos } from './money'
import { MESSAGING_WINDOW_MS } from './order-view'
import { encodePayload, type MessengerPayload } from './payload'
import type { SendResult } from './send'

/** A summary lists this many dishes; the rest is "+N more" (the total still covers them). */
const MAX_SUMMARY_LINES = 25

export interface ChatOrderLine {
  name: string
  qty: number
  lineCentavos: number
  /** Size, add-ons, the note typed on the line. */
  detail?: string
}

/** The choices on one stored `order_items` row, whoever wrote it. */
export interface StoredLineChoices {
  variation?: string | null
  /** Web checkout: labels ("Fried Rice ×2") or `{ name, quantity }`. */
  addons?: unknown
  /** The register keeps sizes AND add-ons here (`{ typeName, optionName }`); it writes no text columns. */
  variation_selections?: unknown
  special_instructions?: string | null
}

function addonNames(addons: unknown): string[] {
  if (!Array.isArray(addons)) return []
  return addons.map((addon) => {
    if (typeof addon === 'string') return addon
    const named = addon as { name?: unknown; quantity?: unknown } | null
    if (!named || typeof named.name !== 'string') return ''
    const quantity = Number(named.quantity)
    return quantity > 1 ? `${named.name} ×${quantity}` : named.name
  })
}

function selectionNames(selections: unknown): string[] {
  if (!Array.isArray(selections)) return []
  return selections.map((selection) => {
    const option = (selection as { optionName?: unknown } | null)?.optionName
    return typeof option === 'string' ? option : ''
  })
}

/**
 * "16 oz · Extra shot · less ice": what the customer chose on a line, so the
 * summary they confirm says it. Every input is stored JSON; nothing is trusted.
 */
export function chatOrderLineDetail(row: StoredLineChoices): string {
  const parts = [
    typeof row.variation === 'string' ? row.variation : '',
    ...selectionNames(row.variation_selections),
    ...addonNames(row.addons),
    typeof row.special_instructions === 'string' ? row.special_instructions : '',
  ]
  return parts.map((part) => part.trim()).filter(Boolean).join(' · ')
}

export interface ChatOrderView {
  id: string
  /** "#07" */
  label: string
  status: string
  /** The order type as the store named it ("Pickup"). */
  orderType: string | null
  lines: ChatOrderLine[]
  /** Discount (negative), service charge, delivery fee: what stands between the dishes and the total. */
  adjustments?: Array<{ label: string; centavos: number }>
  totalCentavos: number
  isPaid: boolean
  hasPaymentMethod: boolean
  /** `orders.revision_number`: carried on the Confirm button, so an edit made after the summary is noticed. */
  revision?: number
}

export interface PayChoice {
  id: string
  name: string
  details: string
}

/** What a chat-order message needs to know; no menu, like a status message. */
export interface ChatOrderContext {
  storeName: string
  messages?: MessageSettings
  /** Already cleaned (`greetingName`). */
  customerName?: string
}

function words(ctx: ChatOrderContext, id: TextMessageId, extra: FillValues = {}): string {
  return storeWords(ctx.messages, id, { store: ctx.storeName, name: ctx.customerName ?? '', ...extra })
}

function orderValues(order: Pick<ChatOrderView, 'label' | 'totalCentavos'>): FillValues {
  return { order: order.label, total: formatCentavos(order.totalCentavos) }
}

function dishLines(line: ChatOrderLine): string[] {
  const head = `${line.qty} × ${clip(line.name, 80)} · ${formatCentavos(line.lineCentavos)}`
  return line.detail ? [head, `   ${clip(line.detail, 120)}`] : [head]
}

/**
 * The summary text. The dishes give way to the total: the intro, the
 * adjustments, the order type and the total line are always there, and the
 * dishes fill what is left of Meta's limit, the rest as "+N more" (a long
 * order once lost its total to the cut, and the customer could confirm
 * without seeing what they owe).
 */
function summaryText(ctx: ChatOrderContext, order: ChatOrderView): string {
  const values = orderValues(order)
  const adjustments = (order.adjustments ?? []).map((row) => `${row.label} · ${row.centavos < 0 ? '-' : ''}${formatCentavos(Math.abs(row.centavos))}`)
  const head = [words(ctx, 'chatorder.intro', values), '']
  const tail = [
    ...(adjustments.length > 0 ? ['', ...adjustments] : []),
    '',
    ...(order.orderType ? [order.orderType] : []),
    words(ctx, 'chatorder.total', values),
  ]
  const fixed = [...head, ...tail].join('\n').length
  // Room for the dishes, keeping space for "+N more" and the newlines around it.
  let room = MESSENGER_LIMITS.text - fixed - `\n+${order.lines.length} more\n`.length
  const shown: string[] = []
  let count = 0
  for (const line of order.lines.slice(0, MAX_SUMMARY_LINES)) {
    const rows = dishLines(line)
    const cost = rows.join('\n').length + 1
    if (cost > room) break
    room -= cost
    shown.push(...rows)
    count += 1
  }
  const hidden = order.lines.length - count
  const body = [...head, ...shown, ...(hidden > 0 ? [`+${hidden} more`] : []), ...tail].join('\n')
  // An owner's very long intro can still pass the limit; the total is then the one thing kept whole.
  if (body.length <= MESSENGER_LIMITS.text) return body
  const total = words(ctx, 'chatorder.total', values)
  return `${clip(body.slice(0, body.length - total.length), MESSENGER_LIMITS.text - total.length - 1)}\n${total}`
}

/** The summary the customer confirms: the order as text, then Confirm / Change. */
export function buildChatOrderSummary(ctx: ChatOrderContext, order: ChatOrderView): OutgoingMessage[] {
  const values = orderValues(order)
  return [
    { kind: 'text', text: summaryText(ctx, order) },
    {
      kind: 'buttons',
      text: clip(words(ctx, 'chatorder.ask', values), MESSENGER_LIMITS.buttonTemplateText),
      buttons: [
        { type: 'postback', title: clip(words(ctx, 'chatorder.confirm_button'), MESSENGER_LIMITS.buttonTitle), payload: encodePayload({ verb: 'order_ok', orderId: order.id, ...(order.revision !== undefined ? { revision: order.revision } : {}) }) },
        { type: 'postback', title: clip(words(ctx, 'chatorder.change_button'), MESSENGER_LIMITS.buttonTitle), payload: encodePayload({ verb: 'order_change', orderId: order.id }) },
      ],
    },
  ]
}

// ── 1. Sending the summary ───────────────────────────────────────────────────

export type ChatOrderSkip =
  | 'not_platform' | 'not_waiting' | 'no_session' | 'outside_window' | 'no_page' | 'no_store'
  /** The order's dishes never arrived (the register writes them just after the order). */
  | 'no_items'
  /** More summaries to one chat in an hour than a person rings up. */
  | 'too_many'

/** Summaries one chat can get in an hour (each is a real register sale). */
export const MAX_SUMMARIES_PER_HOUR = 6
const HOUR_MS = 60 * 60 * 1000
export type ChatOrderOutcome = 'sent' | 'send_failed' | ChatOrderSkip

export interface ChatOrderRow extends ChatOrderView {
  tenantId: string
  /** `customer_data.messenger_session_id`: the chat the register named. A hint, re-checked here. */
  sessionId: string | null
}

export interface ChatOrderSession {
  id: string
  psid: string
  firstName: string | null
  lastInboundAt: Date | null
}

export interface ChatOrderStore {
  name: string
  isPlatformOrders: boolean
  messages: MessageSettings
  facebookPageRowId: string | null
}

export interface ChatOrderDeps {
  now(): Date
  /** The order with the dishes already saved (no waiting). */
  readOrder(orderId: string): Promise<ChatOrderRow | null>
  /** The same, after waiting a few seconds for dishes the register is still writing. */
  waitForDishes(orderId: string): Promise<ChatOrderRow | null>
  /** Insert the order's one claim row; false = already handled. */
  claim(input: { orderId: string; tenantId: string; sessionId: string | null }): Promise<boolean>
  record(input: { orderId: string; outcome: ChatOrderOutcome; isWaiting: boolean; now: Date }): Promise<void>
  loadStore(tenantId: string): Promise<ChatOrderStore | null>
  /** The chat, only if it belongs to THIS store. */
  readSession(tenantId: string, sessionId: string): Promise<ChatOrderSession | null>
  /** Summaries this chat was sent since `since` (this order's own claim not counted). */
  countRecent(input: { sessionId: string; orderId: string; since: Date }): Promise<number>
  /** Put the customer on the order (server-side; the register never sends a Messenger id). */
  attachCustomer(input: { orderId: string; tenantId: string; psid: string }): Promise<boolean>
  findPageToken(tenantId: string, pageRowId: string): Promise<string | null>
  send(token: string, psid: string, messages: readonly OutgoingMessage[]): Promise<SendResult>
  logChat?(input: { tenantId: string; sessionId: string; lines: readonly ChatLogLine[] }): Promise<void>
}

export type ChatOrderResult = { outcome: 'not_found' | 'not_a_chat_order' | 'duplicate' } | { outcome: ChatOrderOutcome }

/** Meta lets a Page write only within 24 hours of the customer's last message. */
export function isInsideWindow(lastInboundAt: Date | null, now: Date): boolean {
  return lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() < MESSAGING_WINDOW_MS
}

export async function runChatOrder(orderId: string, deps: ChatOrderDeps): Promise<ChatOrderResult> {
  const first = await deps.readOrder(orderId)
  if (!first) return { outcome: 'not_found' }
  if (!first.sessionId) return { outcome: 'not_a_chat_order' }
  // Claim BEFORE waiting for the dishes: a replayed call ends here at once.
  if (!(await deps.claim({ orderId, tenantId: first.tenantId, sessionId: first.sessionId }))) return { outcome: 'duplicate' }
  const sessionId = first.sessionId
  const order = first.lines.length > 0 ? first : { ...((await deps.waitForDishes(orderId)) ?? first), tenantId: first.tenantId }

  const now = deps.now()
  const finish = async (outcome: ChatOrderOutcome): Promise<ChatOrderResult> => {
    await deps.record({ orderId, outcome, isWaiting: outcome === 'sent' && order.status === 'pending', now })
    return { outcome }
  }

  const store = await deps.loadStore(order.tenantId)
  if (!store) return finish('no_store')
  if (!store.isPlatformOrders) return finish('not_platform')
  const session = await deps.readSession(order.tenantId, sessionId)
  if (!session) return finish('no_session')
  // The customer goes on the order even when nothing can be sent: the app then
  // shows whose order it is, and later status messages find the chat.
  await deps.attachCustomer({ orderId, tenantId: order.tenantId, psid: session.psid })
  // Cancelled or already finished before we got here: nothing to confirm.
  if (order.status === 'cancelled' || order.status === 'delivered') return finish('not_waiting')
  if (order.lines.length === 0) return finish('no_items')
  if (!isInsideWindow(session.lastInboundAt, now)) return finish('outside_window')
  const recent = await deps.countRecent({ sessionId: session.id, orderId, since: new Date(now.getTime() - HOUR_MS) })
  if (recent >= MAX_SUMMARIES_PER_HOUR) return finish('too_many')
  if (!store.facebookPageRowId) return finish('no_page')
  const token = await deps.findPageToken(order.tenantId, store.facebookPageRowId)
  if (!token) return finish('no_page')

  const ctx: ChatOrderContext = { storeName: store.name, messages: store.messages, customerName: greetingName(session.firstName) }
  const messages = buildChatOrderSummary(ctx, order)
  const result = await deps.send(token, session.psid, messages)
  const line = result.ok ? botLine([{ kind: 'text', text: `🧾 Sent order ${order.label} to confirm · ${formatCentavos(order.totalCentavos)}` }], deps.now()) : null
  if (line && deps.logChat) await deps.logChat({ tenantId: order.tenantId, sessionId: session.id, lines: [line] }).catch(() => undefined)
  return finish(result.ok ? 'sent' : 'send_failed')
}

// ── 2. The customer's taps ───────────────────────────────────────────────────

export type ChatOrderTap = Extract<MessengerPayload, { verb: 'order_ok' | 'order_change' | 'order_pay' }>

export function isChatOrderTap(payload: MessengerPayload | null): payload is ChatOrderTap {
  return payload !== null && (payload.verb === 'order_ok' || payload.verb === 'order_change' || payload.verb === 'order_pay')
}

export type ChatOrderTapResult =
  /** This tap confirmed it. `chosen` = the store's only payment method, already put on the order. */
  | { kind: 'confirmed' | 'already'; order: ChatOrderView; methods: PayChoice[]; chosen: PayChoice | null }
  /** Cancelled, finished, not this customer's, or not found. */
  | { kind: 'gone' }
  /** Something failed on our side (nothing was changed): tap again. */
  | { kind: 'retry' }
  /** "Change something" — or a Confirm from before it, while staff are still changing the order. */
  | { kind: 'change'; order: ChatOrderView }
  /** Confirm under a summary older than the order (staff edited it since): the new summary, to confirm again. */
  | { kind: 'updated'; order: ChatOrderView }
  | { kind: 'paid_with'; order: ChatOrderView; method: PayChoice }
  /** The method is no longer offered: ask again. */
  | { kind: 'pick_again'; order: ChatOrderView; methods: PayChoice[] }

export interface ChatOrderTapDeps {
  /**
   * Apply a tap for THIS customer at THIS store and say what happened. The
   * implementation re-reads the order and refuses one whose stored customer
   * is someone else.
   */
  applyChatOrderTap(input: { tenantId: string; psid: string; tap: ChatOrderTap; now: Date }): Promise<ChatOrderTapResult>
}

function payQuickReplies(order: ChatOrderView, methods: readonly PayChoice[]): QuickReply[] {
  return methods.slice(0, MESSENGER_LIMITS.quickReplies).map((method) => ({
    title: clip(method.name, MESSENGER_LIMITS.quickReplyTitle),
    payload: encodePayload({ verb: 'order_pay', orderId: order.id, methodId: method.id }),
  }))
}

function payLine(ctx: ChatOrderContext, order: ChatOrderView, method: PayChoice): OutgoingMessage {
  const text = words(ctx, 'chatorder.pay_line', { ...orderValues(order), method: method.name, details: method.details })
  return { kind: 'text', text: clip(text, MESSENGER_LIMITS.text) }
}

/** After a confirm: nothing more for a paid order, the one method's line, or the choice of methods. */
function paymentStep(ctx: ChatOrderContext, order: ChatOrderView, methods: readonly PayChoice[], chosen: PayChoice | null): OutgoingMessage[] {
  if (order.isPaid) return []
  if (chosen) return [payLine(ctx, order, chosen)]
  if (order.hasPaymentMethod || methods.length === 0) return []
  return [{ kind: 'text', text: clip(words(ctx, 'chatorder.pay_ask', orderValues(order)), MESSENGER_LIMITS.text), quickReplies: payQuickReplies(order, methods) }]
}

/**
 * "How to pay" sent by staff from the app: the store's one method's payment
 * line, or the question with every method as a button. Empty for a paid
 * order or a store without methods (the app offers no such chip then).
 */
export function buildPayRequest(ctx: ChatOrderContext, order: ChatOrderView, methods: readonly PayChoice[]): OutgoingMessage[] {
  if (order.isPaid || methods.length === 0) return []
  return paymentStep(ctx, { ...order, hasPaymentMethod: false }, methods, methods.length === 1 ? methods[0] : null)
}

/** What the customer reads after a tap. Never empty. */
export function buildChatOrderTapReply(ctx: ChatOrderContext, result: ChatOrderTapResult): OutgoingMessage[] {
  const text = (id: TextMessageId, order?: ChatOrderView): OutgoingMessage => ({
    kind: 'text',
    text: clip(words(ctx, id, order ? orderValues(order) : {}), MESSENGER_LIMITS.text),
  })
  switch (result.kind) {
    case 'confirmed':
      return [text('chatorder.confirmed', result.order), ...paymentStep(ctx, result.order, result.methods, result.chosen)]
    case 'already':
      return [text('chatorder.already', result.order), ...paymentStep(ctx, result.order, result.methods, result.chosen)]
    case 'gone':
      return [text('chatorder.gone')]
    case 'retry':
      return [text('chatorder.try_again')]
    case 'updated':
      return [text('chatorder.updated', result.order), ...buildChatOrderSummary(ctx, result.order)]
    case 'change':
      return [text('chatorder.change', result.order)]
    case 'paid_with':
      return [payLine(ctx, result.order, result.method)]
    case 'pick_again':
      return paymentStep(ctx, { ...result.order, hasPaymentMethod: false }, result.methods, null).length > 0
        ? paymentStep(ctx, { ...result.order, hasPaymentMethod: false }, result.methods, null)
        : [text('chatorder.already', result.order)]
  }
}

/** A Change tap hands the chat to staff: the bot stays quiet while they sort it out. */
export function tapPausesBot(result: ChatOrderTapResult): boolean {
  return result.kind === 'change'
}
