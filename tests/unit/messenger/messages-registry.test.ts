/**
 * The message registry: every entry's defaults are sendable, stored wording is
 * checked on save and on read, and a store's words reach the replies.
 */
import { charLength } from '@/lib/messenger/limits'
import {
  defaultText,
  MESSAGE_BY_ID,
  MESSAGE_LANGS,
  MESSAGES,
  type MessageEntry,
  type TextEntry,
} from '@/lib/messenger/messages/registry'
import { fillTemplate, greetingName, placeholdersIn } from '@/lib/messenger/messages/fill'
import { parseMessagesForSave, readMessages, textProblem } from '@/lib/messenger/messages/stored'
import { buildCart, buildCartChange, buildMenuCard, buildReply, type ReplyContext } from '@/lib/messenger/replies'
import { priceChatCart } from '@/lib/messenger/chat-cart'
import { category, dish, sampleContext, sampleStore } from './sample-store'

const entries = MESSAGES as readonly MessageEntry[]
const textEntries = entries.filter((entry): entry is TextEntry => entry.kind !== 'toggle')

describe('registry contract', () => {
  it('ids are unique and dotted', () => {
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
    for (const entry of entries) expect(entry.id).toMatch(/^[a-z]+(\.[a-z_]+)+$/)
  })

  it.each(textEntries.map((entry) => [entry.id, entry] as const))('%s: every default fits and uses only its placeholders', (_id, entry) => {
    const variants = [entry.default, ...Object.values(entry.byOrderKind ?? {})]
    for (const variant of variants) {
      for (const lang of MESSAGE_LANGS) {
        const words = variant[lang]
        if (!entry.optional) expect(words.trim()).not.toBe('')
        expect(charLength(words)).toBeLessThanOrEqual(entry.max)
        expect(textProblem(entry, words)).toBeNull()
        for (const key of placeholdersIn(words)) expect(entry.placeholders).toContain(key)
      }
    }
  })

  it('buttons take no placeholders and fit Meta\'s 20 characters', () => {
    for (const entry of textEntries.filter((item) => item.kind === 'button')) {
      expect(entry.placeholders).toEqual([])
      expect(entry.max).toBe(20)
    }
  })

  it('status messages keep their kind-aware defaults', () => {
    expect(defaultText('orders.update.ready', 'en', 'pickup')).toBe('🛍️ Your order {order} is ready for pickup at {store}!')
    expect(defaultText('orders.update.ready', 'en', 'dine_in')).toBe('🍽️ Your order {order} is ready!')
    expect(defaultText('orders.update.delivered', 'tl', 'delivery')).toContain('Na-deliver')
  })
})

describe('fillTemplate', () => {
  it('drops a blank {name} with the space or comma joining it', () => {
    expect(fillTemplate('Hi {name}! Welcome', { name: '' })).toBe('Hi! Welcome')
    expect(fillTemplate('Salamat, {name}.', { name: '' })).toBe('Salamat.')
    expect(fillTemplate('{name}, ready na', { name: '' })).toBe('ready na')
    expect(fillTemplate('Hi {name}!', { name: 'Ana' })).toBe('Hi Ana!')
  })

  it('keeps a line with a blank name (it is not a detail line)', () => {
    expect(fillTemplate('Hi {name}!\nHere is the menu', { name: '' })).toBe('Hi!\nHere is the menu')
  })

  it('drops a line whose details are all blank', () => {
    expect(fillTemplate('📍 {address}\n🕒 {hours}', { address: '', hours: 'Open 9–5' })).toBe('🕒 Open 9–5')
  })

  it('fills once: a value that looks like a placeholder stays as it is', () => {
    expect(fillTemplate('{item} added', { item: '{store} Special', store: 'X' })).toBe('{store} Special added')
  })

  it('leaves words it was not given', () => {
    expect(fillTemplate('{store} {mystery}', { store: 'X' })).toBe('X {mystery}')
  })
})

describe('greetingName', () => {
  it.each([
    ['Ana Marie', 'Ana'], ["D'Angelo", "D'Angelo"], ['  José ', 'José'], ['', ''], [null, ''], ['123', ''], ['🙂 Ana', ''], ['Y', 'Y'],
  ])('%p → %p', (raw, expected) => {
    expect(greetingName(raw)).toBe(expected)
  })
})

