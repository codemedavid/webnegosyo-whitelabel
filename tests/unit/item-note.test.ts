/**
 * A diner's note for the kitchen ("no onions") is part of WHAT they ordered.
 *
 * Two Burgers, one "no onions" and one plain, are two different dishes for the
 * kitchen — so the note is part of the cart line's identity. The same note
 * typed twice (give or take spacing and capitals) is the same dish and merges.
 */

import { describe, it, expect } from '@jest/globals'
import { ITEM_NOTE_MAX_LENGTH, normalizeItemNote, itemNoteKey } from '@/lib/item-note'
import { generateCartItemId, makeCartItem, replaceCartItem } from '@/lib/cart-utils'
import { MAX_SPECIAL_INSTRUCTIONS_LENGTH, parseOrderLines } from '@/lib/checkout/order-line-schema'
import { buildOrderItemsPayload } from '@/lib/checkout/order-items-payload'
import type { MenuItem } from '@/types/database'

const burger: MenuItem = {
  id: 'burger', tenant_id: 't-1', category_id: 'c-1', name: 'Burger', description: '',
  price: 100, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
}

describe('normalizeItemNote', () => {
  it('trims and squeezes the spacing of what the diner typed', () => {
    expect(normalizeItemNote('  no   onions \n please ')).toBe('no onions please')
  })

  it('treats a blank note as no note', () => {
    expect(normalizeItemNote('')).toBeUndefined()
    expect(normalizeItemNote('   \n ')).toBeUndefined()
    expect(normalizeItemNote(undefined)).toBeUndefined()
    expect(normalizeItemNote(null)).toBeUndefined()
  })

  it('cuts a note longer than the field allows', () => {
    expect(normalizeItemNote('x'.repeat(ITEM_NOTE_MAX_LENGTH + 50))).toHaveLength(ITEM_NOTE_MAX_LENGTH)
  })

  it('allows no more than the server keeps, so a typed note is never cut at checkout', () => {
    expect(ITEM_NOTE_MAX_LENGTH).toBeLessThanOrEqual(MAX_SPECIAL_INSTRUCTIONS_LENGTH)
  })
})

describe('itemNoteKey', () => {
  it('is the same for the same words whatever the spacing or capitals', () => {
    expect(itemNoteKey('No onions')).toBe(itemNoteKey('  no   ONIONS '))
  })

  it('differs for different notes', () => {
    expect(itemNoteKey('no onions')).not.toBe(itemNoteKey('less ice'))
  })

  it('is absent without a note', () => {
    expect(itemNoteKey('  ')).toBeUndefined()
    expect(itemNoteKey(undefined)).toBeUndefined()
  })
})

describe('cart line identity', () => {
  it('keeps the old id for a line without a note (carts already saved still match)', () => {
    expect(generateCartItemId('burger', 'large', ['cheese'])).toBe('burger_large_cheese')
    expect(generateCartItemId('burger', 'large', ['cheese'], undefined, '   ')).toBe('burger_large_cheese')
  })

  it('makes two different notes two different lines', () => {
    const plain = makeCartItem(burger, undefined, [], 1)
    const noOnions = makeCartItem(burger, undefined, [], 1, 'no onions')
    const lessSalt = makeCartItem(burger, undefined, [], 1, 'less salt')

    expect(new Set([plain.id, noOnions.id, lessSalt.id]).size).toBe(3)
  })

  it('gives the same note the same line', () => {
    expect(makeCartItem(burger, undefined, [], 1, 'No onions').id)
      .toBe(makeCartItem(burger, undefined, [], 1, ' no  onions').id)
  })

  it('stores the tidied note, and nothing for a blank one', () => {
    expect(makeCartItem(burger, undefined, [], 1, '  no   onions ').special_instructions).toBe('no onions')
    expect(makeCartItem(burger, undefined, [], 1, '   ').special_instructions).toBeUndefined()
  })

  it('works for grouped options and presell dates too', () => {
    const size = { id: 'large', name: 'Large', price_modifier: 0, display_order: 0 }
    const a = makeCartItem(burger, { size }, [], 1, 'no onions', { presellDate: '2026-12-24' })
    const b = makeCartItem(burger, { size }, [], 1, undefined, { presellDate: '2026-12-24' })

    expect(a.id).not.toBe(b.id)
    expect(a.id.startsWith(b.id)).toBe(true)
  })

  it('editing a line to a new note re-keys it in place and keeps the note', () => {
    const plain = makeCartItem(burger, undefined, [], 1)
    const fries = makeCartItem({ ...burger, id: 'fries', name: 'Fries' }, undefined, [], 1)
    const edited = makeCartItem(burger, undefined, [], 1, 'no onions')

    const cart = replaceCartItem([plain, fries], plain.id, edited)

    expect(cart.map((line) => line.id)).toEqual([edited.id, fries.id])
    expect(cart[0].special_instructions).toBe('no onions')
  })

  it('editing a line to the note another line already has merges the two', () => {
    const noOnions = makeCartItem(burger, undefined, [], 1, 'no onions')
    const plain = makeCartItem(burger, undefined, [], 2)
    const edited = makeCartItem(burger, undefined, [], 2, 'No onions')

    const cart = replaceCartItem([noOnions, plain], plain.id, edited)

    expect(cart).toHaveLength(1)
    expect(cart[0]).toMatchObject({ quantity: 3, special_instructions: 'no onions' })
  })
})

describe('the note on its way to the order', () => {
  it('reaches createOrderAction\'s validated lines with its own dish', () => {
    const cart = [
      makeCartItem(burger, undefined, [], 1, 'no onions'),
      makeCartItem(burger, undefined, [], 1),
    ]

    const parsed = parseOrderLines(buildOrderItemsPayload(cart, []))

    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.lines.map((line) => line.special_instructions)).toEqual(['no onions', undefined])
  })

  it('keeps the longest note the box allows, untouched', () => {
    const longest = 'x'.repeat(ITEM_NOTE_MAX_LENGTH)
    const parsed = parseOrderLines(buildOrderItemsPayload([makeCartItem(burger, undefined, [], 1, longest)], []))

    expect(parsed.ok && parsed.lines[0].special_instructions).toBe(longest)
  })
})
