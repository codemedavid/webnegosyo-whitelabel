/**
 * Every action over awkward menus stays inside Meta's limits. A message over a
 * limit is refused whole by the Send API, so the customer would get nothing.
 */
import { buildCartChange, buildCategoryItems, buildClearConfirm, buildOrderUpdate, buildReply, withPreviewData } from '@/lib/messenger/replies'
import { applyCartOp, priceChatCart, type ChatCartLine } from '@/lib/messenger/chat-cart'
import type { ReplyOrder } from '@/lib/messenger/order-view'
import { charLength, MESSENGER_LIMITS as L } from '@/lib/messenger/limits'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { ACTION_KINDS, type RuleAction } from '@/lib/messenger/rules'
import { category, dish, sampleContext as plainContext, sampleStore } from './sample-store'
import { DEFAULT_MESSAGE_SETTINGS, MESSAGES, type MessageSettings, type TextEntry } from '@/lib/messenger/messages/registry'

const LONG = '🍗 Extra-Large Family Bucket of Our Famous Garlic Butter Chicken Wings with Java Rice and Gravy '.repeat(3)

const awkward = sampleStore({
  tenant: { name: `${LONG} Restaurant`, restaurant_address: LONG },
  categories: Array.from({ length: 30 }, (_, index) => category(`c${index}`, `${LONG} ${index}`, index)),
  items: Array.from({ length: 30 * 15 }, (_, index) =>
    dish(`d${index}`, `c${index % 30}`, index, { name: `${LONG}${index}`, description: LONG, price: 123456.75, discounted_price: 99999.5 })),
})

const ACTIONS: Record<(typeof ACTION_KINDS)[number], RuleAction> = {
  menu_card: { kind: 'menu_card', title: 'x'.repeat(80), subtitle: 'y'.repeat(80), buttonLabel: 'z'.repeat(20) },
  categories: { kind: 'categories', text: 'Pick one {store}' },
  category_items: { kind: 'category_items', categoryId: 'c0', text: '{store} {menu_link}' },
  featured_items: { kind: 'featured_items', itemIds: [] },
  text: { kind: 'text', text: `${'w'.repeat(590)} {store}`, buttons: [{ kind: 'menu', label: 'Menu' }, { kind: 'categories', label: 'Cats' }, { kind: 'staff', label: 'Staff' }] },
  hours_location: { kind: 'hours_location' },
  talk_to_staff: { kind: 'talk_to_staff', text: '{store} '.repeat(60) },
  order_status: { kind: 'order_status' },
  cart: { kind: 'cart' },
}

/** Every message at its longest, using every placeholder it may, every optional button hidden. */
function maxedWording(): MessageSettings {
  const texts: Record<string, string> = {}
  const toggles: Record<string, boolean> = {}
  for (const entry of MESSAGES as readonly (TextEntry | { kind: 'toggle'; id: string })[]) {
    if (entry.kind === 'toggle') {
      toggles[entry.id] = false
      continue
    }
    const tokens = entry.placeholders.map((key) => `{${key}}`).join(' ')
    texts[entry.id] = `${tokens}${'🍗'.repeat(Math.max(0, entry.max - charLength(tokens)))}`
  }
  return { lang: 'en', texts, toggles } as MessageSettings
}

const WORDINGS: Array<[string, MessageSettings]> = [
  ['default wording', DEFAULT_MESSAGE_SETTINGS],
  ['Taglish', { ...DEFAULT_MESSAGE_SETTINGS, lang: 'tl' }],
  ['the longest wording', maxedWording()],
]

