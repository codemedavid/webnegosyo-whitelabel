/**
 * What the Studio's phone shows: a short sample conversation for each moment
 * of the customer's path, or for the message being edited. Built from the
 * same builders the webhook uses, with the draft wording. Pure.
 */

import { chatOrderableItem, priceChatCart, type CartOpOutcome, type ChatCartLine } from './chat-cart'
import { decideReply } from './decide'
import type { OutgoingMessage } from './graph-message'
import { MESSAGE_BY_ID, type MessageMoment, type MessageSettings } from './messages/registry'
import type { ReplyOrder, UpdateStatus } from './order-view'
import {
  buildCart, buildCartChange, buildCategories, buildCategoryItems, buildClearConfirm, buildHoursLocation,
  buildOrderStatus, buildOrderUpdate, buildReply, buildTalkToStaff, type ReplyContext,
} from './replies'
import type { MessengerRule } from './rules'
import type { ReplyStore } from './store-view'
import { encodePayload } from './payload'

export const PREVIEW_MOMENTS = ['hello', 'browsing', 'cart', 'after', 'handover'] as const
export type PreviewMoment = (typeof PREVIEW_MOMENTS)[number]

export const PREVIEW_MOMENT_LABELS: Record<PreviewMoment, string> = {
  hello: 'First hello',
  browsing: 'Browsing',
  cart: 'Cart',
  after: 'After ordering',
  handover: 'Handover',
}

export type Turn =
  | { from: 'customer'; text: string }
  | { from: 'bot'; messages: OutgoingMessage[] }
  /** A grey line between turns ("Order placed on your website"). */
  | { from: 'note'; text: string }

export interface ScenarioInput {
  store: ReplyStore
  rules: readonly MessengerRule[]
  messages: MessageSettings
  customerName: string
}

const SAMPLE_ORDER_LABEL = '#07'

function context(input: ScenarioInput, cart?: { lines: ChatCartLine[]; outcome?: CartOpOutcome; itemId?: string }): ReplyContext {
  return {
    store: input.store,
    linkToken: null,
    messages: input.messages,
    customerName: input.customerName,
    ...(cart ? { cart: { priced: priceChatCart(cart.lines, input.store), ...(cart.outcome ? { outcome: cart.outcome } : {}), ...(cart.itemId ? { itemId: cart.itemId } : {}) } } : {}),
  }
}

/** Up to two dishes that can go in the chat cart. */
function sampleCartLines(store: ReplyStore): ChatCartLine[] {
  return store.items.filter((item) => chatOrderableItem(store, item.id)).slice(0, 2).map((item, index) => ({ itemId: item.id, qty: index === 0 ? 2 : 1 }))
}

function sampleOrder(input: ScenarioInput, status: ReplyOrder['status'], kind: ReplyOrder['kind'] = 'pickup'): ReplyOrder {
  return { id: 'sample', label: SAMPLE_ORDER_LABEL, status, kind, totalCentavos: 44700, trackingUrl: `${input.store.baseUrl}/menu` }
}

function update(input: ScenarioInput, status: UpdateStatus, kind: ReplyOrder['kind'] = 'pickup'): Turn {
  return { from: 'bot', messages: buildOrderUpdate({ storeName: input.store.name, messages: input.messages, customerName: input.customerName }, status, sampleOrder(input, status, kind)) }
}

function helloTurns(input: ScenarioInput): Turn[] {
  const decision = decideReply({ kind: 'postback', payload: encodePayload({ verb: 'start' }), title: 'Get Started', pageId: 'p', psid: 's', timestamp: 0, dedupeKey: 'k' }, input.rules)
  return [{ from: 'customer', text: 'Get Started' }, { from: 'bot', messages: decision ? decision.build(context(input)) : buildReply({ kind: 'menu_card' }, context(input)) }]
}

function browsingTurns(input: ScenarioInput): Turn[] {
  const ctx = context(input)
  const first = input.store.categories[0]
  const turns: Turn[] = [{ from: 'customer', text: '📋 Categories' }, { from: 'bot', messages: buildCategories(ctx) }]
  if (first) turns.push({ from: 'customer', text: first.name }, { from: 'bot', messages: buildCategoryItems(ctx, first.id, 0) })
  return turns
}

function cartTurns(input: ScenarioInput): Turn[] {
  const lines = sampleCartLines(input.store)
  if (lines.length === 0) return [{ from: 'customer', text: 'cart' }, { from: 'bot', messages: buildCart(context(input, { lines: [] })) }]
  return [
    { from: 'customer', text: '🛒 Add to cart' },
    { from: 'bot', messages: buildCartChange(context(input, { lines, outcome: 'added', itemId: lines[0].itemId })) },
    { from: 'customer', text: '🛒 View cart' },
    { from: 'bot', messages: buildCart(context(input, { lines })) },
  ]
}

function afterTurns(input: ScenarioInput): Turn[] {
  return [
    { from: 'note', text: `Order ${SAMPLE_ORDER_LABEL} placed · pickup` },
    update(input, 'preparing'),
    update(input, 'ready'),
    { from: 'customer', text: 'nasaan na order ko?' },
    { from: 'bot', messages: buildOrderStatus({ ...context(input), orders: [sampleOrder(input, 'ready')] }) },
  ]
}

function handoverTurns(input: ScenarioInput): Turn[] {
  return [
    { from: 'customer', text: 'pwede po makausap tao?' },
    { from: 'bot', messages: buildTalkToStaff(context(input)) },
    { from: 'note', text: 'The bot waits while your staff reply in Page Inbox' },
  ]
}

