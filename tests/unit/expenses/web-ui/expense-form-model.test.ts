/**
 * The add / fix form as data: what it refuses and what it sends.
 */

import { blankForm, buildDraft, buildPatch, formFromExpense, validateForm } from '@/components/admin/expenses/expense-form-model'
import { CATEGORIES, ICE, LPG, expense } from './ui-fixtures'

const categoriesById = new Map(CATEGORIES.map((category) => [category.id, category]))
const NOW = Date.parse('2026-10-21T04:00:00.000Z')

describe('the stock answer belongs to Ingredients only', () => {
  it('a new expense outside Ingredients never says it went into stock, even if answered before switching', () => {
    const state = { ...blankForm({ today: '2026-10-21' }), categoryId: LPG.id, isStockPurchase: true }
    expect(buildDraft(state, 125_000, 'req', LPG).isStockPurchase).toBe(false)
    expect(buildDraft({ ...state, categoryId: ICE.id }, 125_000, 'req', ICE).isStockPurchase).toBe(true)
  })

  it('fixing a stocked Ingredients row into another group clears the stock answer', () => {
    const stocked = expense({ categoryId: ICE.id, isStockPurchase: true })
    const state = { ...formFromExpense(stocked), categoryId: LPG.id }
    expect(buildPatch(stocked, state, stocked.amountCents, LPG)).toEqual({ categoryId: LPG.id, isStockPurchase: false })
  })
})

describe('Fix keeps an old date it did not change', () => {
  const old = expense({ categoryId: LPG.id, spentOn: '2025-01-15' })

  it('accepts a row older than 400 days when its date is left alone', () => {
    const state = { ...formFromExpense(old), note: 'Petron', reason: 'add note' }
    expect(validateForm(state, { categoriesById, nowMs: NOW, mode: 'fix', originalSpentOn: old.spentOn }).errors.spentOn).toBeUndefined()
  })

  it('still refuses moving it to another too-old date', () => {
    const state = { ...formFromExpense(old), spentOn: '2025-01-14', reason: 'date' }
    expect(validateForm(state, { categoriesById, nowMs: NOW, mode: 'fix', originalSpentOn: old.spentOn }).errors.spentOn).toMatch(/400 days/)
  })
})
