/**
 * The allocation draft: what the merchant has typed but not yet saved.
 *
 * The panel used to write every keystroke straight to the server, one action
 * per date. Now it edits a draft and the whole thing lands when "Update Menu
 * Item" is pressed, so these functions are the only place that decides what a
 * change means — the panel just renders what they return.
 */

import {
  draftFromRows,
  setDraftStock,
  removeDraftDate,
  fillDraftRange,
  diffDraft,
  isDraftDirty,
  findUnremovableDates,
  type DraftAllocation,
} from '@/lib/presell/allocation-draft'

const draft = (presellDate: string, stockQty: number, soldQty = 0): DraftAllocation => ({
  presellDate,
  stockQty,
  soldQty,
})

const rowOf = (presell_date: string, stock_qty: number, sold_qty = 0) => ({
  id: presell_date,
  tenant_id: 't1',
  menu_item_id: 'm1',
  presell_date,
  stock_qty,
  sold_qty,
  created_at: '',
  updated_at: '',
})

describe('draftFromRows', () => {
  it('keeps only what the draft owns, soonest date first', () => {
    // Arrange
    const rows = [rowOf('2026-12-24', 8, 6), rowOf('2026-12-20', 20, 3)]

    // Act
    const result = draftFromRows(rows)

    // Assert
    expect(result).toEqual([draft('2026-12-20', 20, 3), draft('2026-12-24', 8, 6)])
  })

  it('returns an empty draft for a dish with no dates', () => {
    expect(draftFromRows([])).toEqual([])
  })
})

describe('setDraftStock', () => {
  it('adds a date that was not on offer, in date order', () => {
    // Arrange
    const before = [draft('2026-12-24', 8)]

    // Act
    const after = setDraftStock(before, '2026-12-20', 5)

    // Assert
    expect(after).toEqual([draft('2026-12-20', 5), draft('2026-12-24', 8)])
  })

  it('replaces the stock of a date already on offer, keeping its sold count', () => {
    // Arrange
    const before = [draft('2026-12-20', 20, 3)]

    // Act
    const after = setDraftStock(before, '2026-12-20', 12)

    // Assert
    expect(after).toEqual([draft('2026-12-20', 12, 3)])
  })

  it('never lets stock fall below what already sold', () => {
    // Arrange
    const before = [draft('2026-12-20', 20, 6)]

    // Act
    const after = setDraftStock(before, '2026-12-20', 2)

    // Assert
    expect(after).toEqual([draft('2026-12-20', 6, 6)])
  })

  it('clamps a negative figure to zero', () => {
    expect(setDraftStock([], '2026-12-20', -4)).toEqual([draft('2026-12-20', 0)])
  })

  it('does not mutate the draft it was given', () => {
    // Arrange
    const before = [draft('2026-12-20', 20, 3)]

    // Act
    setDraftStock(before, '2026-12-20', 1)

    // Assert
    expect(before).toEqual([draft('2026-12-20', 20, 3)])
  })
})

describe('removeDraftDate', () => {
  it('drops the date and leaves the rest untouched', () => {
    // Arrange
    const before = [draft('2026-12-20', 20), draft('2026-12-24', 8)]

    // Act
    const after = removeDraftDate(before, '2026-12-20')

    // Assert
    expect(after).toEqual([draft('2026-12-24', 8)])
  })

  it('is a no-op for a date that was never on offer', () => {
    // Arrange
    const before = [draft('2026-12-20', 20)]

    // Act & Assert
    expect(removeDraftDate(before, '2026-12-31')).toEqual(before)
  })
})

describe('fillDraftRange', () => {
  it('sets every date in the run to one figure', () => {
    // Act
    const after = fillDraftRange([], ['2026-12-20', '2026-12-21'], 15)

    // Assert
    expect(after).toEqual([draft('2026-12-20', 15), draft('2026-12-21', 15)])
  })

  it('respects sold counts on the dates it overwrites', () => {
    // Arrange
    const before = [draft('2026-12-20', 20, 9)]

    // Act
    const after = fillDraftRange(before, ['2026-12-20', '2026-12-21'], 4)

    // Assert
    expect(after).toEqual([draft('2026-12-20', 9, 9), draft('2026-12-21', 4)])
  })
})

describe('diffDraft', () => {
  it('reports nothing to write when nothing changed', () => {
    // Arrange
    const rows = [draft('2026-12-20', 20, 3)]

    // Act & Assert
    expect(diffDraft(rows, rows)).toEqual({ upserts: [], deletes: [] })
  })

  it('reports only the dates whose stock actually moved', () => {
    // Arrange
    const before = [draft('2026-12-20', 20, 3), draft('2026-12-24', 8)]
    const after = [draft('2026-12-20', 25, 3), draft('2026-12-24', 8)]

    // Act
    const result = diffDraft(before, after)

    // Assert
    expect(result).toEqual({ upserts: [{ presellDate: '2026-12-20', stockQty: 25 }], deletes: [] })
  })

  it('reports an added date as an upsert', () => {
    // Act
    const result = diffDraft([], [draft('2026-12-20', 5)])

    // Assert
    expect(result).toEqual({ upserts: [{ presellDate: '2026-12-20', stockQty: 5 }], deletes: [] })
  })

  it('reports a removed date as a delete', () => {
    // Act
    const result = diffDraft([draft('2026-12-20', 5)], [])

    // Assert
    expect(result).toEqual({ upserts: [], deletes: ['2026-12-20'] })
  })

  it('ignores a sold count that moved under the merchant while stock stayed put', () => {
    // Arrange — another customer bought one while the editor was open.
    const before = [draft('2026-12-20', 20, 3)]
    const after = [draft('2026-12-20', 20, 4)]

    // Act & Assert
    expect(diffDraft(before, after)).toEqual({ upserts: [], deletes: [] })
  })
})

describe('isDraftDirty', () => {
  it('is false for an untouched draft', () => {
    const rows = [draft('2026-12-20', 20, 3)]
    expect(isDraftDirty(rows, rows)).toBe(false)
  })

  it('is true once a date is added', () => {
    expect(isDraftDirty([], [draft('2026-12-20', 5)])).toBe(true)
  })

  it('is true once a date is removed', () => {
    expect(isDraftDirty([draft('2026-12-20', 5)], [])).toBe(true)
  })
})

describe('findUnremovableDates', () => {
  it('names a removed date that already has sales', () => {
    // Arrange
    const before = [draft('2026-12-20', 20, 3), draft('2026-12-24', 8)]

    // Act
    const result = findUnremovableDates(before, [])

    // Assert — only the date with sales; the empty one may go.
    expect(result).toEqual(['2026-12-20'])
  })

  it('is empty when every removed date is unsold', () => {
    expect(findUnremovableDates([draft('2026-12-20', 20)], [])).toEqual([])
  })
})
