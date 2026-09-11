/**
 * Bundle slots used to be filled one serial query at a time, inside the ISR
 * render of the menu page: a tenant with three bundles of four slots paid
 * twelve round-trips before the menu could be returned. The queries differed
 * only in which category they asked for, so one query for every category at
 * once plus this pure assignment does the same job.
 *
 * "The same job" is the part that needs pinning — the per-slot query filtered
 * on category, on `is_available`, and optionally on `included_item_ids`, and
 * returned them ordered.
 */

import { collectSlotCategoryIds, hydrateBundleSlots } from '@/lib/bundles/slot-hydration'
import type { BundleWithSlots, MenuItem } from '@/types/database'

const item = (id: string, categoryId: string, order = 0): MenuItem =>
  ({ id, category_id: categoryId, name: id, price: 100, order, is_available: true }) as unknown as MenuItem

const bundle = (
  id: string,
  slots: Array<{ category_id: string; included_item_ids?: string[] }>,
): BundleWithSlots =>
  ({
    id,
    slots: slots.map((slot, index) => ({
      id: `${id}-slot-${index}`,
      category_id: slot.category_id,
      included_item_ids: slot.included_item_ids,
    })),
  }) as unknown as BundleWithSlots

describe('collectSlotCategoryIds', () => {
  it('asks for each category once, however many slots want it', () => {
    const ids = collectSlotCategoryIds([
      bundle('b1', [{ category_id: 'drinks' }, { category_id: 'sides' }]),
      bundle('b2', [{ category_id: 'drinks' }]),
    ])

    expect([...ids].sort()).toEqual(['drinks', 'sides'])
  })

  it('is empty for bundles with no slots, so no query runs at all', () => {
    expect(collectSlotCategoryIds([bundle('b1', [])])).toEqual([])
  })
})

describe('hydrateBundleSlots', () => {
  const pool = [
    item('coke', 'drinks', 0),
    item('sprite', 'drinks', 1),
    item('fries', 'sides', 0),
  ]

  it('gives each slot only its own category', () => {
    const [hydrated] = hydrateBundleSlots(
      [bundle('b1', [{ category_id: 'drinks' }, { category_id: 'sides' }])],
      pool,
    )

    expect(hydrated.slots[0].items?.map((i) => i.id)).toEqual(['coke', 'sprite'])
    expect(hydrated.slots[1].items?.map((i) => i.id)).toEqual(['fries'])
  })

  it('narrows to included_item_ids when the merchant set them', () => {
    const [hydrated] = hydrateBundleSlots(
      [bundle('b1', [{ category_id: 'drinks', included_item_ids: ['sprite'] }])],
      pool,
    )

    expect(hydrated.slots[0].items?.map((i) => i.id)).toEqual(['sprite'])
  })

  it('treats an empty included_item_ids as "the whole category", as the query did', () => {
    const [hydrated] = hydrateBundleSlots(
      [bundle('b1', [{ category_id: 'drinks', included_item_ids: [] }])],
      pool,
    )

    expect(hydrated.slots[0].items?.map((i) => i.id)).toEqual(['coke', 'sprite'])
  })

  it('preserves the pool order, which the caller sorted', () => {
    const reversed = [item('sprite', 'drinks', 1), item('coke', 'drinks', 0)]
    const [hydrated] = hydrateBundleSlots([bundle('b1', [{ category_id: 'drinks' }])], reversed)

    expect(hydrated.slots[0].items?.map((i) => i.id)).toEqual(['sprite', 'coke'])
  })

  it('leaves a slot whose category has no dishes empty rather than undefined', () => {
    const [hydrated] = hydrateBundleSlots([bundle('b1', [{ category_id: 'desserts' }])], pool)

    expect(hydrated.slots[0].items).toEqual([])
  })

  it('does not mutate the bundles it was given', () => {
    const input = [bundle('b1', [{ category_id: 'drinks' }])]

    hydrateBundleSlots(input, pool)

    expect(input[0].slots[0].items).toBeUndefined()
  })
})
