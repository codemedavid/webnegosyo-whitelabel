/**
 * Rule action → the Messenger messages it sends. Pure.
 *
 * Every builder clips to Meta's limits (`limits.ts`), so a long store or dish
 * name can never get a reply refused. The editor preview renders these same
 * messages.
 */

import { clip, MESSENGER_LIMITS } from './limits'
import type { CardElement, MessengerButton, OutgoingMessage, QuickReply } from './graph-message'
import { encodePayload } from './payload'
import type { RuleAction, TextButton } from './rules'
import type { ReplyItem, ReplyStore } from './store-view'
import type { CartOpOutcome, PricedChatCart } from './chat-cart'
import { statusLabel, type OrderKind, type ReplyOrder, type UpdateStatus } from './order-view'
import {
  defaultText,
  isToggleOn,
  UPDATE_MESSAGE_IDS,
  type MessageSettings,
  type TextMessageId,
  type ToggleId,
} from './messages/registry'
import { fillTemplate, type FillValues } from './messages/fill'

/** Dishes per carousel page; the 10th card is "See more". */
export const ITEMS_PER_PAGE = MESSENGER_LIMITS.cardElements - 1
/** Quick replies left for categories after "Full menu". */
const CATEGORY_QUICK_REPLIES = MESSENGER_LIMITS.quickReplies - 1

export interface ChatCartView {
  priced: PricedChatCart
  /** Set when this reply answers a tap that changed the cart. */
  outcome?: CartOpOutcome
  /** The dish the tap was about. */
  itemId?: string
}

export interface ReplyContext {
  store: ReplyStore
  /** Signed Messenger link token (`link-token.ts`); links carry it as `?m=`. */
  linkToken: string | null
  /** The customer's chat cart, priced. Missing = it could not be read. */
  cart?: ChatCartView
  /**
   * This customer's recent orders at this store. Missing = not read (no
   * session); null = the store's orders aren't on the platform database.
   */
  orders?: ReplyOrder[] | null
  /** The store's own wording (`messenger_settings.messages`). Missing = the defaults. */
  messages?: MessageSettings
  /** The customer's first name, already cleaned (`greetingName`). Missing / '' = no name. */
  customerName?: string
}

/**
 * The English defaults the rule editor shows as placeholders. The words
 * themselves live in the message registry (`messages/registry.ts`).
 */
export const DEFAULT_WORDING = {
  menuCardSubtitle: defaultText('browse.menu_subtitle'),
  menuCardButton: defaultText('browse.menu_button'),
  categoriesText: defaultText('browse.categories_text'),
  featuredText: defaultText('browse.featured_text'),
  orderStatus: defaultText('orders.status_text'),
  talkToStaff: defaultText('handover.staff_reply'),
  hoursLocation: defaultText('info.hours_location'),
} as const

