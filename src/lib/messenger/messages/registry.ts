/**
 * Every message the Messenger bot sends, in ONE list (plan 2026-11-11, A2).
 *
 * Builders in `replies.ts` read their words from here through `say()`; the
 * Studio's Messages tab edits the same entries. Stored per store in
 * `messenger_settings.messages` as a flat `id → string | boolean` object
 * (plus `lang`). Blank / missing = the default below, which is the exact
 * wording the bot sent before this registry existed
 * (`tests/unit/messenger/replies-golden.test.ts` pins it).
 *
 * Ids are stored in the database: never rename one.
 */

import { MESSENGER_LIMITS } from '../limits'
import { MAX_CART_LINES, MAX_LINE_QTY } from '../chat-cart'

export const MESSAGE_LANGS = ['en', 'tl'] as const
export type MessageLang = (typeof MESSAGE_LANGS)[number]

/** Where a message shows up in the customer's chat (the Studio groups by it). */
export const MESSAGE_MOMENTS = ['browsing', 'cart', 'after', 'handover'] as const
export type MessageMoment = (typeof MESSAGE_MOMENTS)[number]

export const MOMENT_LABELS: Record<MessageMoment, string> = {
  browsing: 'Browsing the menu',
  cart: 'Cart',
  after: 'After ordering',
  handover: 'Handover to staff',
}

/**
 * Words a message may contain, filled per message. `store`, `name`,
 * `menu_link`, `hours` and `address` are known in every reply; the rest only
 * where the builder hands them over.
 */
export const PLACEHOLDER_INFO = {
  store: { label: 'Store name', sample: 'Karamotan Grill' },
  name: { label: 'Customer first name', sample: 'Ana' },
  menu_link: { label: 'Menu link', sample: 'https://karamotan.webnegosyo.com/menu' },
  hours: { label: "Today's hours", sample: 'Open today 9:00 AM – 9:00 PM' },
  address: { label: 'Address', sample: 'Purok 3, Mintal, Davao City' },
  item: { label: 'Dish name', sample: 'Chicken Inasal' },
  qty: { label: 'How many of the dish', sample: '2' },
  qty_note: { label: '"(2 in cart)" when more than one', sample: ' (2 in cart)' },
  count: { label: 'Items in cart', sample: '3 items' },
  total: { label: 'Total', sample: '₱447' },
  price: { label: 'Price of one', sample: '₱149' },
  line_total: { label: 'Price × how many', sample: '₱298' },
  more: { label: 'How many more', sample: '11' },
  category: { label: 'Category name', sample: 'Rice Meals' },
  items: { label: 'Dish names', sample: 'Sisig, Halo-halo' },
  order: { label: 'Order number', sample: '#07' },
  status: { label: 'Order status', sample: 'Preparing' },
} as const

export type Placeholder = keyof typeof PLACEHOLDER_INFO
export const ALL_PLACEHOLDERS = Object.keys(PLACEHOLDER_INFO) as Placeholder[]

/** In every reply (the store and the customer). */
const BASE: readonly Placeholder[] = ['store', 'name']
const STORE_INFO: readonly Placeholder[] = ['store', 'name', 'menu_link', 'hours', 'address']

/** Text above a button template; kept under it so a placeholder rarely needs clipping. */
const TEXT_MAX = 600
const ORDER_UPDATE_MAX = 300

interface BaseEntry {
  id: string
  moment: MessageMoment
  label: string
  /** One line under the label in the Studio. */
  help?: string
}

export interface TextEntry extends BaseEntry {
  /** `text`: a message or card line. `button`: a button or quick-reply title. */
  kind: 'text' | 'button'
  max: number
  placeholders: readonly Placeholder[]
  /** May be left empty (nothing is sent). */
  optional?: boolean
  default: Record<MessageLang, string>
  /** Order kinds whose default differs (status messages). */
  byOrderKind?: Partial<Record<'pickup' | 'delivery', Record<MessageLang, string>>>
}

export interface ToggleEntry extends BaseEntry {
  kind: 'toggle'
  default: boolean
}

