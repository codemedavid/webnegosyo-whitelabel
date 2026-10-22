import { summarize } from '@/lib/expenses/totals'
import { makeExpense, seededCategories } from './engine-fixtures'

const categories = seededCategories()
const voided = { status: 'void' as const, voidReason: 'x', voidedAt: '2026-10-21T00:00:00Z' }

describe('summarize', () => {
  const expenses = [
    makeExpense({ categoryId: 'cat-ice', amountCents: 12_000, paidFrom: 'drawer', spentOn: '2026-10-20' }),
    makeExpense({ categoryId: 'cat-ice', amountCents: 13_000, paidFrom: 'drawer', spentOn: '2026-10-21' }),
    makeExpense({ categoryId: 'cat-rent', amountCents: 1_500_000, paidFrom: 'bank', spentOn: '2026-10-05' }),
    makeExpense({ categoryId: 'cat-equipment', amountCents: 800_000, paidFrom: 'gcash', spentOn: '2026-10-05' }),
    makeExpense({ categoryId: 'cat-owner_draw', amountCents: 200_000, paidFrom: 'drawer', spentOn: '2026-10-20' }),
    makeExpense({ categoryId: 'cat-lpg', amountCents: 999_999, ...voided }),
  ]
  const summary = summarize(expenses, categories)

  it('counts recorded rows only', () => {
    expect(summary.count).toBe(5)
    expect(summary.totalCents).toBe(12_000 + 13_000 + 1_500_000 + 800_000 + 200_000)
  })

  it('reports operating spend, big purchases and not-an-expense apart', () => {
    expect(summary.operatingCents).toBe(1_525_000)
    expect(summary.capexCents).toBe(800_000)
    expect(summary.notExpenseCents).toBe(200_000)
    expect(summary.operatingCents + summary.capexCents + summary.notExpenseCents).toBe(summary.totalCents)
  })

  it('splits drawer from the other sources', () => {
    expect(summary.drawerCents).toBe(225_000)
    expect(summary.nonDrawerCents).toBe(2_300_000)
    expect(summary.byPaidFrom).toEqual({ drawer: 225_000, cash: 0, gcash: 800_000, maya: 0, bank: 1_500_000, card: 0, owner: 0 })
  })

  it('totals by group with every group present', () => {
    expect(summary.byGroup).toEqual({
      ingredients: 25_000,
      staff: 0,
      occupancy: 1_500_000,
      utilities: 0,
      operating: 0,
      admin: 0,
      other: 0,
      capex: 800_000,
      not_expense: 200_000,
    })
  })

  it('ranks categories by amount, ties by sortOrder', () => {
    expect(summary.byCategory).toEqual([
      { categoryId: 'cat-rent', group: 'occupancy', cents: 1_500_000, count: 1 },
      { categoryId: 'cat-equipment', group: 'capex', cents: 800_000, count: 1 },
      { categoryId: 'cat-owner_draw', group: 'not_expense', cents: 200_000, count: 1 },
      { categoryId: 'cat-ice', group: 'ingredients', cents: 25_000, count: 2 },
    ])
    const tie = summarize(
      [makeExpense({ categoryId: 'cat-water', amountCents: 5 }), makeExpense({ categoryId: 'cat-ice', amountCents: 5 })],
      categories,
    )
    expect(tie.byCategory.map((c) => c.categoryId)).toEqual(['cat-ice', 'cat-water'])
  })

  it('totals by Manila business day, oldest first', () => {
    expect(summary.byDay).toEqual([
      { date: '2026-10-05', cents: 2_300_000, count: 2 },
      { date: '2026-10-20', cents: 212_000, count: 2 },
      { date: '2026-10-21', cents: 13_000, count: 1 },
    ])
  })

  it('files a category it cannot find under Other, so nothing goes missing', () => {
    const lost = summarize([makeExpense({ categoryId: 'cat-deleted', amountCents: 700 })], categories)
    expect(lost.byGroup.other).toBe(700)
    expect(lost.operatingCents).toBe(700)
    expect(lost.byCategory).toEqual([{ categoryId: 'cat-deleted', group: 'other', cents: 700, count: 1 }])
  })

  it('is all zeros for nothing', () => {
    const empty = summarize([], categories)
    expect(empty.totalCents).toBe(0)
    expect(empty.byCategory).toEqual([])
    expect(empty.byDay).toEqual([])
    expect(Object.values(empty.byGroup).every((v) => v === 0)).toBe(true)
  })
})
