/**
 * The chat cart: ops, caps, re-pricing, and the replies a tap gets. A wrong
 * op leaves a customer with a cart they didn't build; a stored price would
 * quote yesterday's menu.
 */
import { applyCartOp, MAX_CART_LINES, MAX_LINE_QTY, parseChatCart, priceChatCart, type ChatCartLine } from '@/lib/messenger/chat-cart'
import { buildCart, buildCartChange, checkoutUrl } from '@/lib/messenger/replies'
import { decodePayload } from '@/lib/messenger/payload'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { category, dish, sampleContext, sampleStore } from './sample-store'

const store = sampleStore({
  categories: [category('c1', 'Meals', 1)],
  items: [
    dish('chicken', 'c1', 0, { name: 'Chicken Inasal', price: 149 }),
    dish('pork', 'c1', 1, { name: 'Pork BBQ', price: 99, discounted_price: 89 }),
    dish('tea', 'c1', 2, { name: 'Milk Tea', price: 80, variations: [{ id: 'v', name: 'Large', price: 10 }] as never }),
    dish('gone', 'c1', 3, { name: 'Sold Out Sisig', is_available: false }),
  ],
})

describe('parseChatCart', () => {
  it('keeps only well-formed lines, merges duplicates, caps quantities and lines', () => {
    expect(parseChatCart(null)).toEqual([])
    expect(parseChatCart({ itemId: 'x' })).toEqual([])
    expect(parseChatCart([
      { itemId: 'chicken', qty: 2 }, { itemId: 'chicken', qty: 49 }, { itemId: 'bad|id', qty: 1 },
      { itemId: 'pork', qty: 0 }, { itemId: 'pork', qty: 1.5 }, 'junk', { itemId: 'pork', qty: 3 },
    ])).toEqual([{ itemId: 'chicken', qty: MAX_LINE_QTY }, { itemId: 'pork', qty: 3 }])
    const many = Array.from({ length: 30 }, (_, index) => ({ itemId: `i${index}`, qty: 1 }))
    expect(parseChatCart(many)).toHaveLength(MAX_CART_LINES)
  })
})

describe('applyCartOp', () => {
  const cart: ChatCartLine[] = [{ itemId: 'chicken', qty: 1 }]

  it('add: a new line, then +1 on the same dish', () => {
    const first = applyCartOp([], { kind: 'add', itemId: 'chicken' }, store)
    expect(first).toEqual({ cart: [{ itemId: 'chicken', qty: 1, name: 'Chicken Inasal' }], outcome: 'added' })
    expect(applyCartOp(first.cart, { kind: 'add', itemId: 'chicken' }, store).cart).toEqual([{ itemId: 'chicken', qty: 2, name: 'Chicken Inasal' }])
  })

  it('refuses dishes that need a choice, are sold out or belong to no menu, and takes them out', () => {
    expect(applyCartOp(cart, { kind: 'add', itemId: 'tea' }, store).outcome).toBe('unavailable')
    expect(applyCartOp([...cart, { itemId: 'gone', qty: 2 }], { kind: 'inc', itemId: 'gone' }, store))
      .toEqual({ cart, outcome: 'unavailable' })
    expect(applyCartOp(cart, { kind: 'add', itemId: 'another-stores-dish' }, store).outcome).toBe('unavailable')
  })

  it('− at one removes the line; Remove removes it; ops on missing lines say so', () => {
    expect(applyCartOp(cart, { kind: 'dec', itemId: 'chicken' }, store)).toEqual({ cart: [], outcome: 'removed' })
    expect(applyCartOp([{ itemId: 'chicken', qty: 3 }], { kind: 'dec', itemId: 'chicken' }, store).cart).toEqual([{ itemId: 'chicken', qty: 2 }])
    expect(applyCartOp(cart, { kind: 'remove', itemId: 'chicken' }, store).cart).toEqual([])
    expect(applyCartOp(cart, { kind: 'dec', itemId: 'pork' }, store).outcome).toBe('not_in_cart')
    expect(applyCartOp(cart, { kind: 'inc', itemId: 'pork' }, store).outcome).toBe('not_in_cart')
  })

  it('caps', () => {
    expect(applyCartOp([{ itemId: 'chicken', qty: MAX_LINE_QTY }], { kind: 'inc', itemId: 'chicken' }, store).outcome).toBe('max_qty')
    const full = Array.from({ length: MAX_CART_LINES }, (_, index) => ({ itemId: `x${index}`, qty: 1 }))
    expect(applyCartOp(full, { kind: 'add', itemId: 'chicken' }, store)).toEqual({ cart: full, outcome: 'cart_full' })
  })

  it('never changes the cart it was given', () => {
    const input = [{ itemId: 'chicken', qty: 2 }]
    applyCartOp(input, { kind: 'inc', itemId: 'chicken' }, store)
    expect(input).toEqual([{ itemId: 'chicken', qty: 2 }])
  })
})

