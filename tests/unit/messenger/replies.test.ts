import {
  buildCategories,
  buildCategoryItems,
  buildFeaturedItems,
  buildHoursLocation,
  buildMenuCard,
  buildReply,
  fillPlaceholders,
  formatPeso,
  ITEMS_PER_PAGE,
} from '@/lib/messenger/replies'
import { decodePayload } from '@/lib/messenger/payload'
import { dish, sampleContext, sampleStore } from './sample-store'

describe('buildReplyStore', () => {
  const store = sampleStore()

  it('keeps only categories with something to order', () => {
    expect(store.categories.map((entry) => entry.id)).toEqual(['c-big', 'c-small'])
  })

  it('leaves sold-out dishes and dishes in hidden categories out', () => {
    const ids = store.items.map((item) => item.id)
    expect(ids).not.toContain('drink-sold-out')
    expect(ids).not.toContain('special')
  })

  it('links to the store, today\'s hours, the address', () => {
    expect(store.baseUrl).toBe('https://karamotan.webnegosyo.com')
    expect(store.hoursText).toBe('Open today 9:00 AM – 9:00 PM')
    expect(store.address).toBe('Purok 3, Mintal, Davao City')
  })

  it('prefers a verified custom domain', () => {
    expect(sampleStore({ tenant: { domain: 'order.karamotan.ph' } }).baseUrl).toBe('https://order.karamotan.ph')
  })

  it('never hands Meta a non-https image', () => {
    const plain = sampleStore({ items: [dish('x', 'c-big', 0, { image_url: 'http://insecure/x.jpg' })] })
    expect(plain.items[0].imageUrl).toBeNull()
  })

  it('marks dishes with a required choice', () => {
    const withSize = sampleStore({
      items: [dish('x', 'c-big', 0, { modifier_groups: [{ id: 'g', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [] }] })],
    })
    expect(withSize.items[0].needsChoices).toBe(true)
    expect(sampleStore().items[0].needsChoices).toBe(false)
  })
})

describe('menu card', () => {
  it('matches the old card: store name, one View Items button, the menu link', () => {
    const [message] = buildMenuCard(sampleContext(), { kind: 'menu_card', showCategoriesButton: false })
    expect(message).toEqual({
      kind: 'cards',
      cards: [{
        title: '📍 Karamotan Grill',
        subtitle: '👇 Tap below to view items and order now!',
        imageUrl: 'https://img.example/logo.png',
        tapUrl: 'https://karamotan.webnegosyo.com/menu',
        buttons: [{ type: 'web_url', title: '🛒 View Items Now', url: 'https://karamotan.webnegosyo.com/menu' }],
      }],
    })
  })

  it('adds a Categories button when there is more than one category', () => {
    const [message] = buildMenuCard(sampleContext())
    expect(message.kind === 'cards' && message.cards[0].buttons.map((entry) => entry.title)).toEqual(['🛒 View Items Now', '📋 Categories'])
  })

  it('links carry the signed token, never a PSID', () => {
    const [message] = buildMenuCard(sampleContext(sampleStore(), 'mt1.123.abc'))
    expect(message.kind === 'cards' && message.cards[0].tapUrl).toBe('https://karamotan.webnegosyo.com/menu?m=mt1.123.abc')
    expect(JSON.stringify(message)).not.toContain('psid')
  })
})