export type MessageEntry = TextEntry | ToggleEntry

const text = (
  id: string, moment: MessageMoment, label: string, max: number, placeholders: readonly Placeholder[],
  en: string, tl: string, extra: Partial<TextEntry> = {},
): TextEntry => ({ id, moment, label, kind: 'text', max, placeholders, default: { en, tl }, ...extra })

const btn = (id: string, moment: MessageMoment, label: string, en: string, tl: string, help?: string): TextEntry => ({
  id, moment, label, kind: 'button', max: MESSENGER_LIMITS.buttonTitle, placeholders: [], default: { en, tl }, ...(help ? { help } : {}),
})

const toggle = (id: string, moment: MessageMoment, label: string, help: string): ToggleEntry => ({
  id, moment, label, kind: 'toggle', default: true, help,
})

const CARD = MESSENGER_LIMITS.cardTitle

export const MESSAGES = [
  // ── Browsing ──────────────────────────────────────────────────────────────
  text('browse.menu_title', 'browsing', 'Menu card title', CARD, BASE, '📍 {store}', '📍 {store}'),
  text('browse.menu_subtitle', 'browsing', 'Menu card subtitle', MESSENGER_LIMITS.cardSubtitle, STORE_INFO,
    '👇 Tap below to view items and order now!', '👇 I-tap sa baba para makita ang menu at mag-order!'),
  btn('browse.menu_button', 'browsing', 'Menu card button', '🛒 View Items Now', '🛒 Tingnan ang Menu'),
  toggle('browse.show_categories_button', 'browsing', 'Categories button on the menu card', 'Shown when the store has more than one category.'),
  btn('browse.categories_button', 'browsing', 'Categories button', '📋 Categories', '📋 Mga Kategorya'),
  text('browse.categories_text', 'browsing', 'Pick a category', TEXT_MAX, STORE_INFO,
    'What are you craving? Pick a category 👇', 'Ano ang gusto mo ngayon? Pili ka ng category 👇'),
  text('browse.featured_text', 'browsing', 'Above favourite dishes', TEXT_MAX, STORE_INFO,
    'Here are some favourites 👇', 'Ito ang mga paborito ng customers namin 👇'),
  text('browse.more_title', 'browsing', 'Last card when a category has more', CARD, ['more', 'category'],
    '{more} more in {category}', '{more} pa sa {category}'),
  text('browse.more_subtitle', 'browsing', 'Under "more in …"', MESSENGER_LIMITS.cardSubtitle, [],
    'Tap to see the next ones', 'I-tap para makita ang iba pa'),
  btn('browse.see_more', 'browsing', 'See more button', 'See more', 'Tingnan pa'),
  btn('browse.full_menu', 'browsing', 'Full menu button', 'Full menu', 'Buong menu'),
  btn('browse.add_to_cart', 'browsing', 'Add to cart button', '🛒 Add to cart', '🛒 I-add sa cart'),
  btn('browse.view_item', 'browsing', 'View item button', 'View item', 'Tingnan'),
  toggle('browse.show_view_item', 'browsing', 'View item button on dish cards', 'Off: dish cards show Add to cart and Full menu only.'),
  btn('browse.choose_options', 'browsing', 'Dish with choices button', 'Choose options', 'Pumili ng options', 'For dishes with a required choice (size, flavour).'),
  toggle('browse.show_was_price', 'browsing', 'Show the old price on discounted dishes', '"₱89 (was ₱99)"'),
  text('browse.category_missing', 'browsing', 'Category no longer there', TEXT_MAX, STORE_INFO,
    "That category isn't available right now. Here's what we have:", 'Wala pa po ang category na yan ngayon. Ito ang meron kami:'),
  text('browse.no_menu', 'browsing', 'Menu not online', TEXT_MAX, STORE_INFO,
    "Our menu isn't online right now. Please message us what you'd like and we'll help you order.",
    'Wala pa pong online menu ngayon. I-message lang po kami kung ano ang gusto ninyo at tutulungan namin kayong mag-order.'),
  text('info.hours_location', 'browsing', 'Hours & location', TEXT_MAX, STORE_INFO, '📍 {address}\n🕒 {hours}', '📍 {address}\n🕒 {hours}',
    { help: 'A line whose details are blank (no address yet) is left out.' }),
  btn('info.directions', 'browsing', 'Directions button', 'Get directions', 'Paano pumunta'),

  // ── Cart ──────────────────────────────────────────────────────────────────
  text('cart.added', 'cart', 'After adding a dish', MESSENGER_LIMITS.buttonTemplateText, ['store', 'name', 'item', 'qty', 'qty_note', 'count', 'total'],
    '✅ Added {item}{qty_note}\n🛒 Your cart: {count} · {total}', '✅ Nadagdag ang {item}{qty_note}\n🛒 Cart mo: {count} · {total}'),
  text('cart.lead', 'cart', 'Above the cart', TEXT_MAX, ['store', 'name', 'count', 'total'], '', '',
    { optional: true, help: 'Optional. Sent just before the cart cards.' }),
  text('cart.line_title', 'cart', 'Dish in the cart', CARD, ['item', 'qty'], '{qty} × {item}', '{qty} × {item}'),
  text('cart.line_subtitle', 'cart', 'Under each dish', MESSENGER_LIMITS.cardSubtitle, ['price', 'line_total', 'qty'],
    '{price} each · {line_total}', '{price} bawat isa · {line_total}'),
  btn('cart.minus', 'cart', 'One less button', '➖', '➖'),
  btn('cart.plus', 'cart', 'One more button', '➕', '➕'),
  btn('cart.remove', 'cart', 'Remove button', 'Remove', 'Tanggalin'),
  text('cart.total_title', 'cart', 'Total card', CARD, ['total', 'count', 'store'], 'Total {total} · {count}', 'Total {total} · {count}'),
  text('cart.total_subtitle', 'cart', 'Under the total', MESSENGER_LIMITS.cardSubtitle, ['store'],
    'Prices are confirmed at checkout', 'Makikita ang final na presyo sa checkout'),
  text('cart.total_more', 'cart', 'Under the total, more than 9 dishes', MESSENGER_LIMITS.cardSubtitle, ['more'],
    '+{more} more on the checkout page', '+{more} pa sa checkout page'),
  btn('cart.checkout', 'cart', 'Checkout button', '✅ Checkout', '✅ Checkout'),
  btn('cart.view_cart', 'cart', 'View cart button', '🛒 View cart', '🛒 Tingnan ang cart'),
  btn('cart.keep_browsing', 'cart', 'Keep browsing button', 'Keep browsing', 'Mag-browse pa'),
  toggle('cart.show_keep_browsing', 'cart', 'Keep browsing button', 'On the added message and the total card.'),
  btn('cart.empty_cart', 'cart', 'Empty cart button', 'Empty cart', 'I-clear ang cart'),
  toggle('cart.show_empty_cart', 'cart', 'Empty cart button', 'On the total card. Customers can still use − and Remove.'),
  text('cart.empty', 'cart', 'Cart is empty', TEXT_MAX, STORE_INFO,
    'Your cart is empty. Pick a category to start 👇', 'Wala pang laman ang cart mo. Pili ka ng category para magsimula 👇'),
  text('cart.unreadable', 'cart', "Cart couldn't be opened", TEXT_MAX, STORE_INFO,
    "We couldn't open your cart just now. You can order from our online menu instead 👇",
    'Hindi namin mabuksan ang cart mo ngayon. Pwede kang mag-order sa online menu namin 👇'),
  text('cart.unavailable', 'cart', "Dish can't be ordered in the chat", TEXT_MAX, STORE_INFO,
    "Sorry, that dish can't be ordered from the chat right now.", 'Pasensya na, hindi pa ma-order sa chat ang dish na yan ngayon.'),
  text('cart.full', 'cart', 'Cart is full', TEXT_MAX, STORE_INFO,
    `Your cart already has ${MAX_CART_LINES} different dishes. Check out first, or remove one.`,
    `May ${MAX_CART_LINES} na klase ng dish na sa cart mo. Mag-checkout muna, o magtanggal ng isa.`),
  text('cart.max_qty', 'cart', 'Most of one dish', TEXT_MAX, STORE_INFO,
    `That's the most (${MAX_LINE_QTY}) we can take for one dish in the chat. For more, message us here.`,
    `${MAX_LINE_QTY} na ang pinakamarami para sa isang dish sa chat. Kung kailangan ng mas marami, i-message lang kami dito.`),
  text('cart.not_in_cart', 'cart', 'Dish no longer in the cart', TEXT_MAX, STORE_INFO,
    "That dish isn't in your cart any more. Here's your cart now:", 'Wala na sa cart mo ang dish na yan. Ito ang cart mo ngayon:'),
  text('cart.dropped_one', 'cart', 'One dish taken out (sold out)', TEXT_MAX, ['items', 'store', 'name'],
    "{items} can't be ordered right now, so we took it out of your cart.", 'Hindi ma-order ngayon ang {items}, kaya tinanggal namin sa cart mo.'),
  text('cart.dropped_many', 'cart', 'Dishes taken out (sold out)', TEXT_MAX, ['items', 'store', 'name'],
    "{items} can't be ordered right now, so we took them out of your cart.", 'Hindi ma-order ngayon ang {items}, kaya tinanggal namin sa cart mo.'),
  text('cart.clear_ask', 'cart', 'Empty the cart?', MESSENGER_LIMITS.buttonTemplateText, BASE, 'Empty your cart?', 'I-clear ang cart mo?'),
  btn('cart.clear_yes', 'cart', 'Yes button', 'Yes, empty it', 'Oo, i-clear'),
  btn('cart.clear_no', 'cart', 'No button', 'Keep it', 'Huwag na'),
  text('cart.cleared', 'cart', 'Cart emptied', TEXT_MAX, BASE, 'Your cart is empty now.', 'Wala nang laman ang cart mo.',
    { help: 'Followed by the "Pick a category" message.' }),

  // ── After ordering ────────────────────────────────────────────────────────
  text('orders.intro', 'after', 'Above recent orders', TEXT_MAX, STORE_INFO, 'Your recent orders 👇', 'Ang mga order mo 👇'),
  text('orders.card_title', 'after', 'Order card', CARD, ['order', 'status', 'store'], 'Order {order} · {status}', 'Order {order} · {status}'),
  text('orders.card_subtitle', 'after', 'Under the order card', MESSENGER_LIMITS.cardSubtitle, ['total', 'store'], '{total} · {store}', '{total} · {store}'),
  btn('orders.track', 'after', 'Track order button', 'Track order', 'I-track ang order'),
  text('orders.none', 'after', 'No recent order found', TEXT_MAX, STORE_INFO,
    "We couldn't find a recent order from this chat. If you ordered online, open the tracking link on your receipt, or send us your order number.",
    'Wala kaming nakitang order mula sa chat na ito. Kung nag-order ka online, buksan ang tracking link sa resibo mo, o i-send sa amin ang order number mo.'),
  text('orders.status_text', 'after', 'Where is my order (no order list)', TEXT_MAX, STORE_INFO,
    "To check your order, open the tracking link on your receipt. You can also send us your order number and we'll check for you.",
    'Para ma-check ang order mo, buksan ang tracking link sa resibo mo. Pwede mo ring i-send ang order number mo at kami ang titingin.',
    { help: "Stores whose orders aren't on SmartMenu's order system." }),
  text('orders.update.confirmed', 'after', 'Order confirmed', ORDER_UPDATE_MAX, ['store', 'order', 'name'],
    '✅ {store} confirmed your order {order}.', '✅ Na-confirm na ng {store} ang order mo {order}.'),
  text('orders.update.preparing', 'after', 'Preparing', ORDER_UPDATE_MAX, ['store', 'order', 'name'],
    '👨‍🍳 {store} is now preparing your order {order}.', '👨‍🍳 Inihahanda na ng {store} ang order mo {order}.'),
  text('orders.update.ready', 'after', 'Ready', ORDER_UPDATE_MAX, ['store', 'order', 'name'],
    '🍽️ Your order {order} is ready!', '🍽️ Ready na ang order mo {order}!', {
      help: 'Blank: different words for pickup and delivery.',
      byOrderKind: {
        pickup: { en: '🛍️ Your order {order} is ready for pickup at {store}!', tl: '🛍️ Ready na for pickup ang order mo {order} sa {store}!' },
        delivery: { en: '🛵 Your order {order} is ready and will be on its way soon.', tl: '🛵 Ready na ang order mo {order} at ide-deliver na soon.' },
      },
    }),
  text('orders.update.delivered', 'after', 'Completed', ORDER_UPDATE_MAX, ['store', 'order', 'name'],
    '🙏 Thank you for ordering from {store}! Enjoy your meal.', '🙏 Salamat sa pag-order sa {store}! Enjoy sa pagkain.', {
      help: 'Blank: different words for delivery.',
      byOrderKind: {
        delivery: {
          en: '📦 Your order {order} was delivered. Enjoy, and thank you for ordering from {store}! 🙏',
          tl: '📦 Na-deliver na ang order mo {order}. Enjoy, at salamat sa pag-order sa {store}! 🙏',
        },
      },
    }),
  text('orders.update.cancelled', 'after', 'Cancelled', ORDER_UPDATE_MAX, ['store', 'order', 'name'],
    '❌ Your order {order} was cancelled. Please message us here if you have questions.',
    '❌ Na-cancel ang order mo {order}. I-message lang kami dito kung may tanong ka.'),

  // ── Handover ──────────────────────────────────────────────────────────────
  text('handover.staff_reply', 'handover', 'Customer asked for a person', TEXT_MAX, STORE_INFO,
    'Got it! Someone from {store} will reply here soon. 🙏', 'Sige po! May sasagot sa inyo mula sa {store} dito maya-maya. 🙏'),
] as const satisfies readonly MessageEntry[]

