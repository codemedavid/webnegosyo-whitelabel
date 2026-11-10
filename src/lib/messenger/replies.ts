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
import { MAX_CART_LINES, MAX_LINE_QTY, type CartOpOutcome, type PricedChatCart } from './chat-cart'
import { statusLabel, type ReplyOrder } from './order-view'

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
}

export const DEFAULT_WORDING = {
  menuCardSubtitle: '👇 Tap below to view items and order now!',
  menuCardButton: '🛒 View Items Now',
  categoriesButton: '📋 Categories',
  categoriesText: 'What are you craving? Pick a category 👇',
  featuredText: 'Here are some favourites 👇',
  categoryMissing: "That category isn't available right now. Here's what we have:",
  orderStatus: "To check your order, open the tracking link on your receipt. You can also send us your order number and we'll check for you.",
  talkToStaff: 'Got it! Someone from {store} will reply here soon. 🙏',
  hoursLocation: '📍 {address}\n🕒 {hours}',
  noMenu: "Our menu isn't online right now. Please message us what you'd like and we'll help you order.",
  seeMore: 'See more',
  fullMenu: 'Full menu',
  order: 'Order',
  chooseOptions: 'Choose options',
  directions: 'Get directions',
  addToCart: '🛒 Add to cart',
  viewItem: 'View item',
  viewCart: '🛒 View cart',
  checkout: '✅ Checkout',
  keepBrowsing: 'Keep browsing',
  emptyCart: 'Empty cart',
  cartEmpty: 'Your cart is empty. Pick a category to start 👇',
  cartUnreadable: "We couldn't open your cart just now. You can order from our online menu instead 👇",
  cartUnavailable: "Sorry, that dish can't be ordered from the chat right now.",
  cartFull: `Your cart already has ${MAX_CART_LINES} different dishes. Check out first, or remove one.`,
  maxQty: `That's the most (${MAX_LINE_QTY}) we can take for one dish in the chat. For more, message us here.`,
  notInCart: "That dish isn't in your cart any more. Here's your cart now:",
  clearAsk: 'Empty your cart?',
  clearYes: 'Yes, empty it',
  clearNo: 'Keep it',
  cleared: 'Your cart is empty now.',
  trackOrder: 'Track order',
  noOrders: "We couldn't find a recent order from this chat. If you ordered online, open the tracking link on your receipt, or send us your order number.",
  ordersIntro: 'Your recent orders 👇',
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

export const PLACEHOLDERS = ['store', 'menu_link', 'hours', 'address'] as const
const PLACEHOLDER_PATTERN = /\{(store|menu_link|hours|address)\}/g

/**
 * `{store}`, `{menu_link}`, `{hours}`, `{address}`. A line whose placeholders
 * all came out blank (a store with no address) is dropped, so "📍 " never
 * goes out alone.
 */
export function fillPlaceholders(text: string, ctx: ReplyContext): string {
  const values: Record<string, string> = {
    store: ctx.store.name,
    menu_link: menuUrl(ctx),
    hours: ctx.store.hoursText ?? '',
    address: ctx.store.address ?? '',
  }
  return text
    .split('\n')
    .filter((line) => {
      const keys = [...line.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1])
      return keys.length === 0 || keys.some((key) => values[key] !== '')
    })
    .map((line) => line.replace(PLACEHOLDER_PATTERN, (_, key: string) => values[key] ?? ''))
    .join('\n')
    .trim()
}

/**
 * The owner's wording with placeholders filled, else the default. Never empty:
 * Meta refuses an empty message, and the customer would get nothing.
 */
function wording(ctx: ReplyContext, custom: string | undefined, fallback: string): string {
  return (custom ? fillPlaceholders(custom, ctx) : '') || fillPlaceholders(fallback, ctx) || ctx.store.name
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
  if (ctx.store.categories.length > 0) replies.push(quickReply(DEFAULT_WORDING.categoriesButton, encodePayload({ verb: 'categories' })))
  replies.push(quickReply(DEFAULT_WORDING.fullMenu, encodePayload({ verb: 'menu' })))
  return replies
}

export function formatPeso(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const text = Number.isInteger(rounded) ? rounded.toLocaleString('en-PH') : rounded.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `₱${text}`
}

function priceLine(item: ReplyItem): string {
  return item.discountedPrice !== null
    ? `${formatPeso(item.discountedPrice)} (was ${formatPeso(item.price)})`
    : formatPeso(item.price)
}