function problems(message: OutgoingMessage): string[] {
  const found: string[] = []
  const check = (ok: boolean, what: string) => { if (!ok) found.push(what) }
  const buttons = message.kind === 'buttons' ? message.buttons : message.kind === 'cards' ? message.cards.flatMap((card) => card.buttons) : []
  for (const button of buttons) {
    check(charLength(button.title) <= L.buttonTitle, `button title ${button.title}`)
    if (button.type === 'postback') check(button.payload.length <= L.payload, 'postback payload')
    if (button.type === 'web_url') check(button.url.startsWith('https://'), 'https button url')
  }
  for (const reply of message.quickReplies ?? []) {
    check(charLength(reply.title) <= L.quickReplyTitle, `quick reply ${reply.title}`)
    check(reply.payload.length <= L.payload, 'quick reply payload')
  }
  check((message.quickReplies?.length ?? 0) <= L.quickReplies, 'quick reply count')
  if (message.kind === 'text') check(charLength(message.text) <= L.text && message.text.length > 0, 'text length')
  if (message.kind === 'buttons') {
    check(charLength(message.text) <= L.buttonTemplateText && message.text.length > 0, 'button template text')
    check(message.buttons.length >= 1 && message.buttons.length <= L.cardButtons, 'button count')
  }
  if (message.kind === 'cards') {
    check(message.cards.length >= 1 && message.cards.length <= L.cardElements, 'card count')
    for (const card of message.cards) {
      check(charLength(card.title) <= L.cardTitle && card.title.length > 0, 'card title')
      check(!card.subtitle || charLength(card.subtitle) <= L.cardSubtitle, 'card subtitle')
      check(card.buttons.length <= L.cardButtons, 'card buttons')
      check(!card.imageUrl || card.imageUrl.startsWith('https://'), 'card image')
    }
  }
  return found
}

describe.each(WORDINGS)('every reply fits Meta\'s limits (%s)', (_name, messages) => {
  const sampleContext: typeof plainContext = (...args) => ({ ...plainContext(...args), messages })

  for (const store of [awkward, sampleStore(), sampleStore({ items: [] })]) {
    for (const kind of ACTION_KINDS) {
      it(`${kind} on a ${store.items.length}-dish store`, () => {
        for (const message of buildReply(ACTIONS[kind], withPreviewData(sampleContext(store, 'mt1.1.' + 'a'.repeat(80))))) {
          expect(problems(message)).toEqual([])
        }
      })
    }
  }

  it('a full chat cart (20 long dishes) and every tap on it', () => {
    const cart: ChatCartLine[] = awkward.items.slice(0, 20).map((item) => ({ itemId: item.id, qty: 50 }))
    const base = { ...sampleContext(awkward, 'mt1.1.' + 'a'.repeat(80)) }
    for (const outcome of ['added', 'increased', 'removed', 'cleared', 'unavailable', 'cart_full', 'max_qty', 'not_in_cart'] as const) {
      const ctx = { ...base, cart: { priced: priceChatCart(cart, awkward), outcome, itemId: awkward.items[0].id } }
      for (const message of buildCartChange(ctx)) expect(problems(message)).toEqual([])
    }
    const applied = applyCartOp(cart, { kind: 'add', itemId: awkward.items[25].id }, awkward)
    expect(applied.outcome).toBe('cart_full')
    for (const message of buildClearConfirm(base)) expect(problems(message)).toEqual([])
  })

  it('orders and status messages', () => {
    const orders: ReplyOrder[] = Array.from({ length: 3 }, (_, index) => ({
      id: `o${index}`, label: '#07', status: 'ready', kind: 'delivery', totalCentavos: 99999999, trackingUrl: `https://karamotan.webnegosyo.com/order/o${index}?t=${'a'.repeat(20)}`,
    }))
    for (const message of buildReply({ kind: 'order_status', text: '{store} '.repeat(60) }, { ...sampleContext(awkward), orders })) {
      expect(problems(message)).toEqual([])
    }
    const longest: MessageSettings = { ...messages, texts: { ...messages.texts, 'orders.update.ready': 'x'.repeat(2000) } }
    for (const update of [messages, longest]) {
      for (const message of buildOrderUpdate({ storeName: awkward.name, messages: update, customerName: 'Ana' }, 'ready', orders[0])) {
        expect(problems(message)).toEqual([])
      }
    }
  })

  it('every page of a long category', () => {
    for (let page = 0; page < 3; page += 1) {
      for (const message of buildCategoryItems(sampleContext(awkward), 'c1', page)) expect(problems(message)).toEqual([])
    }
  })
})
