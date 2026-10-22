/**
 * "Make it a bill?" — categories the owner already pays like a bill (contract §3).
 */
import { suggestBills } from '@/lib/expenses/bill-suggestions'
import { TODAY } from './bill-fixtures'
import { makeExpense, seededCategories } from './engine-fixtures'

describe('suggestBills', () => {
  const categories = seededCategories()
  const spent = (categoryId: string, spentOn: string, amountCents = 1_500_000) => makeExpense({ categoryId, spentOn, amountCents })

  test('suggests a category paid in 2 of the last 3 full months', () => {
    const expenses = [spent('cat-rent', '2026-07-05'), spent('cat-rent', '2026-09-07', 1_600_000)]
    expect(suggestBills(expenses, categories, [], TODAY)).toEqual([
      { categoryId: 'cat-rent', typicalDay: 6, typicalCents: 1_550_000, monthsSeen: 2 },
    ])
  })

  test('takes the median day and amount', () => {
    const expenses = [
      spent('cat-internet', '2026-07-14', 159_900),
      spent('cat-internet', '2026-08-15', 159_900),
      spent('cat-internet', '2026-09-20', 199_900),
    ]
    expect(suggestBills(expenses, categories, [], TODAY)).toEqual([
      { categoryId: 'cat-internet', typicalDay: 15, typicalCents: 159_900, monthsSeen: 3 },
    ])
  })

  test('one month, or this month, is not enough', () => {
    const expenses = [spent('cat-rent', '2026-09-05'), spent('cat-rent', '2026-10-05'), spent('cat-rent', '2026-06-05')]
    expect(suggestBills(expenses, categories, [], TODAY)).toEqual([])
  })

  test('ingredients and "not an expense" categories are never bills', () => {
    const expenses = ['2026-07-05', '2026-08-05', '2026-09-05'].flatMap((day) => [spent('cat-ice', day), spent('cat-owner_draw', day)])
    expect(suggestBills(expenses, categories, [], TODAY)).toEqual([])
  })

  test('a category with an active or paused bill is left out; an ended bill does not count', () => {
    const expenses = ['2026-08-05', '2026-09-05'].flatMap((day) => [spent('cat-rent', day), spent('cat-water', day), spent('cat-lpg', day)])
    const bills = [
      { categoryId: 'cat-rent', status: 'active' as const },
      { categoryId: 'cat-water', status: 'paused' as const },
      { categoryId: 'cat-lpg', status: 'ended' as const },
    ]
    expect(suggestBills(expenses, categories, bills, TODAY).map((s) => s.categoryId)).toEqual(['cat-lpg'])
  })

  test('void rows and archived categories are ignored', () => {
    const archived = categories.map((c) => (c.id === 'cat-water' ? { ...c, archivedAt: '2026-10-01T00:00:00Z' } : c))
    const expenses = [
      makeExpense({ categoryId: 'cat-rent', spentOn: '2026-08-05', status: 'void' }),
      spent('cat-rent', '2026-09-05'),
      spent('cat-water', '2026-08-05'),
      spent('cat-water', '2026-09-05'),
    ]
    expect(suggestBills(expenses, archived, [], TODAY)).toEqual([])
  })

  test('everyday spending is not a bill', () => {
    const days = ['07', '08', '09'].flatMap((month) => ['01', '02', '03'].map((day) => `2026-${month}-${day}`))
    expect(suggestBills(days.map((day) => spent('cat-transport', day, 5_000)), categories, [], TODAY)).toEqual([])
  })

  test('newest first, at most three', () => {
    const keys = ['cat-rent', 'cat-water', 'cat-internet', 'cat-repairs']
    const expenses = keys.flatMap((key, index) => [spent(key, '2026-08-01'), spent(key, `2026-09-1${index}`)])
    expect(suggestBills(expenses, categories, [], TODAY).map((s) => s.categoryId)).toEqual([
      'cat-repairs',
      'cat-internet',
      'cat-water',
    ])
  })
})