describe('priceChatCart', () => {
  it('prices from today\'s menu in centavos (sale price wins) and drops what can\'t be ordered', () => {
    const priced = priceChatCart([{ itemId: 'chicken', qty: 2 }, { itemId: 'pork', qty: 1 }, { itemId: 'gone', qty: 1, name: 'Sold Out Sisig' }, { itemId: 'deleted', qty: 1 }], store)
    expect(priced.lines.map((line) => [line.item.id, line.lineCentavos])).toEqual([['chicken', 29800], ['pork', 8900]])
    expect(priced.totalCentavos).toBe(38700)
    expect(priced.itemCount).toBe(3)
    expect(priced.droppedNames).toEqual(['Sold Out Sisig', 'A dish'])
    expect(priced.kept).toEqual([{ itemId: 'chicken', qty: 2, name: 'Chicken Inasal' }, { itemId: 'pork', qty: 1, name: 'Pork BBQ' }])
  })
})

function allText(messages: readonly OutgoingMessage[]): string {
  return JSON.stringify(messages)
}

describe('cart replies', () => {
  const ctx = (lines: ChatCartLine[], extra: Partial<{ outcome: 'added' | 'removed' | 'cleared'; itemId: string }> = {}) => ({
    ...sampleContext(store, 'mt1.TOKEN'),
    cart: { priced: priceChatCart(lines, store), ...extra },
  })

  it('Added: the dish, the cart total, Checkout (signed link) + View cart + Keep browsing', () => {
    const [message] = buildCartChange(ctx([{ itemId: 'chicken', qty: 2 }, { itemId: 'pork', qty: 1 }], { outcome: 'added', itemId: 'chicken' }))
    expect(message).toMatchObject({ kind: 'buttons', text: '✅ Added Chicken Inasal (2 in cart)\n🛒 Your cart: 3 items · ₱387' })
    if (message.kind !== 'buttons') throw new Error('expected buttons')
    expect(message.buttons.map((button) => button.title)).toEqual(['✅ Checkout', '🛒 View cart', 'Keep browsing'])
    expect(message.buttons[0]).toMatchObject({ type: 'web_url', url: 'https://karamotan.webnegosyo.com/cart?mc=1&m=mt1.TOKEN' })
  })

  it('the cart: a card per dish with − + Remove, then the total with Checkout and Empty cart', () => {
    const [message] = buildCart(ctx([{ itemId: 'chicken', qty: 2 }, { itemId: 'pork', qty: 1 }]))
    if (message.kind !== 'cards') throw new Error('expected cards')
    expect(message.cards.map((card) => card.title)).toEqual(['2 × Chicken Inasal', '1 × Pork BBQ', 'Total ₱387 · 3 items'])
    expect(message.cards[0].buttons.map((button) => button.type === 'postback' ? decodePayload(button.payload) : null)).toEqual([
      { verb: 'dec', itemId: 'chicken' }, { verb: 'inc', itemId: 'chicken' }, { verb: 'rm', itemId: 'chicken' },
    ])
    expect(message.cards[2].buttons.map((button) => button.title)).toEqual(['✅ Checkout', 'Keep browsing', 'Empty cart'])
  })

  it('more than 9 dishes: 9 cards + the total, which says how many more', () => {
    const big = sampleStore()
    const lines = big.items.slice(0, 12).map((item) => ({ itemId: item.id, qty: 1 }))
    const [message] = buildCart({ ...sampleContext(big, 't'), cart: { priced: priceChatCart(lines, big) } })
    if (message.kind !== 'cards') throw new Error('expected cards')
    expect(message.cards).toHaveLength(10)
    expect(message.cards[9].subtitle).toBe('+3 more on the checkout page')
  })

  it('empty, unreadable and dropped dishes are each said plainly', () => {
    expect(allText(buildCart(ctx([])))).toContain('Your cart is empty')
    expect(allText(buildCart(sampleContext(store, 't')))).toContain("couldn't open your cart")
    const dropped = buildCart(ctx([{ itemId: 'gone', qty: 1, name: 'Sold Out Sisig' }, { itemId: 'chicken', qty: 1 }]))
    expect(dropped[0]).toMatchObject({ kind: 'text', text: expect.stringContaining('Sold Out Sisig') })
  })

  it('the checkout link goes to the cart page with the chat-cart marker', () => {
    expect(checkoutUrl(sampleContext(store, null))).toBe('https://karamotan.webnegosyo.com/cart?mc=1')
  })
})
