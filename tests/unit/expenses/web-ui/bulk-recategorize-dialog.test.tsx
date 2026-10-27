/**
 * Change category for many rows: one void + replace each, ONE page refresh at
 * the end, the failed rows kept for a retry, and no stock answer carried into
 * a group that never asks it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CATEGORIES, ICE, LPG, TENANT_SLUG, expense } from './ui-fixtures'

const replaceExpenseInBulkAction = jest.fn()
const refresh = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: jest.fn(), push: jest.fn() }) }))
jest.mock('@/app/actions/expenses', () => ({
  replaceExpenseAction: jest.fn(),
  replaceExpenseInBulkAction: (...args: unknown[]) => replaceExpenseInBulkAction(...args),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

const stockedIce = expense({ categoryId: ICE.id, isStockPurchase: true, amountCents: 12_000 })
const plainIce = expense({ categoryId: ICE.id, amountCents: 8_000 })

async function renderDialog(onDone = jest.fn()) {
  const { BulkRecategorizeDialog } = await import('@/components/admin/expenses/bulk-recategorize-dialog')
  render(
    <BulkRecategorizeDialog
      isOpen
      onOpenChange={jest.fn()}
      tenantSlug={TENANT_SLUG}
      expenses={[stockedIce, plainIce]}
      categories={CATEGORIES}
      recentExpenses={[]}
      onDone={onDone}
    />,
  )
  return onDone
}

function moveTo(text: string): void {
  const input = screen.getByRole('combobox', { name: /Move them to/ })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Wrong category' } })
}

beforeEach(() => {
  replaceExpenseInBulkAction.mockReset()
  refresh.mockReset()
})

describe('BulkRecategorizeDialog', () => {
  it('moves each row, clears a stock answer outside Ingredients, and refreshes the page once', async () => {
    replaceExpenseInBulkAction.mockResolvedValue({ ok: true, data: { id: 'new' } })
    const onDone = await renderDialog()

    moveTo('lpg')
    fireEvent.click(screen.getByRole('button', { name: 'Move 2' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith([]))
    expect(replaceExpenseInBulkAction).toHaveBeenCalledWith(TENANT_SLUG, {
      expenseId: stockedIce.id,
      reason: 'Wrong category',
      patch: { categoryId: LPG.id, isStockPurchase: false },
    })
    expect(replaceExpenseInBulkAction).toHaveBeenCalledWith(TENANT_SLUG, { expenseId: plainIce.id, reason: 'Wrong category', patch: { categoryId: LPG.id } })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps the rows that failed selected, so they can be tried again', async () => {
    replaceExpenseInBulkAction
      .mockResolvedValueOnce({ ok: true, data: { id: 'new' } })
      .mockResolvedValueOnce({ ok: false, error: 'That expense was already voided or doesn’t exist.' })
    const onDone = await renderDialog()

    moveTo('lpg')
    fireEvent.click(screen.getByRole('button', { name: 'Move 2' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith([plainIce.id]))
    expect(screen.getByRole('alert')).toHaveTextContent('1 moved, 1 didn’t')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