describe('stored wording', () => {
  it('read: keeps good keys, drops unknown, wrong type, too long, wrong placeholder', () => {
    const settings = readMessages({
      lang: 'tl',
      'cart.added': '  Added {item}! ',
      'cart.show_empty_cart': false,
      'nope.unknown': 'x',
      'cart.checkout': 42,
      'cart.remove': 'x'.repeat(21),
      'cart.cleared': 'Bye {item}',
      'browse.show_was_price': 'no',
    })
    expect(settings).toEqual({ lang: 'tl', texts: { 'cart.added': 'Added {item}!' }, toggles: { 'cart.show_empty_cart': false } })
  })

  it('read: never throws on junk', () => {
    for (const raw of [null, undefined, 'x', 3, [], [1]]) expect(readMessages(raw)).toEqual({ lang: 'en', texts: {}, toggles: {} })
  })

  it('read: release 2 status texts fill in, the new key wins', () => {
    expect(readMessages({}, { ready: 'old {order}' }).texts['orders.update.ready']).toBe('old {order}')
    expect(readMessages({ 'orders.update.ready': 'new' }, { ready: 'old' }).texts['orders.update.ready']).toBe('new')
  })

  it('save: refuses with a reason per message', () => {
    const result = parseMessagesForSave({ 'cart.cleared': 'Bye {item}', 'nope': 'x', 'cart.show_empty_cart': 'yes', lang: 'fr' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.id).sort()).toEqual(['cart.cleared', 'cart.show_empty_cart', 'lang', 'nope'])
    expect(result.problems.find((problem) => problem.id === 'cart.cleared')?.message).toContain('{store}')
  })

  it('save: stores only what differs from the default', () => {
    const result = parseMessagesForSave({ lang: 'en', 'cart.added': ' ', 'cart.show_empty_cart': true, 'cart.show_keep_browsing': false, 'cart.checkout': 'Bayad na' })
    expect(result).toMatchObject({ ok: true, stored: { 'cart.show_keep_browsing': false, 'cart.checkout': 'Bayad na' } })
    if (result.ok) expect(Object.keys(result.stored).sort()).toEqual(['cart.checkout', 'cart.show_keep_browsing'])
  })

  it('every registry id is reachable through save and read', () => {
    for (const entry of entries) expect(MESSAGE_BY_ID.get(entry.id)).toBe(entry)
  })
})

describe('a store\'s wording reaches the replies', () => {
  const store = sampleStore({
    categories: [category('c1', 'Meals', 1)],
    items: [
      dish('chicken', 'c1', 0, { name: 'Chicken Inasal', price: 149 }),
      dish('pork', 'c1', 1, { name: 'Pork BBQ', price: 99, discounted_price: 89 }),
    ],
  })
  const withWords = (raw: Record<string, unknown>, extra: Partial<ReplyContext> = {}): ReplyContext => ({
    ...sampleContext(store, 'tok'), messages: readMessages(raw), ...extra,
  })

  it('the added message, with the customer\'s name', () => {
    const ctx = withWords({ 'cart.added': 'Sige {name}! {item} x{qty} na. Total {total}' }, {
      customerName: 'Ana',
      cart: { priced: priceChatCart([{ itemId: 'chicken', qty: 2 }], store), outcome: 'added', itemId: 'chicken' },
    })
    expect(buildCartChange(ctx)[0]).toMatchObject({ text: 'Sige Ana! Chicken Inasal x2 na. Total ₱298' })
  })

  it('cart toggles hide Keep browsing and Empty cart; the lead line shows above the cards', () => {
    const ctx = withWords({ 'cart.show_keep_browsing': false, 'cart.show_empty_cart': false, 'cart.lead': 'Cart mo, {name}: {count}' }, {
      cart: { priced: priceChatCart([{ itemId: 'chicken', qty: 1 }], store) },
    })
    const messages = buildCart(ctx)
    expect(messages[0]).toEqual({ kind: 'text', text: 'Cart mo: 1 item' })
    const cards = messages[1]
    if (cards.kind !== 'cards') throw new Error('expected cards')
    expect(cards.cards.at(-1)?.buttons.map((button) => button.title)).toEqual(['✅ Checkout'])
  })

  it('dish cards: no View item, no "was" price', () => {
    const [, carousel] = buildReply({ kind: 'featured_items', itemIds: ['pork'] }, withWords({ 'browse.show_view_item': false, 'browse.show_was_price': false }))
    if (carousel.kind !== 'cards') throw new Error('expected cards')
    expect(carousel.cards[0].subtitle).toBe('₱89 · A test menu item')
    expect(carousel.cards[0].buttons.map((button) => button.title)).toEqual(['🛒 Add to cart', 'Full menu'])
  })

  it('a rule\'s own words still win over the store\'s', () => {
    const ctx = withWords({ 'browse.menu_title': 'Store title', 'browse.menu_button': 'Store button' })
    const [card] = buildMenuCard(ctx, { kind: 'menu_card', title: 'Rule title' })
    if (card.kind !== 'cards') throw new Error('expected cards')
    expect(card.cards[0].title).toBe('Rule title')
    expect(card.cards[0].buttons[0].title).toBe('Store button')
  })

  it('Taglish: one switch changes every default', () => {
    const [message] = buildReply({ kind: 'categories' }, withWords({ lang: 'tl' }))
    expect(message).toMatchObject({ text: defaultText('browse.categories_text', 'tl') })
  })
})
