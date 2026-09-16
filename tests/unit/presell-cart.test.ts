/**
 * A presell date is part of the cart line's identity, and a cart holds one.
 *
 * Two bilao for the 24th and two for the 25th are two lines, not one line of
 * four: an order has a single `scheduled_for`, so the second date is refused
 * at the cart, not discovered at checkout. The cart's periodic re-check also
 * has to know about dates — a line for a date that sold out while the tab was
 * in the background must shrink or leave, exactly like an 86'd dish does.
 */

import { generateCartItemId, makeCartItem } from '@/lib/cart-utils'
import {
  findPresellDateConflict,
  countPresellInCart,
  reconcilePresellLines,
} from '@/lib/presell/availability'
import { createTestMenuItem } from '../fixtures/menu-item.fixture'
import type { CartItem } from '@/types/database'

const bilao = createTestMenuItem({ id: 'm-bilao', name: 'Pancit Bilao', presell_enabled: true })
const adobo = createTestMenuItem({ id: 'm-adobo', name: 'Adobo' })

function line(overrides: Partial<CartItem> & { menu_item: CartItem['menu_item'] }): CartItem {
  return {
    id: `${overrides.menu_item.id}-${overrides.presell_date ?? 'none'}`,
    selected_addons: [],
    quantity: 1,
    subtotal: 100,
    ...overrides,
  }
}

describe('generateCartItemId with a presell date', () => {
  it('keys two dates of the same dish as two different lines', () => {
    const dec24 = generateCartItemId('m-bilao', undefined, [], '2026-12-24')
    const dec25 = generateCartItemId('m-bilao', undefined, [], '2026-12-25')
    expect(dec24).not.toBe(dec25)
  })

  it('leaves the id of a dish with no presell date exactly as before', () => {
    expect(generateCartItemId('m-bilao', 'v-large', ['a-1'])).toBe('m-bilao_v-large_a-1')
    expect(generateCartItemId('m-bilao', 'v-large', ['a-1'], undefined)).toBe('m-bilao_v-large_a-1')
  })
})

describe('makeCartItem with a presell date', () => {
  it('carries the date on the line and into its id', () => {
    const item = makeCartItem(bilao, undefined, [], 2, undefined, { presellDate: '2026-12-24' })
    expect(item.presell_date).toBe('2026-12-24')
    expect(item.id).toContain('2026-12-24')
  })

  it('omits the field entirely for an ordinary dish', () => {
    const item = makeCartItem(adobo, undefined, [], 1)
    expect('presell_date' in item).toBe(false)
  })

  it('still records upsell provenance alongside the date', () => {
    const item = makeCartItem(bilao, undefined, [], 1, undefined, {
      presellDate: '2026-12-24',
      upsellSource: 'upgrade',
      upsellSourceItemId: 'm-adobo',
    })
    expect(item.upsellSource).toBe('upgrade')
    expect(item.presell_date).toBe('2026-12-24')
  })
})

describe('findPresellDateConflict', () => {
  it('is null for an empty cart', () => {
    expect(findPresellDateConflict([], '2026-12-24')).toBeNull()
  })

  it('is null when the cart holds only ordinary dishes', () => {
    expect(findPresellDateConflict([line({ menu_item: adobo })], '2026-12-24')).toBeNull()
  })

  it('is null when the cart already holds that same date', () => {
    const items = [line({ menu_item: bilao, presell_date: '2026-12-24' })]
    expect(findPresellDateConflict(items, '2026-12-24')).toBeNull()
  })

  it('returns the date the cart is committed to when a different one is offered', () => {
    const items = [line({ menu_item: bilao, presell_date: '2026-12-24' })]
    expect(findPresellDateConflict(items, '2026-12-25')).toBe('2026-12-24')
  })
})

describe('countPresellInCart', () => {
  const items = [
    line({ id: 'a', menu_item: bilao, presell_date: '2026-12-24', quantity: 2 }),
    line({ id: 'b', menu_item: bilao, presell_date: '2026-12-24', quantity: 3 }),
    line({ id: 'c', menu_item: bilao, presell_date: '2026-12-25', quantity: 4 }),
    line({ id: 'd', menu_item: adobo, quantity: 9 }),
  ]

  it('sums every configuration of the dish on that date', () => {
    expect(countPresellInCart(items, 'm-bilao', '2026-12-24')).toBe(5)
  })

  it('ignores other dates and other dishes', () => {
    expect(countPresellInCart(items, 'm-bilao', '2026-12-26')).toBe(0)
    expect(countPresellInCart(items, 'm-adobo', '2026-12-24')).toBe(0)
  })

  it('can leave one line out, for a stepper that is about to change that line', () => {
    expect(countPresellInCart(items, 'm-bilao', '2026-12-24', 'b')).toBe(2)
  })
})

describe('reconcilePresellLines', () => {
  const items = [
    line({ id: 'a', menu_item: bilao, presell_date: '2026-12-24', quantity: 5, subtotal: 500 }),
    line({ id: 'b', menu_item: bilao, presell_date: '2026-12-25', quantity: 2, subtotal: 200 }),
    line({ id: 'c', menu_item: adobo, quantity: 9 }),
  ]

  it('leaves the cart untouched (same reference) when every date still covers its line', () => {
    const calendars = new Map([['m-bilao', new Map([['2026-12-24', 10], ['2026-12-25', 2]])]])
    const result = reconcilePresellLines(items, calendars)
    expect(result.hasChanges).toBe(false)
    expect(result.items).toBe(items)
  })

  it('shrinks a line to what its date has left and re-prices it', () => {
    const calendars = new Map([['m-bilao', new Map([['2026-12-24', 3], ['2026-12-25', 2]])]])
    const result = reconcilePresellLines(items, calendars)
    expect(result.hasChanges).toBe(true)
    const shrunk = result.items.find((i) => i.id === 'a')
    expect(shrunk?.quantity).toBe(3)
    expect(shrunk?.subtotal).toBe(300)
  })

  it('removes a line whose date sold out or lost its allocation', () => {
    const calendars = new Map([['m-bilao', new Map([['2026-12-24', 0]])]])
    const result = reconcilePresellLines(items, calendars)
    expect(result.items.map((i) => i.id)).toEqual(['c'])
    expect(result.removed.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('never touches ordinary lines, and leaves a presell line alone when its dish was not re-read', () => {
    const result = reconcilePresellLines(items, new Map())
    expect(result.hasChanges).toBe(false)
    expect(result.items).toBe(items)
  })

  it('splits a date shared by two configurations proportionally by taking from the later line first', () => {
    const two = [
      line({ id: 'a', menu_item: bilao, presell_date: '2026-12-24', quantity: 3, subtotal: 300 }),
      line({ id: 'b', menu_item: bilao, presell_date: '2026-12-24', quantity: 3, subtotal: 300 }),
    ]
    const calendars = new Map([['m-bilao', new Map([['2026-12-24', 4]])]])
    const result = reconcilePresellLines(two, calendars)
    expect(result.items.map((i) => [i.id, i.quantity])).toEqual([['a', 3], ['b', 1]])
  })
})