type Entries = (typeof MESSAGES)[number]
export type MessageId = Entries['id']
export type TextMessageId = Extract<Entries, { kind: 'text' | 'button' }>['id']
export type ToggleId = Extract<Entries, { kind: 'toggle' }>['id']

export const MESSAGE_BY_ID: ReadonlyMap<string, MessageEntry> = new Map(MESSAGES.map((entry) => [entry.id, entry as MessageEntry]))

export function textEntry(id: TextMessageId): TextEntry {
  return MESSAGE_BY_ID.get(id) as TextEntry
}

export type OrderKindForMessages = 'delivery' | 'pickup' | 'dine_in' | null

/** The built-in words for a message, in a language (and for an order kind). */
export function defaultText(id: TextMessageId, lang: MessageLang = 'en', kind: OrderKindForMessages = null): string {
  const entry = textEntry(id)
  const variant = kind === 'pickup' || kind === 'delivery' ? entry.byOrderKind?.[kind] : undefined
  return (variant ?? entry.default)[lang]
}

/** A store's choices, parsed. Missing = default. */
export interface MessageSettings {
  lang: MessageLang
  texts: Partial<Record<TextMessageId, string>>
  toggles: Partial<Record<ToggleId, boolean>>
}

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = Object.freeze({ lang: 'en', texts: {}, toggles: {} }) as MessageSettings

export function isToggleOn(settings: MessageSettings | undefined, id: ToggleId): boolean {
  const value = settings?.toggles[id]
  return typeof value === 'boolean' ? value : (MESSAGE_BY_ID.get(id) as ToggleEntry).default
}

export const UPDATE_MESSAGE_IDS = {
  confirmed: 'orders.update.confirmed',
  preparing: 'orders.update.preparing',
  ready: 'orders.update.ready',
  delivered: 'orders.update.delivered',
  cancelled: 'orders.update.cancelled',
} as const satisfies Record<string, TextMessageId>
