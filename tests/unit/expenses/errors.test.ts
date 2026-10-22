/**
 * Database refusals reach the owner as a sentence that names the real reason,
 * never the catch-all "You don't have access to expenses." for a rule the
 * guard enforces on a person who DOES have access.
 */
import { EXPENSE_MESSAGES, expenseErrorMessage } from '@/lib/expenses/errors'

describe('expenseErrorMessage: the guard rules say what they are', () => {
  it.each([
    // expense_categories_guard (20261022120000_expenses.sql)
    [{ code: '42501', message: 'A starter category keeps its group and note rule' }, EXPENSE_MESSAGES.starterCategoryLocked],
    [{ code: '42501', message: 'This category already has expenses; its group cannot change' }, EXPENSE_MESSAGES.categoryGroupLocked],
    // void_expense on a drawer expense (20261022120100_expenses_rpcs.sql)
    [{ code: '42501', message: "Only the drawer's holder or a cash manager can put cash back" }, EXPENSE_MESSAGES.drawerVoidNotHolder],
  ])('%j', (error, sentence) => {
    expect(expenseErrorMessage(error)).toBe(sentence)
    expect(sentence).not.toBe(EXPENSE_MESSAGES.noAccess)
  })

  it('a plain permission refusal is still "no access"', () => {
    expect(expenseErrorMessage({ code: '42501', message: 'new row violates row-level security policy' })).toBe(EXPENSE_MESSAGES.noAccess)
  })
})