function withToken(url: string, token: string | null): string {
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}m=${encodeURIComponent(token)}`
}

export function menuUrl(ctx: ReplyContext): string {
  return withToken(`${ctx.store.baseUrl}/menu`, ctx.linkToken)
}

export function itemUrl(ctx: ReplyContext, itemId: string): string {
  return withToken(`${ctx.store.baseUrl}/menu/item/${encodeURIComponent(itemId)}`, ctx.linkToken)
}

/** The web cart, which loads this chat cart (`mc=1`, `MessengerCartImport`). */
export function checkoutUrl(ctx: ReplyContext): string {
  return withToken(`${ctx.store.baseUrl}/cart?mc=1`, ctx.linkToken)
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** Placeholders a rule's own text may use (every reply knows them). */
export const PLACEHOLDERS = ['store', 'name', 'menu_link', 'hours', 'address'] as const

function baseValues(ctx: ReplyContext): Record<(typeof PLACEHOLDERS)[number], string> {
  return {
    store: ctx.store.name,
    name: ctx.customerName ?? '',
    menu_link: menuUrl(ctx),
    hours: ctx.store.hoursText ?? '',
    address: ctx.store.address ?? '',
  }
}

/**
 * `{store}`, `{name}`, `{menu_link}`, `{hours}`, `{address}` (+ `extra`). A
 * line whose placeholders all came out blank (a store with no address) is
 * dropped, so "📍 " never goes out alone.
 */
export function fillPlaceholders(text: string, ctx: ReplyContext, extra: FillValues = {}): string {
  return fillTemplate(text, { ...baseValues(ctx), ...extra })
}

/**
 * A registry message: the store's words if set (and not blank once filled),
 * else the default in the store's language.
 */
export function say(ctx: ReplyContext, id: TextMessageId, extra: FillValues = {}, kind: OrderKind = null): string {
  const custom = ctx.messages?.texts[id]
  return (custom ? fillPlaceholders(custom, ctx, extra) : '') || fillPlaceholders(defaultText(id, ctx.messages?.lang, kind), ctx, extra)
}

function shows(ctx: ReplyContext, id: ToggleId): boolean {
  return isToggleOn(ctx.messages, id)
}

/**
 * A rule's own text, else the store's message, else the store name. Never
 * empty: Meta refuses an empty message, and the customer would get nothing.
 */
function wording(ctx: ReplyContext, custom: string | undefined, id: TextMessageId): string {
  return (custom ? fillPlaceholders(custom, ctx) : '') || say(ctx, id) || ctx.store.name
}

function button(title: string, target: { url: string } | { payload: string }): MessengerButton {
  const label = clip(title, MESSENGER_LIMITS.buttonTitle)
  return 'url' in target ? { type: 'web_url', title: label, url: target.url } : { type: 'postback', title: label, payload: target.payload }
}

function quickReply(title: string, payload: string): QuickReply {
  return { title: clip(title, MESSENGER_LIMITS.quickReplyTitle), payload }
}

function navigationQuickReplies(ctx: ReplyContext): QuickReply[] {
  const replies: QuickReply[] = []
  if (ctx.store.categories.length > 0) replies.push(quickReply(say(ctx, 'browse.categories_button'), encodePayload({ verb: 'categories' })))
  replies.push(quickReply(say(ctx, 'browse.full_menu'), encodePayload({ verb: 'menu' })))
  return replies
}

export function formatPeso(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const text = Number.isInteger(rounded) ? rounded.toLocaleString('en-PH') : rounded.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `₱${text}`
}

function priceLine(ctx: ReplyContext, item: ReplyItem): string {
  if (item.discountedPrice === null) return formatPeso(item.price)
  return shows(ctx, 'browse.show_was_price')
    ? `${formatPeso(item.discountedPrice)} (was ${formatPeso(item.price)})`
    : formatPeso(item.discountedPrice)
}

function itemCard(ctx: ReplyContext, item: ReplyItem): CardElement {
  const url = itemUrl(ctx, item.id)
  const subtitle = [priceLine(ctx, item), item.description].filter(Boolean).join(' · ')
  return {
    title: clip(item.name, MESSENGER_LIMITS.cardTitle),
    subtitle: clip(subtitle, MESSENGER_LIMITS.cardSubtitle),
    imageUrl: item.imageUrl ?? ctx.store.logoUrl ?? undefined,
    tapUrl: url,
    buttons: item.needsChoices
      ? [button(say(ctx, 'browse.choose_options'), { url }), button(say(ctx, 'browse.full_menu'), { url: menuUrl(ctx) })]
      : [
          button(say(ctx, 'browse.add_to_cart'), { payload: encodePayload({ verb: 'add', itemId: item.id }) }),
          ...(shows(ctx, 'browse.show_view_item') ? [button(say(ctx, 'browse.view_item'), { url })] : []),
          button(say(ctx, 'browse.full_menu'), { url: menuUrl(ctx) }),
        ],
  }
}

function textMessage(text: string, quickReplies?: QuickReply[]): OutgoingMessage {
  return { kind: 'text', text: clip(text, MESSENGER_LIMITS.text), ...(quickReplies && quickReplies.length > 0 ? { quickReplies } : {}) }
}

export function buildMenuCard(ctx: ReplyContext, action: Extract<RuleAction, { kind: 'menu_card' }> = { kind: 'menu_card' }): OutgoingMessage[] {
  const url = menuUrl(ctx)
  const buttons: MessengerButton[] = [button(action.buttonLabel || say(ctx, 'browse.menu_button'), { url })]
  if (action.showCategoriesButton !== false && shows(ctx, 'browse.show_categories_button') && ctx.store.categories.length > 1) {
    buttons.push(button(say(ctx, 'browse.categories_button'), { payload: encodePayload({ verb: 'categories' }) }))
  }
  return [{
    kind: 'cards',
    cards: [{
      title: clip(wording(ctx, action.title, 'browse.menu_title'), MESSENGER_LIMITS.cardTitle),
      subtitle: clip(wording(ctx, action.subtitle, 'browse.menu_subtitle'), MESSENGER_LIMITS.cardSubtitle),
      imageUrl: ctx.store.logoUrl ?? undefined,
      tapUrl: url,
      buttons,
    }],
  }]
}

export function buildCategories(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  return categoriesMessage(ctx, wording(ctx, text, 'browse.categories_text'))
}

/** The category quick replies under words already filled. */
function categoriesMessage(ctx: ReplyContext, words: string): OutgoingMessage[] {
  if (ctx.store.categories.length === 0) return buildMenuCard(ctx)
  const replies = ctx.store.categories
    .slice(0, CATEGORY_QUICK_REPLIES)
    .map((category) => quickReply(category.name, encodePayload({ verb: 'category', categoryId: category.id, page: 0 })))
  replies.push(quickReply(say(ctx, 'browse.full_menu'), encodePayload({ verb: 'menu' })))
  return [textMessage(words, replies)]
}

function carousel(ctx: ReplyContext, items: readonly ReplyItem[], more: CardElement | null): OutgoingMessage {
  const cards = items.slice(0, ITEMS_PER_PAGE).map((item) => itemCard(ctx, item))
  return { kind: 'cards', cards: more ? [...cards, more] : cards, quickReplies: navigationQuickReplies(ctx) }
}

export function buildCategoryItems(ctx: ReplyContext, categoryId: string, page = 0, text?: string): OutgoingMessage[] {
  const category = ctx.store.categories.find((entry) => entry.id === categoryId)
  if (!category) return [textMessage(say(ctx, 'browse.category_missing')), ...buildCategories(ctx).slice(0, 1)]

  const all = ctx.store.items.filter((item) => item.categoryId === categoryId)
  const lastPage = Math.max(0, Math.ceil(all.length / ITEMS_PER_PAGE) - 1)
  const safePage = Math.min(Math.max(0, page), lastPage)
  const start = safePage * ITEMS_PER_PAGE
  const pageItems = all.slice(start, start + ITEMS_PER_PAGE)
  const remaining = all.length - (start + pageItems.length)

  const more: CardElement | null = remaining > 0
    ? {
        title: clip(say(ctx, 'browse.more_title', { more: String(remaining), category: category.name }), MESSENGER_LIMITS.cardTitle),
        subtitle: clip(say(ctx, 'browse.more_subtitle'), MESSENGER_LIMITS.cardSubtitle),
        buttons: [
          button(say(ctx, 'browse.see_more'), { payload: encodePayload({ verb: 'category', categoryId, page: safePage + 1 }) }),
          button(say(ctx, 'browse.full_menu'), { url: menuUrl(ctx) }),
        ],
      }
    : null

  const introText = text && page === 0 ? fillPlaceholders(text, ctx) : ''
  const intro = introText ? [textMessage(introText)] : []
  return [...intro, carousel(ctx, pageItems, more)]
}

export function buildFeaturedItems(ctx: ReplyContext, itemIds: readonly string[], text?: string): OutgoingMessage[] {
  const byId = new Map(ctx.store.items.map((item) => [item.id, item]))
  const picked = itemIds.map((id) => byId.get(id)).filter((item): item is ReplyItem => item !== undefined)
  const items = picked.length > 0
    ? picked
    : (ctx.store.items.some((item) => item.isFeatured) ? ctx.store.items.filter((item) => item.isFeatured) : ctx.store.items)
  if (items.length === 0) return buildMenuCard(ctx)
  return [textMessage(wording(ctx, text, 'browse.featured_text')), carousel(ctx, items, null)]
}

function textButton(ctx: ReplyContext, entry: TextButton): MessengerButton {
  switch (entry.kind) {
    case 'link':
      return button(entry.label, { url: entry.url })
    case 'menu':
      return button(entry.label, { url: menuUrl(ctx) })
    case 'categories':
      return button(entry.label, { payload: encodePayload({ verb: 'categories' }) })
    case 'staff':
      return button(entry.label, { payload: encodePayload({ verb: 'staff' }) })
  }
}

export function buildText(ctx: ReplyContext, text: string, buttons: readonly TextButton[]): OutgoingMessage[] {
  const filled = fillPlaceholders(text, ctx) || ctx.store.name
  if (buttons.length === 0) return [textMessage(filled)]
  return [{
    kind: 'buttons',
    text: clip(filled, MESSENGER_LIMITS.buttonTemplateText),
    buttons: buttons.slice(0, MESSENGER_LIMITS.cardButtons).map((entry) => textButton(ctx, entry)),
  }]
}

export function buildHoursLocation(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  const body = wording(ctx, text, 'info.hours_location')
  const buttons: MessengerButton[] = []
  if (ctx.store.address) buttons.push(button(say(ctx, 'info.directions'), { url: mapsUrl(ctx.store.address) }))
  buttons.push(button(say(ctx, 'browse.full_menu'), { url: menuUrl(ctx) }))
  return [{ kind: 'buttons', text: clip(body, MESSENGER_LIMITS.buttonTemplateText), buttons }]
}

export function buildTalkToStaff(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  return [textMessage(wording(ctx, text, 'handover.staff_reply'))]
}

function orderCard(ctx: ReplyContext, order: ReplyOrder): CardElement {
  return {
    title: clip(say(ctx, 'orders.card_title', { order: order.label, status: statusLabel(order.status, order.kind) }), MESSENGER_LIMITS.cardTitle),
    subtitle: clip(say(ctx, 'orders.card_subtitle', { total: formatCentavos(order.totalCentavos) }), MESSENGER_LIMITS.cardSubtitle),
    ...(order.trackingUrl ? { tapUrl: order.trackingUrl } : {}),
    buttons: order.trackingUrl ? [button(say(ctx, 'orders.track'), { url: order.trackingUrl })] : [],
  }
}

/**
 * This customer's recent orders, each with its tracking link. A store whose
 * orders aren't on the platform database (or a chat with no session) gets
 * the owner's text / the tracking-link explanation, as before.
 */
export function buildOrderStatus(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  if (!ctx.orders) return [textMessage(wording(ctx, text, 'orders.status_text'), navigationQuickReplies(ctx))]
  if (ctx.orders.length === 0) return [textMessage(wording(ctx, undefined, 'orders.none'), navigationQuickReplies(ctx))]
  return [
    textMessage(wording(ctx, text, 'orders.intro')),
    { kind: 'cards', cards: ctx.orders.slice(0, ITEMS_PER_PAGE).map((order) => orderCard(ctx, order)), quickReplies: navigationQuickReplies(ctx) },
  ]
}

// ── Chat cart ───────────────────────────────────────────────────────────────

export function formatCentavos(centavos: number): string {
  return formatPeso(centavos / 100)
}

/** "3 items" — the `{count}` placeholder. */
function itemCountText(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`
}

