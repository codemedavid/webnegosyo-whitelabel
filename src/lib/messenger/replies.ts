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

/** Dishes per carousel page; the 10th card is "See more". */
export const ITEMS_PER_PAGE = MESSENGER_LIMITS.cardElements - 1
/** Quick replies left for categories after "Full menu". */
const CATEGORY_QUICK_REPLIES = MESSENGER_LIMITS.quickReplies - 1

export interface ReplyContext {
  store: ReplyStore
  /** Signed Messenger link token (`link-token.ts`); links carry it as `?m=`. */
  linkToken: string | null
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
    buttons: [
      button(item.needsChoices ? DEFAULT_WORDING.chooseOptions : DEFAULT_WORDING.order, { url }),
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

export function buildOrderStatus(ctx: ReplyContext, text?: string): OutgoingMessage[] {
  return [textMessage(wording(ctx, text, DEFAULT_WORDING.orderStatus), navigationQuickReplies(ctx))]
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
  }
}
