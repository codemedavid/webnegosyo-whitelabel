import { describe, it, expect } from '@jest/globals'
import { MAX_ORDER_LINES, parseOrderLines } from '@/lib/checkout/order-line-schema'

/**
 * `createOrderAction` is a public server action: anyone can post it, so the
 * lines are validated at the boundary before a single one is priced. What the
 * web checkout itself sends must always pass — a refusal here is invisible
 * behind the optimistic "Order Placed!" screen.
 */

const webLine = {
  menu_item_id: 'mi-1',
  menu_item_name: 'Tapsilog',
  variation: 'Large',
  addons: ['Egg', 'Extra rice ×2'],
  quantity: 2,
  price: 210,
  subtotal: 420,
  special_instructions: 'less salt',
  option_ids: ['o-1'],
  addon_ids: ['a-1', 'a-2'],
  addon_quantities: { 'a-2': 2 },
  isUpsellItem: true,
  presell_date: '2026-12-24',
}

const bundleLine = {
  menu_item_id: 'mi-2',
  menu_item_name: 'Fries',
  addons: [],
  quantity: 1,
  price: 0,
  subtotal: 0,
  option_ids: [],
  addon_ids: [],
  isBundleItem: true,
  bundleId: 'b-1',
  bundleName: 'Barkada',
  slotName: 'Side',
}

describe('parseOrderLines — what the web checkout sends', () => {
  it('accepts an ordinary customised line and a bundle slot', () => {
    const result = parseOrderLines([webLine, bundleLine])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.lines).toHaveLength(2)
  })

  it('returns new objects and drops keys the action does not know', () => {
    const submitted = { ...webLine, total_override: 1 }
    const result = parseOrderLines([submitted])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines[0]).not.toBe(submitted)
    expect(result.lines[0]).not.toHaveProperty('total_override')
  })

  it('truncates long special instructions instead of refusing', () => {
    const result = parseOrderLines([{ ...webLine, special_instructions: 'x'.repeat(3000) }])

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.lines[0].special_instructions).toHaveLength(1000)
  })

  it('accepts null optional fields', () => {
    const result = parseOrderLines([{ ...webLine, variation: null, special_instructions: null }])

    expect(result.ok).toBe(true)
  })
})

describe('parseOrderLines — refuses what no checkout could send', () => {
  it.each([
    ['a NaN price', { price: Number.NaN }],
    ['a string price', { price: '1' }],
    ['a missing price', { price: undefined }],
    ['a negative price', { price: -1 }],
    ['an infinite subtotal', { subtotal: Number.POSITIVE_INFINITY }],
    ['a negative subtotal', { subtotal: -5 }],
    ['a fractional quantity', { quantity: 1.5 }],
    ['a zero quantity', { quantity: 0 }],
    ['a quantity over the cap', { quantity: 100 }],
    ['an empty menu item id', { menu_item_id: '' }],
    ['a huge item name', { menu_item_name: 'x'.repeat(2000) }],
    ['a huge variation string', { variation: 'x'.repeat(5000) }],
    ['too many add-on labels', { addons: Array.from({ length: 101 }, (_, i) => `a${i}`) }],
    ['too many option ids', { option_ids: Array.from({ length: 101 }, (_, i) => `o${i}`) }],
    ['an add-on quantity for an add-on not selected', { addon_quantities: { ghost: 2 } }],
    ['an add-on quantity over 99', { addon_quantities: { 'a-2': 100 } }],
    ['a prototype-polluting add-on key', { addon_ids: ['__proto__'], addon_quantities: JSON.parse('{"__proto__": 2}') }],
    ['a malformed presell date', { presell_date: 'tomorrow' }],
  ])('refuses %s', (_label, patch) => {
    expect(parseOrderLines([{ ...webLine, ...patch }]).ok).toBe(false)
  })

  it('refuses a cart over the line cap', () => {
    const lines = Array.from({ length: MAX_ORDER_LINES + 1 }, () => webLine)

    expect(parseOrderLines(lines).ok).toBe(false)
  })

  it('refuses an empty cart and a non-array', () => {
    expect(parseOrderLines([]).ok).toBe(false)
    expect(parseOrderLines('lines').ok).toBe(false)
  })

  it('answers a refusal with customer copy, not a schema dump', () => {
    const result = parseOrderLines([{ ...webLine, price: Number.NaN }])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).not.toMatch(/expected|invalid_type|NaN/i)
  })
})