function cartValues(priced: PricedChatCart): FillValues {
  return { count: itemCountText(priced.itemCount), total: formatCentavos(priced.totalCentavos) }
}

/** Keep browsing, unless the owner hid it. */
function browseButtons(ctx: ReplyContext): MessengerButton[] {
  if (!shows(ctx, 'cart.show_keep_browsing')) return []
  return [ctx.store.categories.length > 0
    ? button(say(ctx, 'cart.keep_browsing'), { payload: encodePayload({ verb: 'categories' }) })
    : button(say(ctx, 'cart.keep_browsing'), { url: menuUrl(ctx) })]
}

function droppedNotice(ctx: ReplyContext, priced: PricedChatCart): OutgoingMessage[] {
  if (priced.droppedNames.length === 0) return []
  const names = priced.droppedNames.slice(0, 3).join(', ')
  const hidden = priced.droppedNames.length - 3
  const more = hidden > 0 ? (ctx.messages?.lang === 'tl' ? ` at ${hidden} pa` : ` and ${hidden} more`) : ''
  return [textMessage(say(ctx, priced.droppedNames.length === 1 ? 'cart.dropped_one' : 'cart.dropped_many', { items: `${names}${more}` }))]
}

/** The cart: one card per dish with − / + / Remove, then the total with Checkout. */
export function buildCart(ctx: ReplyContext, lead: OutgoingMessage[] = []): OutgoingMessage[] {
  if (!ctx.cart) return [...lead, ...buildCartUnreadable(ctx)]
  const { priced } = ctx.cart
  if (priced.lines.length === 0) {
    return [...lead, ...droppedNotice(ctx, priced), ...buildCategoriesOrMenu(ctx, say(ctx, 'cart.empty'))]
  }

  // 9 dishes + the total card = Meta's 10.
  const shown = priced.lines.slice(0, ITEMS_PER_PAGE)
  const hidden = priced.lines.length - shown.length
  const dishCards: CardElement[] = shown.map((line) => ({
    title: clip(say(ctx, 'cart.line_title', { qty: String(line.qty), item: line.item.name }), MESSENGER_LIMITS.cardTitle),
    subtitle: clip(say(ctx, 'cart.line_subtitle', {
      qty: String(line.qty), price: formatCentavos(line.unitCentavos), line_total: formatCentavos(line.lineCentavos),
    }), MESSENGER_LIMITS.cardSubtitle),
    imageUrl: line.item.imageUrl ?? ctx.store.logoUrl ?? undefined,
    buttons: [
      button(say(ctx, 'cart.minus'), { payload: encodePayload({ verb: 'dec', itemId: line.item.id }) }),
      button(say(ctx, 'cart.plus'), { payload: encodePayload({ verb: 'inc', itemId: line.item.id }) }),
      button(say(ctx, 'cart.remove'), { payload: encodePayload({ verb: 'rm', itemId: line.item.id }) }),
    ],
  }))
  const values = cartValues(priced)
  const moreText = hidden > 0 ? say(ctx, 'cart.total_more', { more: String(hidden) }) : say(ctx, 'cart.total_subtitle')
  const total: CardElement = {
    title: clip(say(ctx, 'cart.total_title', values), MESSENGER_LIMITS.cardTitle),
    subtitle: clip(moreText, MESSENGER_LIMITS.cardSubtitle),
    imageUrl: ctx.store.logoUrl ?? undefined,
    tapUrl: checkoutUrl(ctx),
    buttons: [
      button(say(ctx, 'cart.checkout'), { url: checkoutUrl(ctx) }),
      ...browseButtons(ctx),
      ...(shows(ctx, 'cart.show_empty_cart') ? [button(say(ctx, 'cart.empty_cart'), { payload: encodePayload({ verb: 'clear' }) })] : []),
    ],
  }
  const leadText = say(ctx, 'cart.lead', values)
  return [
    ...lead,
    ...droppedNotice(ctx, priced),
    ...(leadText ? [textMessage(leadText)] : []),
    { kind: 'cards', cards: [...dishCards, total] },
  ]
}

