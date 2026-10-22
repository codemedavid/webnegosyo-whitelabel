/**
 * Old drawer pay-outs: a suggested category from the typed reason, one tap to sort.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CATEGORIES, ICE, TENANT_SLUG, payout } from './ui-fixtures'

const sortDrawerPayoutAction = jest.fn()

jest.mock('@/app/actions/expenses', () => ({
  recordExpenseAction: jest.fn(),
  voidExpenseAction: jest.fn(),
  replaceExpenseAction: jest.fn(),
  updateExpenseDetailsAction: jest.fn(),
  sortDrawerPayoutAction: (...args: unknown[]) => sortDrawerPayoutAction(...args),
  saveCategoryAction: jest.fn(),
  archiveCategoryAction: jest.fn(),
  saveSupplierAction: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

async function renderPanel(payouts = [payout({ reason: 'yelo', amountCents: 12_000 })]) {
  const { UnsortedPayoutsPanel } = await import('@/components/admin/expenses/unsorted-payouts-panel')
  return render(
    <UnsortedPayoutsPanel
      tenantSlug={TENANT_SLUG}
      payouts={payouts}
      categories={CATEGORIES}
      recentExpenses={[]}
      outletNames={new Map()}
      isMultiBranch={false}
      today="2026-10-21"
    />,
  )
}

beforeEach(() => {
  sortDrawerPayoutAction.mockReset()
  sortDrawerPayoutAction.mockResolvedValue({ ok: true, data: { id: 'expense-1' } })
})

describe('UnsortedPayoutsPanel', () => {
  it('suggests Ice (Yelo) for a pay-out typed "yelo" and files it in one tap', async () => {
    const yelo = payout({ reason: 'yelo', amountCents: 12_000 })
    await renderPanel([yelo])

    expect(screen.getByRole('heading', { name: '1 drawer pay-out to sort' })).toBeInTheDocument()
    expect(screen.getByLabelText('120 pesos')).toHaveTextContent('−₱120')
    fireEvent.click(screen.getByRole('button', { name: `Sort as ${ICE.name}` }))

    await waitFor(() =>
      expect(sortDrawerPayoutAction).toHaveBeenCalledWith(TENANT_SLUG, { movementId: yelo.movementId, categoryId: ICE.id, note: 'yelo' }),
    )
    expect(await screen.findByText('Every drawer pay-out is sorted.')).toBeInTheDocument()
  })

  it('offers no guess for a staff first name, only “Choose…”', async () => {
    await renderPanel([payout({ reason: 'Ana' })])

    expect(screen.getByText('No guess from this note')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Sort as/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose…' })).toBeInTheDocument()
  })

  it('keeps the pay-out listed and says why when sorting is refused', async () => {
    sortDrawerPayoutAction.mockResolvedValueOnce({ ok: false, error: 'You don’t have access to expenses.' })
    await renderPanel()

    fireEvent.click(screen.getByRole('button', { name: `Sort as ${ICE.name}` }))

    expect(await screen.findByText('You don’t have access to expenses.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 drawer pay-out to sort' })).toBeInTheDocument()
  })
})
