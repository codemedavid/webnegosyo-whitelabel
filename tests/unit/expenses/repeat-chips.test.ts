import { REPEAT_CHIP_LIMIT, repeatSuggestions } from '@/lib/expenses/repeat-chips'
import { makeExpense, seededCategories } from './engine-fixtures'

const categories = seededCategories()

function at(minutesAgo: number): string {
  return new Date(Date.parse('2026-10-21T02:00:00.000Z') - minutesAgo * 60_000).toISOString()
}

describe('repeatSuggestions', () => {
  it('leads with the most recent pair, then the most frequent', () => {
    const recent = [
      makeExpense({ categoryId: 'cat-lpg', amountCents: 125_000, createdAt: at(5) }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, createdAt: at(60) }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, createdAt: at(120) }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, createdAt: at(180) }),
      makeExpense({ categoryId: 'cat-transport', amountCents: 8_000, createdAt: at(30) }),
      makeExpense({ categoryId: 'cat-transport', amountCents: 8_000, createdAt: at(400) }),
      makeExpense({ categoryId: 'cat-cleaning', amountCents: 25_000, createdAt: at(10) }),
      makeExpense({ categoryId: 'cat-water', amountCents: 50_000, createdAt: at(900) }),
    ]
    const chips = repeatSuggestions(recent, categories)
    expect(chips.map((c) => [c.categoryId, c.amountCents])).toEqual([
      ['cat-lpg', 125_000],
      ['cat-ice', 12_000],
      ['cat-transport', 8_000],
      ['cat-cleaning', 25_000], // one use each: the more recent wins
    ])
    expect(chips).toHaveLength(REPEAT_CHIP_LIMIT)
    expect(chips[1]).toMatchObject({ categoryName: 'Ice (Yelo)', icon: 'IC', timesUsed: 3, lastUsedAt: at(60) })
  })

  it('does not repeat the recent pair in the frequency list', () => {
    const recent = [
      makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, createdAt: at(1) }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, createdAt: at(2) }),
      makeExpense({ categoryId: 'cat-ice', amountCents: 15_000, createdAt: at(3) }),
    ]
    expect(repeatSuggestions(recent, categories).map((c) => c.amountCents)).toEqual([12_000, 15_000])
  })

  it('skips void rows, capex, not-an-expense, archived and unknown categories', () => {
    const withArchived = categories.map((c) => (c.systemKey === 'rent' ? { ...c, archivedAt: '2026-10-01T00:00:00Z' } : c))
    const recent = [
      makeExpense({ categoryId: 'cat-ice', status: 'void', voidReason: 'undo', voidedAt: at(0), createdAt: at(1) }),
      makeExpense({ categoryId: 'cat-owner_draw', createdAt: at(2) }),
      makeExpense({ categoryId: 'cat-equipment', createdAt: at(3) }),
      makeExpense({ categoryId: 'cat-rent', createdAt: at(4) }),
      makeExpense({ categoryId: 'cat-missing', createdAt: at(5) }),
      makeExpense({ categoryId: 'cat-lpg', amountCents: 125_000, createdAt: at(6) }),
    ]
    expect(repeatSuggestions(recent, withArchived).map((c) => c.categoryId)).toEqual(['cat-lpg'])
  })

  it('honours the limit, including zero', () => {
    const recent = ['cat-ice', 'cat-lpg', 'cat-water'].map((categoryId, i) => makeExpense({ categoryId, createdAt: at(i) }))
    expect(repeatSuggestions(recent, categories, 2)).toHaveLength(2)
    expect(repeatSuggestions(recent, categories, 0)).toEqual([])
    expect(repeatSuggestions([], categories)).toEqual([])
  })
})
