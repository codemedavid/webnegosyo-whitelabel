/**
 * Golden output of every reply the bot can send, with NO customised wording.
 *
 * Written before the message registry (plan 2026-11-11, A2) moved the bot's
 * words out of the builders: a store that never touches Messages must keep
 * sending exactly these bytes. A change here is a change to what customers
 * read — update the snapshot only on purpose.
 */

import { priceChatCart, type ChatCartLine, type CartOpOutcome } from '@/lib/messenger/chat-cart'
import {
  buildCart,
  buildCartChange,
  buildCategoryItems,
  buildClearConfirm,
  buildOrderUpdate,
  buildReply,
  withPreviewData,
  type ReplyContext,
} from '@/lib/messenger/replies'
import { UPDATE_STATUSES, type OrderKind, type ReplyOrder } from '@/lib/messenger/order-view'
import type { RuleAction } from '@/lib/messenger/rules'
import { category, dish, sampleContext, sampleStore } from './sample-store'

const full = sampleStore()
const cartStore = sampleStore({
  categories: [category('c1', 'Meals', 1)],
  items: [
    dish('chicken', 'c1', 0, { name: 'Chicken Inasal', price: 149, description: 'Grilled, with rice' }),
    dish('pork', 'c1', 1, { name: 'Pork BBQ', price: 99, discounted_price: 89 }),
    dish('tea', 'c1', 2, { name: 'Milk Tea', price: 80, modifier_groups: [{ id: 'g', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [] }] as never }),
    dish('gone', 'c1', 3, { name: 'Sold Out Sisig', is_available: false }),
  ],
})
const bare = sampleStore({
  tenant: { restaurant_address: null, operating_hours: null, logo_url: null },
  categories: [category('c1', 'Meals', 1)],
  items: [dish('solo', 'c1', 0, { name: 'Solo Dish', image_url: '' })],
})
/** No dish to order: the store's categories list comes out empty too. */
const empty = sampleStore({ categories: [category('c1', 'Meals', 1)], items: [] })

const stores = { full, cartStore, bare, empty } as const

const ACTIONS: Record<string, RuleAction[]> = {
  menu_card: [
    { kind: 'menu_card' },
    { kind: 'menu_card', showCategoriesButton: false },
    { kind: 'menu_card', title: 'Hi from {store}', subtitle: '{hours}', buttonLabel: 'Open' },
  ],
  categories: [{ kind: 'categories' }, { kind: 'categories', text: 'Pick one, {store}' }],
  category_items: [
    { kind: 'category_items', categoryId: 'c-big' },
    { kind: 'category_items', categoryId: 'c-big', text: 'Our {store} rice 👇' },
    { kind: 'category_items', categoryId: 'c1' },
    { kind: 'category_items', categoryId: 'missing' },
  ],
  featured_items: [
    { kind: 'featured_items', itemIds: [] },
    { kind: 'featured_items', itemIds: ['drink-1', 'big-3', 'chicken', 'pork'], text: 'Try these' },
  ],
  text: [
    { kind: 'text', text: 'Hello {store}\n📍 {address}', buttons: [] },
    {
      kind: 'text', text: 'Menu: {menu_link}', buttons: [
        { kind: 'menu', label: 'Menu' }, { kind: 'categories', label: 'Cats' }, { kind: 'staff', label: 'Staff' },
      ],
    },
    { kind: 'text', text: '   ', buttons: [{ kind: 'link', label: 'Site', url: 'https://example.com' }] },
  ],
  hours_location: [{ kind: 'hours_location' }, { kind: 'hours_location', text: 'We are at {address}' }],
  talk_to_staff: [{ kind: 'talk_to_staff' }, { kind: 'talk_to_staff', text: 'Wait lang po' }],
  order_status: [{ kind: 'order_status' }, { kind: 'order_status', text: 'Your orders at {store}' }],
  cart: [{ kind: 'cart' }],
}

const order = (extra: Partial<ReplyOrder> = {}): ReplyOrder => ({
  id: 'o1', label: '#07', status: 'preparing', kind: 'pickup', totalCentavos: 44700,
  trackingUrl: 'https://karamotan.webnegosyo.com/order/o1?t=x', ...extra,
})

describe('golden: every rule action on every store shape', () => {
  for (const [storeName, store] of Object.entries(stores)) {
    for (const [kind, actions] of Object.entries(ACTIONS)) {
      actions.forEach((action, index) => {
        it(`${storeName} · ${kind} #${index}`, () => {
          expect(buildReply(action, sampleContext(store, null))).toMatchSnapshot()
          expect(buildReply(action, sampleContext(store, 'mt1.TOKEN'))).toMatchSnapshot('with token')
          expect(buildReply(action, withPreviewData(sampleContext(store, 'mt1.TOKEN')))).toMatchSnapshot('preview data')
        })
      })
    }
  }
})

describe('golden: category paging', () => {
  it.each([0, 1, 2, 5, -1])('page %i', (page) => {
    expect(buildCategoryItems(sampleContext(full, 'tok'), 'c-big', page, 'Intro {store}')).toMatchSnapshot()
  })
})