/** `words` are already filled. */
function buildCategoriesOrMenu(ctx: ReplyContext, words: string): OutgoingMessage[] {
  const text = words || ctx.store.name
  return ctx.store.categories.length > 0 ? categoriesMessage(ctx, text) : [textMessage(text), ...buildMenuCard(ctx)]
}

function buildCartUnreadable(ctx: ReplyContext): OutgoingMessage[] {
  return [textMessage(say(ctx, 'cart.unreadable')), ...buildMenuCard(ctx)]
}

/** The answer to a tap on Add to cart / − / + / Remove / Empty cart. */
export function buildCartChange(ctx: ReplyContext): OutgoingMessage[] {
  if (!ctx.cart) return buildCartUnreadable(ctx)
  const { priced, outcome, itemId } = ctx.cart
  const item = itemId ? ctx.store.items.find((entry) => entry.id === itemId) : undefined

  switch (outcome) {
    case 'added': {
      const line = priced.lines.find((entry) => entry.item.id === itemId)
      const name = line?.item.name ?? item?.name ?? 'That dish'
      const qty = line?.qty ?? 1
      const qtyNote = qty > 1 ? (ctx.messages?.lang === 'tl' ? ` (${qty} na sa cart)` : ` (${qty} in cart)`) : ''
      return [{
        kind: 'buttons',
        text: clip(say(ctx, 'cart.added', { item: name, qty: String(qty), qty_note: qtyNote, ...cartValues(priced) }), MESSENGER_LIMITS.buttonTemplateText),
        buttons: [
          button(say(ctx, 'cart.checkout'), { url: checkoutUrl(ctx) }),
          button(say(ctx, 'cart.view_cart'), { payload: encodePayload({ verb: 'cart' }) }),
          ...browseButtons(ctx),
        ],
      }]
    }
    case 'unavailable':
      return [textMessage(say(ctx, 'cart.unavailable')), ...buildCategoriesOrMenu(ctx, say(ctx, 'browse.categories_text'))]
    case 'cart_full':
      return buildCart(ctx, [textMessage(say(ctx, 'cart.full'))])
    case 'max_qty':
      return buildCart(ctx, [textMessage(say(ctx, 'cart.max_qty'))])
    case 'not_in_cart':
      return buildCart(ctx, [textMessage(say(ctx, 'cart.not_in_cart'))])
    case 'cleared':
      return buildCategoriesOrMenu(ctx, `${say(ctx, 'cart.cleared')} ${say(ctx, 'browse.categories_text')}`.trim())
    default:
      // increased / decreased / removed: show the cart as it is now.
      return buildCart(ctx)
  }
}