function itemCard(ctx: ReplyContext, item: ReplyItem): CardElement {
  const url = itemUrl(ctx, item.id)
  const subtitle = [priceLine(item), item.description].filter(Boolean).join(' · ')
  return {
    title: clip(item.name, MESSENGER_LIMITS.cardTitle),
    subtitle: clip(subtitle, MESSENGER_LIMITS.cardSubtitle),
    imageUrl: item.imageUrl ?? ctx.store.logoUrl ?? undefined,
    tapUrl: url,
    buttons: item.needsChoices
      ? [button(DEFAULT_WORDING.chooseOptions, { url }), button(DEFAULT_WORDING.fullMenu, { url: menuUrl(ctx) })]
      : [
          button(DEFAULT_WORDING.addToCart, { payload: encodePayload({ verb: 'add', itemId: item.id }) }),
          button(DEFAULT_WORDING.viewItem, { url }),
          button(DEFAULT_WORDING.fullMenu, { url: menuUrl(ctx) }),
        ],
  }
}

function textMessage(text: string, quickReplies?: QuickReply[]): OutgoingMessage {
  return { kind: 'text', text: clip(text, MESSENGER_LIMITS.text), ...(quickReplies && quickReplies.length > 0 ? { quickReplies } : {}) }
}

export function buildMenuCard(ctx: ReplyContext, action: Extract<RuleAction, { kind: 'menu_card' }> = { kind: 'menu_card' }): OutgoingMessage[] {
  const url = menuUrl(ctx)
  const buttons: MessengerButton[] = [button(action.buttonLabel || DEFAULT_WORDING.menuCardButton, { url })]
  if (action.showCategoriesButton !== false && ctx.store.categories.length > 1) {
    buttons.push(button(DEFAULT_WORDING.categoriesButton, { payload: encodePayload({ verb: 'categories' }) }))
  }
  return [{
    kind: 'cards',
    cards: [{
      title: clip(wording(ctx, action.title, `📍 ${ctx.store.name}`), MESSENGER_LIMITS.cardTitle),
      subtitle: clip(wording(ctx, action.subtitle, DEFAULT_WORDING.menuCardSubtitle), MESSENGER_LIMITS.cardSubtitle),
      imageUrl: ctx.store.logoUrl ?? undefined,
      tapUrl: url,
      buttons,
    }],
  }]
}

export function buildCategories(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  if (ctx.store.categories.length === 0) return buildMenuCard(ctx)
  const replies = ctx.store.categories
    .slice(0, CATEGORY_QUICK_REPLIES)
    .map((category) => quickReply(category.name, encodePayload({ verb: 'category', categoryId: category.id, page: 0 })))
  replies.push(quickReply(DEFAULT_WORDING.fullMenu, encodePayload({ verb: 'menu' })))
  return [textMessage(wording(ctx, text, DEFAULT_WORDING.categoriesText), replies)]
}

function carousel(ctx: ReplyContext, items: readonly ReplyItem[], more: CardElement | null): OutgoingMessage {
  const cards = items.slice(0, ITEMS_PER_PAGE).map((item) => itemCard(ctx, item))
  return { kind: 'cards', cards: more ? [...cards, more] : cards, quickReplies: navigationQuickReplies(ctx) }
}