describe('golden: order status with orders', () => {
  const ctx = (orders: ReplyOrder[] | null): ReplyContext => ({ ...sampleContext(full, null), orders })
  it.each([
    ['none found', []],
    ['not platform', null],
    ['one with tracking', [order()]],
    ['mixed', [order(), order({ id: 'o2', label: '#A1B2C3', status: 'ready', kind: 'delivery', trackingUrl: null }), order({ id: 'o3', status: 'delivered', kind: 'dine_in' })]],
  ] as const)('%s', (_name, orders) => {
    expect(buildReply({ kind: 'order_status' }, ctx(orders as ReplyOrder[] | null))).toMatchSnapshot()
    expect(buildReply({ kind: 'order_status', text: '' }, ctx(orders as ReplyOrder[] | null))).toMatchSnapshot('blank text')
    expect(buildReply({ kind: 'order_status', text: 'Mine at {store}' }, ctx(orders as ReplyOrder[] | null))).toMatchSnapshot('custom text')
  })
})

describe('golden: chat cart', () => {
  const ctx = (store: typeof full, lines: ChatCartLine[], outcome?: CartOpOutcome, itemId?: string): ReplyContext => ({
    ...sampleContext(store, 'mt1.TOKEN'),
    cart: { priced: priceChatCart(lines, store), ...(outcome ? { outcome } : {}), ...(itemId ? { itemId } : {}) },
  })
  const two: ChatCartLine[] = [{ itemId: 'chicken', qty: 2 }, { itemId: 'pork', qty: 1 }]
  const one: ChatCartLine[] = [{ itemId: 'chicken', qty: 1 }]
  const droppedOne: ChatCartLine[] = [{ itemId: 'gone', qty: 1, name: 'Sold Out Sisig' }, { itemId: 'chicken', qty: 1 }]
  const droppedMany: ChatCartLine[] = [
    { itemId: 'x1', qty: 1, name: 'A' }, { itemId: 'x2', qty: 1, name: 'B' }, { itemId: 'x3', qty: 1, name: 'C' },
    { itemId: 'x4', qty: 1, name: 'D' }, { itemId: 'x5', qty: 1, name: 'E' },
  ]
  const twelve = full.items.slice(0, 12).map((item) => ({ itemId: item.id, qty: 1 }))

  it('cart views', () => {
    expect(buildCart({ ...sampleContext(cartStore, 'tok') })).toMatchSnapshot('unreadable')
    expect(buildCart(ctx(cartStore, []))).toMatchSnapshot('empty')
    expect(buildCart(ctx(empty, []))).toMatchSnapshot('empty, no categories')
    expect(buildCart(ctx(cartStore, one))).toMatchSnapshot('one item')
    expect(buildCart(ctx(cartStore, two))).toMatchSnapshot('two lines')
    expect(buildCart(ctx(cartStore, droppedOne))).toMatchSnapshot('dropped one')
    expect(buildCart(ctx(cartStore, droppedMany))).toMatchSnapshot('dropped many, now empty')
    expect(buildCart(ctx(full, twelve))).toMatchSnapshot('more than nine')
    expect(buildCart(ctx(bare, [{ itemId: 'solo', qty: 1 }]))).toMatchSnapshot('bare store: no logo')
  })

  const outcomes: Array<[string, typeof full, ChatCartLine[], CartOpOutcome | undefined, string | undefined]> = [
    ['added first', cartStore, one, 'added', 'chicken'],
    ['added again', cartStore, two, 'added', 'chicken'],
    ['added unknown dish', cartStore, one, 'added', 'nope'],
    ['added, bare store', bare, [{ itemId: 'solo', qty: 3 }], 'added', 'solo'],
    ['unavailable', cartStore, one, 'unavailable', 'tea'],
    ['unavailable, no categories', empty, [], 'unavailable', 'solo'],
    ['cart full', cartStore, two, 'cart_full', 'chicken'],
    ['max qty', cartStore, two, 'max_qty', 'chicken'],
    ['not in cart', cartStore, two, 'not_in_cart', 'pork'],
    ['cleared', cartStore, [], 'cleared', undefined],
    ['cleared, no categories', empty, [], 'cleared', undefined],
    ['increased', cartStore, two, 'increased', 'chicken'],
    ['decreased', cartStore, one, 'decreased', 'chicken'],
    ['removed to empty', cartStore, [], 'removed', 'chicken'],
  ]
  it.each(outcomes)('change: %s', (_name, store, lines, outcome, itemId) => {
    expect(buildCartChange(ctx(store, lines, outcome, itemId))).toMatchSnapshot()
  })

  it('change with an unreadable cart', () => {
    expect(buildCartChange(sampleContext(cartStore, 'tok'))).toMatchSnapshot()
  })

  it('clear confirm', () => {
    expect(buildClearConfirm(sampleContext(full, null))).toMatchSnapshot()
  })
})

describe('golden: order status messages', () => {
  const kinds: OrderKind[] = ['pickup', 'delivery', 'dine_in', null]
  for (const status of UPDATE_STATUSES) {
    for (const kind of kinds) {
      it(`${status} · ${kind ?? 'unknown'}`, () => {
        const ctx = { storeName: full.name }
        expect(buildOrderUpdate(ctx, status, order({ status, kind }))).toMatchSnapshot()
        expect(buildOrderUpdate(ctx, status, order({ status, kind, trackingUrl: null }))).toMatchSnapshot('no tracking link')
      })
    }
  }
})
