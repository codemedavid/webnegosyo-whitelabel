/**
 * Telling an auto-hidden dish apart from one the merchant hid.
 *
 * `auto_disabled_at` has been in the database since Phase 5C and no screen has
 * ever read it. Both states render as the same grey "Hidden" pill, so a
 * merchant looking at a missing bestseller cannot tell whether they turned it
 * off last week or whether the system pulled it an hour ago when the mozzarella
 * ran out — and the alert that would have explained it auto-resolves on the
 * delivery that fixes the stock.
 *
 * Pure on purpose, like `low-stock.ts`: the web admin and the merchant app must
 * not form separate opinions about what a dish's state is called.
 */

import {
  describeMenuAvailability,
  MENU_AVAILABILITY_LABEL,
} from '@/lib/inventory/menu-availability'

describe('describeMenuAvailability', () => {
  it('reports an item on sale as available', () => {
    expect(describeMenuAvailability({ is_available: true, auto_disabled_at: null })).toBe(
      'available',
    )
  })

  it('reports an item the merchant hid as hidden', () => {
    expect(describeMenuAvailability({ is_available: false, auto_disabled_at: null })).toBe('hidden')
  })

  it('reports an item auto-86 hid as auto-hidden', () => {
    expect(
      describeMenuAvailability({ is_available: false, auto_disabled_at: '2026-07-27T10:00:00Z' }),
    ).toBe('auto-hidden')
  })

  it('treats a missing marker column as the merchant hiding it', () => {
    // Any caller whose query forgot to select the column must degrade to the
    // old behaviour, never to a false "the system did this".
    expect(describeMenuAvailability({ is_available: false })).toBe('hidden')
  })

  it('reports an item on sale as available even if a stale marker survives', () => {
    // Recovery clears the marker as it re-enables, so this should not occur —
    // but if it ever did, what the customer can order is the truth.
    expect(
      describeMenuAvailability({ is_available: true, auto_disabled_at: '2026-07-27T10:00:00Z' }),
    ).toBe('available')
  })
})

describe('MENU_AVAILABILITY_LABEL', () => {
  it('names the auto-hidden state after the reason, not the mechanism', () => {
    // "Auto-disabled" describes what the software did. A merchant needs to know
    // what to DO, and the thing to do is check the stock.
    expect(MENU_AVAILABILITY_LABEL['auto-hidden']).toBe('Out of stock (auto)')
  })

  it('says out of stock for the merchant-flipped state too, because that is what customers see', () => {
    // Neither state hides the dish any more — both leave it listed and
    // unorderable — so "Hidden" would describe something that stopped happening.
    expect(MENU_AVAILABILITY_LABEL.hidden).toBe('Out of stock')
  })

  it('keeps the merchant-hidden wording distinct from the automatic one', () => {
    // The distinction is the entire reason `auto_disabled_at` is recorded: one
    // of these is a switch the merchant flipped, the other is a bestseller the
    // system pulled without asking.
    expect(MENU_AVAILABILITY_LABEL.hidden).not.toBe(MENU_AVAILABILITY_LABEL['auto-hidden'])
  })

  it('has a label for every state', () => {
    expect(Object.keys(MENU_AVAILABILITY_LABEL).sort()).toEqual([
      'auto-hidden',
      'available',
      'hidden',
    ])
  })
})