/** What a status message needs to know; less than a full reply context (no menu). */
export interface OrderUpdateContext {
  storeName: string
  messages?: MessageSettings
  customerName?: string
}

/** A status message's words: the owner's for this status, else the default for this kind of order. */
export function orderUpdateText(ctx: OrderUpdateContext, status: UpdateStatus, order: Pick<ReplyOrder, 'label' | 'kind'>): string {
  const id = UPDATE_MESSAGE_IDS[status]
  const values: FillValues = { store: ctx.storeName, order: order.label, name: ctx.customerName ?? '' }
  const custom = ctx.messages?.texts[id]
  return (custom ? fillTemplate(custom, values) : '') || fillTemplate(defaultText(id, ctx.messages?.lang, order.kind), values)
}

/** A status message: the owner's (or default) words, and the tracking link. */
export function buildOrderUpdate(ctx: OrderUpdateContext, status: UpdateStatus, order: ReplyOrder): OutgoingMessage[] {
  const text = orderUpdateText(ctx, status, order)
  if (!order.trackingUrl) return [textMessage(text)]
  const track = ctx.messages?.texts['orders.track'] || defaultText('orders.track', ctx.messages?.lang)
  return [{
    kind: 'buttons',
    text: clip(text, MESSENGER_LIMITS.buttonTemplateText),
    buttons: [button(track, { url: order.trackingUrl })],
  }]
}