describe('categories and carousels', () => {
  it('one quick reply per category, then Full menu', () => {
    const [message] = buildCategories(sampleContext())
    expect(message.kind).toBe('text')
    const replies = message.kind === 'text' ? message.quickReplies ?? [] : []
    expect(replies.map((entry) => entry.title)).toEqual(['Rice Meals', 'Drinks', 'Full menu'])
    expect(decodePayload(replies[0].payload)).toEqual({ verb: 'category', categoryId: 'c-big', page: 0 })
  })

  it('pages a big category: 9 dishes + See more', () => {
    const [first] = buildCategoryItems(sampleContext(), 'c-big', 0)
    expect(first.kind === 'cards' && first.cards).toHaveLength(ITEMS_PER_PAGE + 1)
    const more = first.kind === 'cards' ? first.cards[ITEMS_PER_PAGE] : null
    expect(more?.title).toBe('11 more in Rice Meals')
    expect(more?.buttons[0].type === 'postback' && decodePayload(more.buttons[0].payload)).toEqual({ verb: 'category', categoryId: 'c-big', page: 1 })

    const [last] = buildCategoryItems(sampleContext(), 'c-big', 2)
    expect(last.kind === 'cards' && last.cards.map((card) => card.title)).toEqual(['Dish big-18', 'Dish big-19'])
  })

  it('a page past the end shows the last page', () => {
    const [message] = buildCategoryItems(sampleContext(), 'c-big', 40)
    expect(message.kind === 'cards' && message.cards[0].title).toBe('Dish big-18')
  })

  it('an unknown or foreign category says so and offers the real ones', () => {
    const messages = buildCategoryItems(sampleContext(), 'someone-elses-category', 0)
    expect(messages[0]).toMatchObject({ kind: 'text', text: expect.stringContaining("isn't available") })
    expect(messages[1].kind).toBe('text')
  })

  it('item cards: price, Order + Full menu, tap opens the item', () => {
    const [message] = buildCategoryItems(sampleContext(), 'c-small', 0)
    const card = message.kind === 'cards' ? message.cards[0] : null
    expect(card).toMatchObject({
      title: 'Iced Tea',
      subtitle: '₱45 · A test menu item',
      tapUrl: 'https://karamotan.webnegosyo.com/menu/item/drink-1',
    })
    expect(card?.buttons.map((entry) => entry.title)).toEqual(['Order', 'Full menu'])
  })

  it('featured: the owner\'s picks, in their order, skipping sold out', () => {
    const [, carousel] = buildFeaturedItems(sampleContext(), ['drink-1', 'drink-sold-out', 'big-3'])
    expect(carousel.kind === 'cards' && carousel.cards.map((card) => card.title)).toEqual(['Iced Tea', 'Dish big-3'])
  })

  it('a store with no dishes gets a plain answer, not an empty carousel', () => {
    const empty = sampleContext(sampleStore({ items: [] }))
    expect(buildReply({ kind: 'categories' }, empty)).toEqual([{ kind: 'text', text: expect.stringContaining("isn't online") }])
  })
})

describe('text, hours, placeholders', () => {
  it('fills placeholders', () => {
    expect(fillPlaceholders('Welcome to {store}! Menu: {menu_link}', sampleContext()))
      .toBe('Welcome to Karamotan Grill! Menu: https://karamotan.webnegosyo.com/menu')
  })

  it('drops a line whose only placeholder is blank', () => {
    const noAddress = sampleContext(sampleStore({ tenant: { restaurant_address: '', footer_address: '' } }))
    expect(fillPlaceholders('📍 {address}\n🕒 {hours}', noAddress)).toBe('🕒 Open today 9:00 AM – 9:00 PM')
  })

  it('hours & location: directions button only with an address', () => {
    const [message] = buildHoursLocation(sampleContext())
    expect(message.kind === 'buttons' && message.buttons.map((entry) => entry.title)).toEqual(['Get directions', 'Full menu'])
    expect(message.kind === 'buttons' && message.text).toBe('📍 Purok 3, Mintal, Davao City\n🕒 Open today 9:00 AM – 9:00 PM')
  })

  it('text with buttons becomes a button template', () => {
    const [message] = buildReply({ kind: 'text', text: 'Hi from {store}', buttons: [{ kind: 'staff', label: 'Talk to us' }] }, sampleContext())
    expect(message).toMatchObject({ kind: 'buttons', text: 'Hi from Karamotan Grill', buttons: [{ type: 'postback', title: 'Talk to us' }] })
  })

  it('formatPeso', () => {
    expect(formatPeso(1499)).toBe('₱1,499')
    expect(formatPeso(45.5)).toBe('₱45.50')
  })
})
