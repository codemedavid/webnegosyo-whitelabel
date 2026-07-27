/**
 * "What has been happening?"
 *
 * Stock history exists, but only one ingredient at a time — to see the day you
 * would open every ingredient in turn and merge them in your head. And a single
 * order that consumed four ingredients writes four ledger rows, so the raw feed
 * reads as four unrelated events rather than one sale.
 *
 * The feed answers the question the per-ingredient view cannot: what did this
 * system do, in order, and what did each thing move.
 */

import { buildActivityFeed } from '@/lib/inventory/activity-feed'
import type { StockMovement } from '@/types/database'

function movement(over: Partial<StockMovement> & { id: string }): StockMovement {
  return {
    tenant_id: 't1',
    inventory_item_id: 'moz',
    reason: 'sale',
    quantity_delta: -100,
    balance_after: 400,
    created_at: '2026-07-27T10:00:00Z',
    order_id: null,
    ...over,
  } as StockMovement
}

const NAMES = new Map([
  ['moz', 'Mozzarella'],
  ['egg', 'Egg'],
])

function build(movements: StockMovement[]) {
  return buildActivityFeed(movements, { ingredientName: (id) => NAMES.get(id) ?? null })
}

describe('one entry per thing that happened', () => {
  it('names the ingredient a manual movement touched', () => {
    const feed = build([
      movement({ id: '1', reason: 'receive', quantity_delta: 500, balance_after: 500 }),
    ])

    expect(feed).toHaveLength(1)
    expect(feed[0].title).toBe('Received Mozzarella')
    expect(feed[0].lines).toEqual(['+500'])
  })

  it('collapses the ingredients of one order into a single sale', () => {
    const feed = build([
      movement({ id: '1', order_id: 'o1', inventory_item_id: 'moz', quantity_delta: -100 }),
      movement({ id: '2', order_id: 'o1', inventory_item_id: 'egg', quantity_delta: -2 }),
    ])

    expect(feed).toHaveLength(1)
    expect(feed[0].lines).toEqual(['Mozzarella -100', 'Egg -2'])
  })

  it('keeps separate orders separate', () => {
    const feed = build([
      movement({ id: '1', order_id: 'o1' }),
      movement({ id: '2', order_id: 'o2' }),
    ])

    expect(feed).toHaveLength(2)
  })

  it('does not merge a cancellation into the order it reverses', () => {
    // Same order id, opposite direction. Folding the void into the sale would
    // net them out to nothing and erase the fact that an order was cancelled.
    const feed = build([
      movement({ id: '1', order_id: 'o1', reason: 'sale', quantity_delta: -100 }),
      movement({ id: '2', order_id: 'o1', reason: 'void', quantity_delta: 100 }),
    ])

    expect(feed).toHaveLength(2)
    // Wording comes from the shared MOVEMENT_REASON_LABELS map the per-ingredient
    // history already uses — a second vocabulary would let the two disagree.
    // Order is not asserted: the two rows share a timestamp, so any tiebreak
    // between them would be testing the sort's incidental stability.
    expect(feed.map((entry) => entry.title).sort()).toEqual([
      'Order voided Mozzarella',
      'Sold Mozzarella',
    ])
  })

  it('survives an ingredient it cannot name', () => {
    const feed = build([movement({ id: '1', inventory_item_id: 'ghost', reason: 'waste' })])

    expect(feed).toHaveLength(1)
    expect(feed[0].title).toBe('Wasted')
  })
})

describe('ordering', () => {
  it('puts the most recent thing first', () => {
    const feed = build([
      movement({ id: 'old', reason: 'receive', created_at: '2026-07-27T08:00:00Z' }),
      movement({ id: 'new', reason: 'waste', created_at: '2026-07-27T12:00:00Z' }),
    ])

    expect(feed.map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('dates a grouped sale by its earliest row so the group does not drift', () => {
    const feed = build([
      movement({ id: '2', order_id: 'o1', created_at: '2026-07-27T10:00:05Z' }),
      movement({ id: '1', order_id: 'o1', created_at: '2026-07-27T10:00:00Z' }),
    ])

    expect(feed[0].createdAt).toBe('2026-07-27T10:00:00Z')
  })
})

describe('an empty ledger', () => {
  it('is an empty feed rather than a crash', () => {
    expect(build([])).toEqual([])
  })
})
