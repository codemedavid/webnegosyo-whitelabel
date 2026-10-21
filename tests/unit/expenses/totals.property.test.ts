/**
 * The expense book's numbers must add up to the centavo however they are cut:
 * a Profit screen whose category bars don't sum to its "Expenses" line is one
 * nobody trusts. Void rows are history, never money.
 */
import fc from 'fast-check'
import { summarize } from '@/lib/expenses/totals'
import { EXPENSE_GROUPS, PAID_FROM, type Expense } from '@/lib/expenses/types'
import { propertyParameters } from '../../utils/property'
import { makeExpense, seededCategories } from './engine-fixtures'

const categories = seededCategories()
const categoryIds = [...categories.map((c) => c.id), 'cat-unknown']

const expenseArb: fc.Arbitrary<Expense> = fc
  .record({
    categoryId: fc.constantFrom(...categoryIds),
    amountCents: fc.integer({ min: 1, max: 1_000_000_000 }),
    paidFrom: fc.constantFrom(...PAID_FROM),
    day: fc.integer({ min: 1, max: 28 }),
    isVoid: fc.boolean(),
  })
  .map(({ categoryId, amountCents, paidFrom, day, isVoid }) =>
    makeExpense({
      categoryId,
      amountCents,
      paidFrom,
      spentOn: `2026-10-${String(day).padStart(2, '0')}`,
      ...(isVoid ? { status: 'void' as const, voidReason: 'x', voidedAt: '2026-10-21T00:00:00Z' } : {}),
    }),
  )

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0)

describe('summarize (property)', () => {
  test('every cut adds up to the total exactly', () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 60 }), (expenses) => {
        const s = summarize(expenses, categories)
        const recorded = expenses.filter((e) => e.status === 'recorded')
        expect(s.totalCents).toBe(sum(recorded.map((e) => e.amountCents)))
        expect(sum(s.byCategory.map((c) => c.cents))).toBe(s.totalCents)
        expect(sum(EXPENSE_GROUPS.map((g) => s.byGroup[g]))).toBe(s.totalCents)
        expect(sum(s.byDay.map((d) => d.cents))).toBe(s.totalCents)
        expect(sum(PAID_FROM.map((p) => s.byPaidFrom[p]))).toBe(s.totalCents)
        expect(s.drawerCents + s.nonDrawerCents).toBe(s.totalCents)
        expect(s.operatingCents + s.capexCents + s.notExpenseCents).toBe(s.totalCents)
        expect(sum(s.byCategory.map((c) => c.count))).toBe(recorded.length)
        expect(s.count).toBe(recorded.length)
      }),
      propertyParameters(),
    )
  })

  test('void rows never change any figure', () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 40 }), (expenses) => {
        const recordedOnly = expenses.filter((e) => e.status === 'recorded')
        expect(summarize(expenses, categories)).toEqual(summarize(recordedOnly, categories))
      }),
      propertyParameters(),
    )
  })

  test('order of the input never changes the summary', () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 30 }), (expenses) => {
        expect(summarize([...expenses].reverse(), categories)).toEqual(summarize(expenses, categories))
      }),
      propertyParameters(),
    )
  })
})
