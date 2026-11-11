/**
 * The add / fix form as data: what it refuses and what it sends.
 */

import { blankForm, buildDraft, buildDrawerDraft, buildPatch, formFromExpense, validateForm, withDrawer } from '@/components/admin/expenses/expense-form-model'
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

describe("Take from a cashier's drawer", () => {
  const drawer = { shiftId: 'shift-ben', outletId: 'outlet-2' }

  it('picking a drawer pays today, on that drawer\'s branch; picking a source again leaves it', () => {
    const typed = { ...blankForm({ today: '2026-10-21', outletId: null }), spentOn: '2026-10-18' }
    const picked = withDrawer(typed, drawer, '2026-10-21')
    expect(picked).toMatchObject({ drawerShiftId: 'shift-ben', spentOn: '2026-10-21', outletId: 'outlet-2' })
    expect(withDrawer(picked, null, '2026-10-21').drawerShiftId).toBeNull()
  })

  it('sends the drawer, never a date, source or branch, and the stock answer only for Ingredients', () => {
    const state = { ...withDrawer(blankForm({ today: '2026-10-21' }), drawer, '2026-10-21'), categoryId: ICE.id, isStockPurchase: true, note: ' yelo ' }
    expect(buildDrawerDraft(state, 30_000, 'req', ICE)).toEqual({
      shiftId: 'shift-ben', amountCents: 30_000, categoryId: ICE.id, note: 'yelo', supplierId: null, paidToName: null, clientRequestId: 'req', isStockPurchase: true,
    })
    expect(buildDrawerDraft({ ...state, categoryId: LPG.id }, 30_000, 'req', LPG)).not.toHaveProperty('isStockPurchase')
  })

  it('invoice details hidden for a drawer never block its save', () => {
    const state = { ...withDrawer(blankForm({ today: '2026-10-21' }), drawer, '2026-10-21'), amountText: '300', categoryId: LPG.id, supplierTin: '12-34', vatText: '999' }
    expect(validateForm(state, { categoriesById, nowMs: NOW, mode: 'add' }).errors).toEqual({})
    expect(validateForm({ ...state, drawerShiftId: null }, { categoriesById, nowMs: NOW, mode: 'add' }).errors).toHaveProperty('supplierTin')
  })

  it('a fixed expense never starts on a drawer', () => {
    expect(formFromExpense(expense({ paidFrom: 'drawer' })).drawerShiftId).toBeNull()
  })
})