/**
 * The context with sample cart and orders where none were read, for the
 * editor's preview and "Send test to me": the owner sees what a customer
 * with two dishes in their cart (or one order) would get.
 */
export function withPreviewData(ctx: ReplyContext): ReplyContext {
  const simple = ctx.store.items.filter((item) => !item.needsChoices).slice(0, 2)
  const lines = simple.map((item, index) => {
    const unit = Math.round((item.discountedPrice ?? item.price) * 100)
    return { item, qty: index + 1, unitCentavos: unit, lineCentavos: unit * (index + 1) }
  })
  const priced: PricedChatCart = {
    lines,
    droppedNames: [],
    kept: lines.map((line) => ({ itemId: line.item.id, qty: line.qty })),
    totalCentavos: lines.reduce((sum, line) => sum + line.lineCentavos, 0),
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
  }
  const sampleOrder: ReplyOrder = {
    id: 'sample', label: '#07', status: 'preparing', kind: 'pickup',
    totalCentavos: priced.totalCentavos || 44700, trackingUrl: `${ctx.store.baseUrl}/menu`,
  }
  return { ...ctx, cart: ctx.cart ?? { priced }, orders: ctx.orders === undefined ? [sampleOrder] : ctx.orders }
}

/** "Empty your cart?" — a tap on an old message must not empty it by accident. */
export function buildClearConfirm(ctx: ReplyContext): OutgoingMessage[] {
  return [{
    kind: 'buttons',
    text: clip(say(ctx, 'cart.clear_ask'), MESSENGER_LIMITS.buttonTemplateText),
    buttons: [
      button(say(ctx, 'cart.clear_yes'), { payload: encodePayload({ verb: 'clear_yes' }) }),
      button(say(ctx, 'cart.clear_no'), { payload: encodePayload({ verb: 'cart' }) }),
    ],
  }]
}

/** The messages a rule's action sends. */
export function buildReply(action: RuleAction, ctx: ReplyContext): OutgoingMessage[] {
  if (ctx.store.items.length === 0 && ['categories', 'category_items', 'featured_items'].includes(action.kind)) {
    return [textMessage(wording(ctx, undefined, 'browse.no_menu'))]
  }
  switch (action.kind) {
    case 'menu_card':
      return buildMenuCard(ctx, action)
    case 'categories':
      return buildCategories(ctx, action.text)
    case 'category_items':
      return buildCategoryItems(ctx, action.categoryId, 0, action.text)
    case 'featured_items':
      return buildFeaturedItems(ctx, action.itemIds, action.text)
    case 'text':
      return buildText(ctx, action.text, action.buttons)
    case 'hours_location':
      return buildHoursLocation(ctx, action.text)
    case 'talk_to_staff':
      return buildTalkToStaff(ctx, action.text)
    case 'order_status':
      return buildOrderStatus(ctx, action.text)
    case 'cart':
      return buildCart(ctx)
  }
}
