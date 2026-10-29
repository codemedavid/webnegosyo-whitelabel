import { describe, it, expect } from '@jest/globals'
import { describeOrderItem } from '@/lib/order-item-display'

/**
 * What the admin order page shows for one stored line, whoever wrote it.
 *
 * Web checkout stores `variation` text, `addons` labels and (since
 * 20261029121000) `addon_details` with prices. The POS register stores neither
 * text column: its sizes AND add-ons live in `variation_selections`, and its
 * `price` is the BASE price while `subtotal` includes the options. The page
 * read only the web columns, so a counter sale showed no add-ons and
 * "₱100 each" under a ₱130 line.
 */

describe('describeOrderItem — web checkout lines', () => {
  it('shows each add-on with its price and portions', () => {
    const view = describeOrderItem({
      variation: 'Big',
      addons: ['Fried Rice ×2', 'Egg'],
      addon_details: [
        { name: 'Fried Rice', price: 15, quantity: 2 },
        { name: 'Egg', price: 20, quantity: 1 },
      ],
      quantity: 2,
      price: 180,
      subtotal: 360,
    })

    expect(view.choices).toEqual([{ label: 'Big', price: null }])
    expect(view.addons).toEqual([
      { name: 'Fried Rice', price: 15, quantity: 2 },
      { name: 'Egg', price: 20, quantity: 1 },
    ])
    expect(view.unitPrice).toBe(180)
  })

  it('falls back to the labels on lines saved before prices were stored', () => {
    const view = describeOrderItem({ addons: ['Pearl', 'Cheese ×2'], quantity: 1, price: 49, subtotal: 49 })

    expect(view.addons).toEqual([
      { name: 'Pearl', price: null, quantity: 1 },
      { name: 'Cheese', price: null, quantity: 2 },
    ])
  })

  it('ignores a malformed breakdown and keeps the labels', () => {
    const view = describeOrderItem({
      addons: ['Pearl'],
      addon_details: [{ name: 42 }] as unknown,
      quantity: 1,
      price: 49,
      subtotal: 49,
    })

    expect(view.addons).toEqual([{ name: 'Pearl', price: null, quantity: 1 }])
  })
})

describe('describeOrderItem — POS register lines', () => {
  it('shows the register selections and the real price of one', () => {
    const view = describeOrderItem({
      variation: null,
      addons: [],
      variation_selections: [
        { typeName: 'SIZES', optionName: 'UPSIZE', priceAdjustment: 10 },
        { typeName: 'Add-ons', optionName: 'Fried Rice', priceAdjustment: 15 },
      ],
      quantity: 2,
      price: '29.00',
      subtotal: '108.00',
    })

    expect(view.choices).toEqual([
      { label: 'SIZES: UPSIZE', price: 10 },
      { label: 'Add-ons: Fried Rice', price: 15 },
    ])
    expect(view.unitPrice).toBe(54)
  })

  it('reads a legacy map of selections', () => {
    const view = describeOrderItem({ variation_selections: { Size: 'Large' }, quantity: 1, price: 50, subtotal: 50 })

    expect(view.choices).toEqual([{ label: 'Size: Large', price: null }])
  })

  it('never shows a non-finite price for a zero-quantity row', () => {
    expect(describeOrderItem({ quantity: 0, price: 50, subtotal: 0 }).unitPrice).toBe(50)
  })
})