export function momentTurns(moment: PreviewMoment, input: ScenarioInput): Turn[] {
  switch (moment) {
    case 'hello': return helloTurns(input)
    case 'browsing': return browsingTurns(input)
    case 'cart': return cartTurns(input)
    case 'after': return afterTurns(input)
    case 'handover': return handoverTurns(input)
  }
}

const MESSAGE_MOMENT_TO_PREVIEW: Record<MessageMoment, PreviewMoment> = {
  browsing: 'browsing',
  cart: 'cart',
  after: 'after',
  handover: 'handover',
}

/** A cart reply for an outcome other than "added". */
function cartOutcomeTurns(input: ScenarioInput, tapped: string, outcome: CartOpOutcome, lines: ChatCartLine[]): Turn[] {
  return [{ from: 'customer', text: tapped }, { from: 'bot', messages: buildCartChange(context(input, { lines, outcome, itemId: lines[0]?.itemId })) }]
}

/** The conversation that shows the message being edited, so the owner sees it in place. */
export function messageTurns(id: string, input: ScenarioInput): Turn[] {
  const entry = MESSAGE_BY_ID.get(id)
  if (!entry) return momentTurns('hello', input)
  const lines = sampleCartLines(input.store)
  const ctx = context(input)
  switch (id) {
    case 'browse.menu_title':
    case 'browse.menu_subtitle':
    case 'browse.menu_button':
    case 'browse.show_categories_button':
      return [{ from: 'customer', text: 'menu' }, { from: 'bot', messages: buildReply({ kind: 'menu_card' }, ctx) }]
    case 'browse.featured_text':
      return [{ from: 'customer', text: 'magkano po?' }, { from: 'bot', messages: buildReply({ kind: 'featured_items', itemIds: [] }, ctx) }]
    case 'browse.category_missing':
      return [{ from: 'customer', text: 'Old Specials' }, { from: 'bot', messages: buildCategoryItems(ctx, 'gone') }]
    case 'browse.no_menu':
      return [{ from: 'customer', text: '📋 Categories' }, { from: 'bot', messages: buildReply({ kind: 'categories' }, { ...ctx, store: { ...input.store, items: [] } }) }]
    case 'info.hours_location':
    case 'info.directions':
      return [{ from: 'customer', text: 'open po kayo?' }, { from: 'bot', messages: buildHoursLocation(ctx) }]
    case 'cart.empty':
      return [{ from: 'customer', text: 'cart' }, { from: 'bot', messages: buildCart(context(input, { lines: [] })) }]
    case 'cart.unreadable':
      return [{ from: 'customer', text: 'cart' }, { from: 'bot', messages: buildCart(ctx) }]
    case 'cart.unavailable':
      return cartOutcomeTurns(input, '🛒 Add to cart', 'unavailable', lines)
    case 'cart.full':
      return cartOutcomeTurns(input, '🛒 Add to cart', 'cart_full', lines)
    case 'cart.max_qty':
      return cartOutcomeTurns(input, '➕', 'max_qty', lines)
    case 'cart.not_in_cart':
      return cartOutcomeTurns(input, '➖', 'not_in_cart', lines)
    case 'cart.dropped_one':
    case 'cart.dropped_many': {
      const gone: ChatCartLine[] = id === 'cart.dropped_one'
        ? [{ itemId: 'sold-out-1', qty: 1, name: 'Halo-halo' }]
        : [{ itemId: 'sold-out-1', qty: 1, name: 'Halo-halo' }, { itemId: 'sold-out-2', qty: 1, name: 'Leche Flan' }]
      return [{ from: 'customer', text: '🛒 View cart' }, { from: 'bot', messages: buildCart(context(input, { lines: [...gone, ...lines] })) }]
    }
    case 'cart.clear_ask':
    case 'cart.clear_yes':
    case 'cart.clear_no':
    case 'cart.cleared':
      return [
        { from: 'customer', text: 'Empty cart' },
        { from: 'bot', messages: buildClearConfirm(ctx) },
        { from: 'customer', text: 'Yes, empty it' },
        { from: 'bot', messages: buildCartChange(context(input, { lines: [], outcome: 'cleared' })) },
      ]
    case 'cart.added':
    case 'cart.checkout':
    case 'cart.view_cart':
      return cartTurns(input).slice(0, 2)
    case 'orders.none':
      return [{ from: 'customer', text: 'nasaan na order ko?' }, { from: 'bot', messages: buildOrderStatus({ ...ctx, orders: [] }) }]
    case 'orders.status_text':
      return [{ from: 'customer', text: 'nasaan na order ko?' }, { from: 'bot', messages: buildOrderStatus({ ...ctx, orders: null }) }]
    case 'orders.update.confirmed':
      return [{ from: 'note', text: `Order ${SAMPLE_ORDER_LABEL} placed · pickup` }, update(input, 'confirmed')]
    case 'orders.update.preparing':
      return [{ from: 'note', text: `Order ${SAMPLE_ORDER_LABEL} placed · pickup` }, update(input, 'preparing')]
    case 'orders.update.ready':
      return [{ from: 'note', text: 'Pickup order' }, update(input, 'ready', 'pickup'), { from: 'note', text: 'Delivery order' }, update(input, 'ready', 'delivery')]
    case 'orders.update.delivered':
      return [{ from: 'note', text: 'Pickup order' }, update(input, 'delivered', 'pickup'), { from: 'note', text: 'Delivery order' }, update(input, 'delivered', 'delivery')]
    case 'orders.update.cancelled':
      return [{ from: 'note', text: `Order ${SAMPLE_ORDER_LABEL} placed · pickup` }, update(input, 'cancelled')]
    default:
      return momentTurns(MESSAGE_MOMENT_TO_PREVIEW[entry.moment], input)
  }
}
