import { buildWebCartText, webCartLines, webOrderWording } from '@/lib/messenger/web-messages'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import { readMessages } from '@/lib/messenger/messages/stored'
import type { ReplyItem } from '@/lib/messenger/store-view'
import type { Order, Tenant } from '@/types/database'

const LINK = 'https://sample-demo.webnegosyo.app/checkout'

function item(id: string, name: string, price: number, extra: Partial<ReplyItem> = {}): ReplyItem {
  return { id, categoryId: 'c1', name, description: '', price, discountedPrice: null, imageUrl: null, needsChoices: false, isFeatured: false, ...extra }
}

const MENU = [item('i-milk', 'Milktea', 122.99), item('i-sisig', 'Sisig', 149), item('i-pizza', 'Pizza', 399, { needsChoices: true })]

const cart = (count: number, lines = webCartLines([], MENU)) =>
  ({ storeName: 'Sample Demo', checkoutUrl: LINK, itemCount: count, ...lines })

describe('website cart text', () => {
  it('says exactly what it always said when nothing is customised', () => {
    expect(buildWebCartText(cart(1))).toBe(`🛒 Your cart at Sample Demo: 1 item.\n\nReady to order?\n${LINK}`)
    expect(buildWebCartText(cart(3), readMessages({}))).toBe(`🛒 Your cart at Sample Demo: 3 items.\n\nReady to order?\n${LINK}`)
    expect(buildWebCartText(cart(0))).toBe('🛒 Your cart at Sample Demo is empty.\n\nBrowse our menu and add some items!')
  })

  it('does not list dishes or a total until the owner switches them on', () => {
    const lines = webCartLines([{ itemId: 'i-milk', quantity: 1 }], MENU)
    expect(buildWebCartText(cart(1, lines))).not.toContain('Milktea')
  })

  it('lists dishes by their MENU name and totals menu prices in centavos', () => {
    const messages = readMessages({ 'webcart.list_dishes': true, 'webcart.show_total': true })
    const lines = webCartLines([{ itemId: 'i-milk', quantity: 3 }, { itemId: 'i-sisig', quantity: 1 }], MENU)
    expect(buildWebCartText(cart(4, lines), messages)).toBe(
      `🛒 Your cart at Sample Demo: 4 items.\n\n3x Milktea\n1x Sisig\n💰 Total: ₱517.97\n\nReady to order?\n${LINK}`,
    )
  })

  it('prints no total for a cart it cannot price from the menu (choices, add-ons, combos, unknown ids)', () => {
    const messages = readMessages({ 'webcart.list_dishes': true, 'webcart.show_total': true })
    for (const reported of [
      [{ itemId: 'i-milk', quantity: 1, hasChoices: true }],
      [{ itemId: 'i-pizza', quantity: 1 }],
      [{ itemId: 'i-milk', quantity: 1 }, { quantity: 1 }],
      [{ itemId: 'not-on-the-menu', quantity: 1 }],
    ]) {
      const text = buildWebCartText(cart(2, webCartLines(reported, MENU)), messages)
      expect(text).not.toContain('Total')
    }
    // …but still names the dishes the menu knows.
    expect(buildWebCartText(cart(2, webCartLines([{ itemId: 'i-milk', quantity: 1 }, { quantity: 1 }], MENU)), messages)).toContain('1x Milktea')
  })

  it('uses the owner words and keeps the checkout link even when they leave it out', () => {
    const messages = readMessages({ 'webcart.intro': 'Hi! {count} sa cart mo sa {store}', 'webcart.closing': 'Checkout na po!' })
    expect(buildWebCartText(cart(2), messages)).toBe(`Hi! 2 items sa cart mo sa Sample Demo\n\nCheckout na po!\n${LINK}`)
  })

  it('speaks Taglish when the store chose it', () => {
    expect(buildWebCartText(cart(1), readMessages({ lang: 'tl' }))).toBe(`🛒 Cart mo sa Sample Demo: 1 item.\n\nOrder na?\n${LINK}`)
  })
})

const TENANT = { name: 'Sample Demo' } as unknown as Tenant
const ORDER = {
  id: 'o-1', daily_number: 1, order_type: 'Pick Up', customer_name: 'John', customer_contact: '0917 000 0000',
  customer_data: { delivery_address: 'Purok 3' }, total: 255, delivery_fee: 0, service_charge_amount: 0, discount_data: null,
  payment_method_name: 'G-Cash', payment_method_details: '0917 123 4567', status: 'pending',
  items: [{ menu_item_name: 'Milktea', quantity: 2, subtotal: 255, addons: [] }],
} as unknown as Order

describe('website order summary', () => {
  const GOLDEN = [
    '🍽️ New Order from Sample Demo',
    '🧾 Order #01',
    '',
    '📋 Order Type: 📦 Pick Up',
    '',
    '👤 Customer Information:',
    '   👤 Name: John',
    '   📞 Contact: 0917 000 0000',
    '',
    '📍 Address: Purok 3',
    '',
    '📋 Order Details:',
    '',
    '1. Milktea',
    '   Quantity: 2',
    '   Price: ₱255.00',
    '',
    '💰 Total: ₱255.00',
    '',
    '💳 Payment Method:',
    '   G-Cash',
    '   0917 123 4567',
    '',
    '📊 Status: pending',
    '',
    '📍 Please confirm your order!',
  ].join('\n')

  it('is byte-for-byte the old summary when nothing is customised', () => {
    expect(formatOrderMessage(ORDER, TENANT)).toBe(GOLDEN)
    expect(formatOrderMessage(ORDER, TENANT, readMessages({}))).toBe(GOLDEN)
  })

  it('uses the owner first and last line', () => {
    const text = formatOrderMessage(ORDER, TENANT, readMessages({ 'weborder.intro': 'Salamat sa order, {store}!', 'weborder.closing': 'Hintayin lang po ang confirm.' }))
    expect(text.split('\n')[0]).toBe('Salamat sa order, Sample Demo!')
    expect(text.split('\n').at(-1)).toBe('Hintayin lang po ang confirm.')
  })

  it('hides customer details, per-dish prices and payment when switched off; the total stays', () => {
    const text = formatOrderMessage(ORDER, TENANT, readMessages({
      'weborder.show_customer': false, 'weborder.show_item_prices': false, 'weborder.show_payment': false,
    }))
    expect(text).not.toMatch(/John|0917|Purok|Price:|G-Cash/)
    expect(text).toContain('💰 Total: ₱255.00')
    expect(text).toContain('   Quantity: 2')
  })

  it('wording reads the defaults when nothing is stored', () => {
    expect(webOrderWording('X')).toEqual({ intro: '🍽️ New Order from X', closing: '📍 Please confirm your order!', showsCustomer: true, showsItemPrices: true, showsPayment: true })
  })
})
