import { judgeDaysCounts } from '@/lib/inventory/day-counts'

const north = { id: 'c-n', outlet_id: 'north', expected_item_count: 4, closed_at: '2026-08-01T10:00:00.000Z' }
const south = { id: 'c-s', outlet_id: 'south', expected_item_count: 6, closed_at: '2026-08-01T12:00:00.000Z' }

describe('judgeDaysCounts', () => {
  it('says nothing when no shelf was counted', () => {
    expect(judgeDaysCounts([], [])).toBeNull()
  })

  it('adds every counted shelf together instead of reading one branch', () => {
    const progress = judgeDaysCounts(
      [north, south],
      [
        { inventory_item_id: 'flour', inventory_count_id: 'c-n' },
        { inventory_item_id: 'flour', inventory_count_id: 'c-s' },
      ],
    )
    expect(progress?.expectedCount).toBe(10)
    // Flour on two shelves is two items counted, not one.
    expect(progress?.countedCount).toBe(2)
  })

  it('uses only the latest count of a shelf', () => {
    const evening = { ...north, id: 'c-n2', expected_item_count: 4 }
    const morning = { ...north, id: 'c-n1', expected_item_count: 4 }
    const progress = judgeDaysCounts([evening, morning], [{ inventory_item_id: 'a', inventory_count_id: 'c-n1' }])
    expect(progress?.expectedCount).toBe(4)
    expect(progress?.countedCount).toBe(0)
  })

  it('is still running while any shelf is open', () => {
    const progress = judgeDaysCounts([north, { ...south, closed_at: null }], [])
    expect(progress?.state).toBe('open')
  })

  it('ignores one-off stocktakes carrying no count', () => {
    const progress = judgeDaysCounts([north], [{ inventory_item_id: 'a', inventory_count_id: null }])
    expect(progress?.countedCount).toBe(0)
  })
})