export function buildCategoryItems(ctx: ReplyContext, categoryId: string, page = 0, text?: string): OutgoingMessage[] {
  const category = ctx.store.categories.find((entry) => entry.id === categoryId)
  if (!category) return [textMessage(DEFAULT_WORDING.categoryMissing), ...buildCategories(ctx).slice(0, 1)]

  const all = ctx.store.items.filter((item) => item.categoryId === categoryId)
  const lastPage = Math.max(0, Math.ceil(all.length / ITEMS_PER_PAGE) - 1)
  const safePage = Math.min(Math.max(0, page), lastPage)
  const start = safePage * ITEMS_PER_PAGE
  const pageItems = all.slice(start, start + ITEMS_PER_PAGE)
  const remaining = all.length - (start + pageItems.length)

  const more: CardElement | null = remaining > 0
    ? {
        title: clip(`${remaining} more in ${category.name}`, MESSENGER_LIMITS.cardTitle),
        subtitle: clip('Tap to see the next ones', MESSENGER_LIMITS.cardSubtitle),
        buttons: [
          button(DEFAULT_WORDING.seeMore, { payload: encodePayload({ verb: 'category', categoryId, page: safePage + 1 }) }),
          button(DEFAULT_WORDING.fullMenu, { url: menuUrl(ctx) }),
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
  return [textMessage(wording(ctx, text, DEFAULT_WORDING.featuredText)), carousel(ctx, items, null)]
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
  const filled = wording(ctx, text, ctx.store.name)
  if (buttons.length === 0) return [textMessage(filled)]
  return [{
    kind: 'buttons',
    text: clip(filled, MESSENGER_LIMITS.buttonTemplateText),
    buttons: buttons.slice(0, MESSENGER_LIMITS.cardButtons).map((entry) => textButton(ctx, entry)),
  }]
}

export function buildHoursLocation(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  const body = wording(ctx, text, DEFAULT_WORDING.hoursLocation)
  const buttons: MessengerButton[] = []
  if (ctx.store.address) buttons.push(button(DEFAULT_WORDING.directions, { url: mapsUrl(ctx.store.address) }))
  buttons.push(button(DEFAULT_WORDING.fullMenu, { url: menuUrl(ctx) }))
  return [{ kind: 'buttons', text: clip(body, MESSENGER_LIMITS.buttonTemplateText), buttons }]
}

export function buildTalkToStaff(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  return [textMessage(wording(ctx, text, DEFAULT_WORDING.talkToStaff))]
}

function orderCard(ctx: ReplyContext, order: ReplyOrder): CardElement {
  return {
    title: clip(`Order ${order.label} · ${statusLabel(order.status, order.kind)}`, MESSENGER_LIMITS.cardTitle),
    subtitle: clip(`${formatCentavos(order.totalCentavos)} · ${ctx.store.name}`, MESSENGER_LIMITS.cardSubtitle),
    ...(order.trackingUrl ? { tapUrl: order.trackingUrl } : {}),
    buttons: order.trackingUrl ? [button(DEFAULT_WORDING.trackOrder, { url: order.trackingUrl })] : [],
  }
}

/**
 * This customer's recent orders, each with its tracking link. A store whose
 * orders aren't on the platform database (or a chat with no session) gets
 * the owner's text / the tracking-link explanation, as before.
 */
export function buildOrderStatus(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  if (!ctx.orders) return [textMessage(wording(ctx, text, DEFAULT_WORDING.orderStatus), navigationQuickReplies(ctx))]
  if (ctx.orders.length === 0) return [textMessage(wording(ctx, undefined, DEFAULT_WORDING.noOrders), navigationQuickReplies(ctx))]
  const intro = text ? fillPlaceholders(text, ctx) : DEFAULT_WORDING.ordersIntro
  return [
    textMessage(intro || DEFAULT_WORDING.ordersIntro),
    { kind: 'cards', cards: ctx.orders.slice(0, ITEMS_PER_PAGE).map((order) => orderCard(ctx, order)), quickReplies: navigationQuickReplies(ctx) },
  ]
}

// ── Chat cart ───────────────────────────────────────────────────────────────

export function formatCentavos(centavos: number): string {
  return formatPeso(centavos / 100)
}

function cartSummaryLine(priced: PricedChatCart): string {
  return `${priced.itemCount} item${priced.itemCount === 1 ? '' : 's'} · ${formatCentavos(priced.totalCentavos)}`
}

function browseButton(ctx: ReplyContext): MessengerButton {
  return ctx.store.categories.length > 0
    ? button(DEFAULT_WORDING.keepBrowsing, { payload: encodePayload({ verb: 'categories' }) })
    : button(DEFAULT_WORDING.keepBrowsing, { url: menuUrl(ctx) })
}

function droppedNotice(priced: PricedChatCart): OutgoingMessage[] {
  if (priced.droppedNames.length === 0) return []
  const names = priced.droppedNames.slice(0, 3).join(', ')
  const more = priced.droppedNames.length > 3 ? ` and ${priced.droppedNames.length - 3} more` : ''
  return [textMessage(`${names}${more} can't be ordered right now, so we took ${priced.droppedNames.length === 1 ? 'it' : 'them'} out of your cart.`)]
}

/** The cart: one card per dish with − / + / Remove, then the total with Checkout. */
export function buildCart(ctx: ReplyContext, lead: OutgoingMessage[] = []): OutgoingMessage[] {
  if (!ctx.cart) return [...lead, ...buildCartUnreadable(ctx)]
  const { priced } = ctx.cart
  if (priced.lines.length === 0) {
    return [...lead, ...droppedNotice(priced), ...buildCategoriesOrMenu(ctx, DEFAULT_WORDING.cartEmpty)]
  }

  // 9 dishes + the total card = Meta's 10.
  const shown = priced.lines.slice(0, ITEMS_PER_PAGE)
  const hidden = priced.lines.length - shown.length
  const dishCards: CardElement[] = shown.map((line) => ({
    title: clip(`${line.qty} × ${line.item.name}`, MESSENGER_LIMITS.cardTitle),
    subtitle: clip(`${formatCentavos(line.unitCentavos)} each · ${formatCentavos(line.lineCentavos)}`, MESSENGER_LIMITS.cardSubtitle),
    imageUrl: line.item.imageUrl ?? ctx.store.logoUrl ?? undefined,
    buttons: [
      button('➖', { payload: encodePayload({ verb: 'dec', itemId: line.item.id }) }),
      button('➕', { payload: encodePayload({ verb: 'inc', itemId: line.item.id }) }),
      button('Remove', { payload: encodePayload({ verb: 'rm', itemId: line.item.id }) }),
    ],
  }))
  const moreText = hidden > 0 ? `+${hidden} more on the checkout page` : 'Prices are confirmed at checkout'
  const total: CardElement = {
    title: clip(`Total ${formatCentavos(priced.totalCentavos)} · ${priced.itemCount} item${priced.itemCount === 1 ? '' : 's'}`, MESSENGER_LIMITS.cardTitle),
    subtitle: clip(moreText, MESSENGER_LIMITS.cardSubtitle),
    imageUrl: ctx.store.logoUrl ?? undefined,
    tapUrl: checkoutUrl(ctx),
    buttons: [
      button(DEFAULT_WORDING.checkout, { url: checkoutUrl(ctx) }),
      browseButton(ctx),
      button(DEFAULT_WORDING.emptyCart, { payload: encodePayload({ verb: 'clear' }) }),
    ],
  }
  return [...lead, ...droppedNotice(priced), { kind: 'cards', cards: [...dishCards, total] }]
}

function buildCategoriesOrMenu(ctx: ReplyContext, text: string): OutgoingMessage[] {
  return ctx.store.categories.length > 0 ? buildCategories(ctx, text) : [textMessage(text), ...buildMenuCard(ctx)]
}

function buildCartUnreadable(ctx: ReplyContext): OutgoingMessage[] {
  return [textMessage(DEFAULT_WORDING.cartUnreadable), ...buildMenuCard(ctx)]
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
      return [{
        kind: 'buttons',
        text: clip(`✅ Added ${name}${line && line.qty > 1 ? ` (${line.qty} in cart)` : ''}\n🛒 Your cart: ${cartSummaryLine(priced)}`, MESSENGER_LIMITS.buttonTemplateText),
        buttons: [
          button(DEFAULT_WORDING.checkout, { url: checkoutUrl(ctx) }),
          button(DEFAULT_WORDING.viewCart, { payload: encodePayload({ verb: 'cart' }) }),
          browseButton(ctx),
        ],
      }]
    }
    case 'unavailable':
      return [textMessage(DEFAULT_WORDING.cartUnavailable), ...buildCategoriesOrMenu(ctx, DEFAULT_WORDING.categoriesText)]
    case 'cart_full':
      return buildCart(ctx, [textMessage(DEFAULT_WORDING.cartFull)])
    case 'max_qty':
      return buildCart(ctx, [textMessage(DEFAULT_WORDING.maxQty)])
    case 'not_in_cart':
      return buildCart(ctx, [textMessage(DEFAULT_WORDING.notInCart)])
    case 'cleared':
      return buildCategoriesOrMenu(ctx, `${DEFAULT_WORDING.cleared} ${DEFAULT_WORDING.categoriesText}`)
    default:
      // increased / decreased / removed: show the cart as it is now.
      return buildCart(ctx)
  }
}

/** A status message: the owner's (or default) words, and the tracking link. */
export function buildOrderUpdate(text: string, order: ReplyOrder): OutgoingMessage[] {
  if (!order.trackingUrl) return [textMessage(text)]
  return [{
    kind: 'buttons',
    text: clip(text, MESSENGER_LIMITS.buttonTemplateText),
    buttons: [button(DEFAULT_WORDING.trackOrder, { url: order.trackingUrl })],
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
export function buildClearConfirm(): OutgoingMessage[] {
  return [{
    kind: 'buttons',
    text: DEFAULT_WORDING.clearAsk,
    buttons: [
      button(DEFAULT_WORDING.clearYes, { payload: encodePayload({ verb: 'clear_yes' }) }),
      button(DEFAULT_WORDING.clearNo, { payload: encodePayload({ verb: 'cart' }) }),
    ],
  }]
}

/** The messages a rule's action sends. */
export function buildReply(action: RuleAction, ctx: ReplyContext): OutgoingMessage[] {
  if (ctx.store.items.length === 0 && ['categories', 'category_items', 'featured_items'].includes(action.kind)) {
    return [textMessage(wording(ctx, undefined, DEFAULT_WORDING.noMenu))]
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
